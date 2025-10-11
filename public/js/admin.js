// public/js/admin.js
document.addEventListener('DOMContentLoaded', () => {
  const $  = (s, p=document) => p.querySelector(s);

  // Debug helper
  const debugBox = $('#debug');
  const dbg = (msg, obj) => {
    if (!debugBox) return;
    debugBox.textContent = typeof obj === 'undefined' ? msg : (msg + '\n' + JSON.stringify(obj, null, 2));
    try { console.log(msg, obj || ''); } catch {}
  };

  // Basic Auth state
  let auth = sessionStorage.getItem('adv_admin_auth') || '';
  function setAuth(u,p,remember) {
    auth = 'Basic ' + btoa(`${u}:${p}`);
    if (remember) sessionStorage.setItem('adv_admin_auth', auth);
  }
  function clearAuth() { auth=''; sessionStorage.removeItem('adv_admin_auth'); }

  // Raw & JSON fetchers with Authorization
  // Raw & JSON fetchers with Authorization  ✅ add anti-popup headers here
async function apiRaw(path, opts = {}) {
  // Always include our auth + "no native auth" headers on EVERY call
  const baseHeaders = {
    ...(auth ? { Authorization: auth } : {}),
    "X-Use-Native-Auth": "0",      // <-- prevents server from sending WWW-Authenticate
    "X-Requested-With": "fetch"    // optional, makes it obvious it's XHR/fetch
  };

  const res = await fetch(path, {
    ...opts,
    headers: { ...baseHeaders, ...(opts.headers || {}) }
  });

  const text = await res.text().catch(() => "");
  return { res, text };
}

async function apiJSON(path, opts = {}) {
  const { res, text } = await apiRaw(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("429 Too Many Requests — admin API limit.");
    if (res.status === 401) throw new Error("401 Unauthorized — credentials not accepted.");
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  try { return JSON.parse(text || "{}"); } catch { return text; }
}

async function apiGET(path) {
  const { res, text } = await apiRaw(path);
  if (!res.ok) {
    if (res.status === 429) throw new Error("429 Too Many Requests — admin API limit.");
    if (res.status === 401) throw new Error("401 Unauthorized — credentials not accepted.");
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  try { return JSON.parse(text || "{}"); } catch { return text; }
}


  // DOM refs
  const loginView = $('#login');
  const appView   = $('#app');
  const countEl   = $('#count');
  const listEl    = $('#list');
  const statusFilter = $('#statusFilter');
  const loginErr  = $('#loginErr');

  // Show app
  async function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    await loadDrivers();
  }

  // Try existing auth
  (async () => {
    if (!auth) return;
    const { res, text } = await apiRaw('/api/admin/ping');
    dbg('Startup /ping', { status: res.status, body: text });
    if (res.ok) await showApp();
    else clearAuth();
  })();

  // Sign-in (NO FORM SUBMIT → NO REFRESH)
  $('#signin').addEventListener('click', async () => {
    loginErr.textContent = '';
    const u = $('#user').value.trim();
    const p = $('#pass').value;
    const remember = $('#remember').checked;
    if (!u || !p) { loginErr.textContent = 'Enter user & password'; return; }

    setAuth(u,p,remember);
    const { res, text } = await apiRaw('/api/admin/ping');
    dbg('Login /ping', { status: res.status, body: text });
    if (res.ok) await showApp();
    else { clearAuth(); loginErr.textContent = 'Invalid credentials (or server not running).'; }
  });

  $('#signout').addEventListener('click', () => { clearAuth(); location.reload(); });
  $('#refresh').addEventListener('click', loadDrivers);
  statusFilter.addEventListener('change', loadDrivers);

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function driverCard(d) {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div>
          <strong>${escapeHtml(d.name)}</strong>
          <div class="muted">${escapeHtml(d.email)} • ${escapeHtml(d.city)}, ${escapeHtml(d.province)}</div>
          <div class="muted">${d.carYear} ${escapeHtml(d.carMake)} ${escapeHtml(d.carModel)} • mileage ${Number(d.weeklyMileage||0)}</div>
          <div class="muted">Status: <span class="pill">${d.status}</span> Created: ${new Date(d.createdAt).toLocaleString()}</div>
          ${d.approvedAt ? `<div class="muted">Approved: ${new Date(d.approvedAt).toLocaleString()}</div>` : ''}
        </div>
        <div>${d.imageUrl ? `<img class="thumb" src="${d.imageUrl}" alt="car" />` : ''}</div>
      </div>

      <div class="row" style="margin-top:10px">
        <label>Monthly Rate ($): <input type="number" min="0" max="1000" step="1" id="price_${d.id}" value="${Number(d.monthlyRate||0)}" style="width:120px"></label>
        <button class="ok"   id="btn_set_${d.id}"         type="button">Set price</button>
        <button class="ok"   id="btn_setapprove_${d.id}"  type="button">Set price & Approve</button>
        <button class="warn" id="btn_approve_${d.id}"     type="button" ${d.status==='approved'?'disabled':''}>Approve</button>
        <button class="danger" id="btn_reject_${d.id}"    type="button" ${d.status==='rejected'?'disabled':''}>Reject</button>
        <button class="danger" id="btn_delete_${d.id}"    type="button">Delete</button>
      </div>
    `;

    // actions
    wrap.querySelector(`#btn_set_${d.id}`)?.addEventListener('click', async () => {
      try {
        const v = Number((wrap.querySelector(`#price_${d.id}`).value||'0').trim());
        if (!(v >= 0 && v <= 1000)) return alert('Enter a price between 0 and 1000');
        const { res, text } = await apiRaw(`/api/admin/drivers/${d.id}/price`, {
          method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ monthlyRate: v })
        });
        dbg('Set price', { id: d.id, status: res.status, body: text });
        if (!res.ok) {
          if (res.status === 404) alert('Server missing route: POST /api/admin/drivers/:id/price');
          else alert(`Price failed: ${res.status} ${text}`);
        } else {
          await loadDrivers();
        }
      } catch (e) { alert(e.message); }
    });

    wrap.querySelector(`#btn_setapprove_${d.id}`)?.addEventListener('click', async () => {
      try {
        const v = Number((wrap.querySelector(`#price_${d.id}`).value||'0').trim());
        if (!(v >= 0 && v <= 1000)) return alert('Enter a price between 0 and 1000');
        let r = await apiRaw(`/api/admin/drivers/${d.id}/price`, {
          method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ monthlyRate: v })
        });
        dbg('Set price (before approve)', { id: d.id, status: r.res.status, body: r.text });
        if (!r.res.ok) return alert(`Price failed: ${r.res.status} ${r.text}`);

        r = await apiRaw(`/api/admin/drivers/${d.id}/approve`, { method: 'POST' });
        dbg('Approve (after price)', { id: d.id, status: r.res.status, body: r.text });
        if (!r.res.ok) return alert(`Approve failed: ${r.res.status} ${r.text}`);
        alert('Approved. If mail is configured, the email will include the monthly rate.');
        await loadDrivers();
      } catch (e) { alert(e.message); }
    });

    wrap.querySelector(`#btn_approve_${d.id}`)?.addEventListener('click', async () => {
      const { res, text } = await apiRaw(`/api/admin/drivers/${d.id}/approve`, { method:'POST' });
      dbg('Approve', { id: d.id, status: res.status, body: text });
      if (!res.ok) return alert(`Approve failed: ${res.status} ${text}`);
      await loadDrivers();
    });

    wrap.querySelector(`#btn_reject_${d.id}`)?.addEventListener('click', async () => {
      if (!confirm('Reject this driver?')) return;
      const { res, text } = await apiRaw(`/api/admin/drivers/${d.id}/reject`, { method:'POST' });
      dbg('Reject', { id: d.id, status: res.status, body: text });
      if (!res.ok) return alert(`Reject failed: ${res.status} ${text}`);
      await loadDrivers();
    });

    wrap.querySelector(`#btn_delete_${d.id}`)?.addEventListener('click', async () => {
      if (!confirm('Delete permanently?')) return;
      const { res, text } = await apiRaw(`/api/admin/drivers/${d.id}`, { method:'DELETE' });
      dbg('Delete', { id: d.id, status: res.status, body: text });
      if (!res.ok) return alert(`Delete failed: ${res.status} ${text}`);
      await loadDrivers();
    });

    return wrap;
  }

  async function loadDrivers() {
    try {
      const status = statusFilter.value || 'pending';
      const data = await apiGET(`/api/admin/drivers?status=${encodeURIComponent(status)}`);
      dbg('List drivers', { statusFilter: status, count: data.count });
      listEl.innerHTML = '';
      $('#count').textContent = `${data.count} result(s)`;
      data.drivers.forEach(d => listEl.appendChild(driverCard(d)));
    } catch (e) {
      listEl.innerHTML = '';
      $('#count').textContent = '';
      dbg('List error', { error: e.message });
      listEl.innerHTML = `<div class="muted">Auth failed or API error: ${String(e.message)}</div>`;
    }
  }

  // Sign-in click (again to ensure no submit)
  // (kept separate from above to be explicit)
  $('#signin').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
});
