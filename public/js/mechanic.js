// public/js/mechanic.js  (Option A: no persistence; refresh => login)
document.addEventListener('DOMContentLoaded', () => {
  const $  = (s, p=document) => p.querySelector(s);

  const loginView = $('#login');
  const appView = $('#app');
  const userEl = $('#user');
  const passEl = $('#pass');
  const statusEl = $('#status');
  const mechNameEl = $('#mechName');
  const mechSlugEl = $('#mechSlug');
  const countEl = $('#count');
  const listEl = $('#list');

  // Slug derived from path: /{slug}
  const slug = (location.pathname || '/').replace(/^\/|\/$/g,'') || null;
  if (!slug) { statusEl.textContent = 'Missing mechanic slug in URL.'; }

  // ---- NO persistence. In-memory only.
  let auth = '';
  function setAuth(u,p){ auth = 'Basic ' + btoa(`${u}:${p}`); }
  function clearAuth(){ auth = ''; }

  async function api(path, opts={}) {
    const headers = Object.assign({}, opts.headers || {}, auth ? { 'Authorization': auth } : {});
    const url = path + (path.includes('?') ? '&' : '?') + `slug=${encodeURIComponent(slug)}`;
    const res = await fetch(url, Object.assign({ headers }, opts));
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try { return JSON.parse(text); } catch { return text; }
  }

  async function loadMe() {
    const m = await api(`/api/mech/ping`);
    mechNameEl.textContent = m.name || slug;
    mechSlugEl.textContent = `(${slug})`;
  }

  function card(d){
    const img = d.imageUrl ? `<img class="thumb" src="${d.imageUrl}" alt="">` : '';
    const status = `<span class="pill">${d.status || 'pending'}</span>`;
    const cityline = [d.city, d.province, d.country].filter(Boolean).join(', ');
    return `<div class="card">
      <div><strong>${d.name || '(no name)'}</strong> ${status}</div>
      <div class="muted">${d.email || ''} ${d.phone ? ('• '+d.phone) : ''}</div>
      <div class="muted">${cityline}</div>
      ${img}
    </div>`;
  }

  async function loadDrivers() {
    const data = await api(`/api/mech/drivers`);
    countEl.textContent = `${data.count} signups`;
    listEl.innerHTML = (data.drivers || []).map(card).join('');
  }

  // On first load, ALWAYS show login (no auto-login)
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');

  $('#signin').addEventListener('click', async () => {
    try {
      setAuth(userEl.value.trim(), passEl.value.trim());
      await loadMe();
      await loadDrivers();
      statusEl.textContent = '';
      loginView.classList.add('hidden');
      appView.classList.remove('hidden');
    } catch (e) {
      statusEl.textContent = 'Login failed';
      clearAuth();
    }
  });

  $('#signout').addEventListener('click', () => {
    clearAuth();
    // force back to login on sign out
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
    // optional: clear fields
    passEl.value = '';
  });
});
