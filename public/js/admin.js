// public/js/admin.js
(function () {
  const $ = (s) => document.querySelector(s);
  const rows = $("#rows"),
    statusSel = $("#statusSel"),
    refreshBtn = $("#refreshBtn"),
    q = $("#q"),
    clearQ = $("#clearQ"),
    loginBtn = $("#loginBtn"),
    logoutBtn = $("#logoutBtn"),
    verifyBtn = $("#verifyBtn"),
    testEmailBtn = $("#testEmailBtn"),
    loginStatus = $("#loginStatus"),
    panel = $("#panel"),
    flashBox = $("#flash"),
    mailInfo = $("#mailInfo");

  const AUTH_KEY = "adminAuth";

  function flash(msg, isErr = false) {
    if (!flashBox) return;
    flashBox.textContent = msg;
    flashBox.style.color = isErr ? "#ffb4b4" : "#A9B0BF";
    flashBox.style.opacity = "1";
    setTimeout(() => (flashBox.style.opacity = "0.75"), 1500);
  }

  function setAuth(user, pass) {
    sessionStorage.setItem(AUTH_KEY, btoa(unescape(encodeURIComponent(user + ":" + pass))));
  }
  function clearAuth() { sessionStorage.removeItem(AUTH_KEY); }
  function authHeader() {
    const t = sessionStorage.getItem(AUTH_KEY);
    return t ? { Authorization: "Basic " + t } : {};
  }
  function showPanel(show) { panel.classList.toggle("hidden", !show); }

  async function ping() {
    try { const r = await fetch("/api/admin/ping", { headers: authHeader() }); return r.ok; }
    catch { return false; }
  }

  async function list(status) {
    const r = await fetch("/api/admin/drivers?status=" + encodeURIComponent(status), { headers: authHeader() });
    if (!r.ok) throw new Error("Auth or fetch failed (" + r.status + ")");
    return r.json();
  }

  async function act(id, action) {
    const method = action === "delete" ? "DELETE" : "POST";
    let url = "";
    if (action === "approve") url = `/api/admin/drivers/${id}/approve`;
    else if (action === "reject") url = `/api/admin/drivers/${id}/reject`;
    else url = `/api/admin/drivers/${id}`;
    return fetch(url, { method, headers: authHeader() });
  }

  function rowHTML(d) {
    const placements = (d.adPlacementOptions || []).join(" · ") || "—";
    return `
      <tr data-id="${d.id}">
        <td>${d.imageUrl ? `<img class="thumb" src="${d.imageUrl}" alt="car">` : "—"}</td>
        <td>
          <div><strong>${d.name}</strong> <span class="pill">${d.status}</span></div>
          <div class="muted">${d.carYear} ${d.carMake} ${d.carModel} • ${d.color || "-"} • seats ${d.seats || "-"}</div>
          <div class="muted">Mileage: ${d.weeklyMileage} km/wk • Rate: $${d.monthlyRate}/mo</div>
          <div class="muted">Also visits: ${(d.otherCities||[]).join(", ") || "—"}</div>
        </td>
        <td><div>${d.city}, ${d.province}</div><div class="muted">${d.country}</div></td>
        <td>${placements}</td>
        <td>
          <div class="muted">Created: ${new Date(d.createdAt).toLocaleString()}</div>
          ${d.approvedAt ? `<div class="muted">Approved: ${new Date(d.approvedAt).toLocaleString()}</div>` : ""}
        </td>
        <td>
          <div class="inline">
            <button data-action="approve" type="button">Approve</button>
            <button data-action="reject" type="button" class="ghost">Reject</button>
            <button data-action="delete" type="button" class="danger">Delete</button>
          </div>
        </td>
      </tr>`;
  }

  function applySearchFilter(items) {
    const term = q.value.trim().toLowerCase();
    if (!term) return items;
    return items.filter((d) => {
      const hay = [
        d.name, d.city, d.province, d.country, d.carMake, d.carModel, d.typicalRoutes, (d.otherCities || []).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }

  async function render() {
    try {
      const status = statusSel.value;
      const { drivers } = await list(status);
      const filtered = applySearchFilter(drivers);
      rows.innerHTML = filtered.map(rowHTML).join("") || `<tr><td colspan="6" class="muted">No drivers found.</td></tr>`;
    } catch (e) {
      rows.innerHTML = `<tr><td colspan="6" class="muted">Auth failed or API error.</td></tr>`;
    }
  }

  // login/logout
  loginBtn.addEventListener("click", async () => {
    const user = $("#u").value.trim();
    const pass = $("#p").value;
    if (!user || !pass) return alert("Enter username and password");
    setAuth(user, pass);
    const ok = await ping();
    if (ok) { loginStatus.textContent = "Logged in"; showPanel(true); await render(); }
    else { clearAuth(); loginStatus.textContent = "Login failed"; showPanel(false); }
  });
  logoutBtn.addEventListener("click", () => { clearAuth(); loginStatus.textContent = "Logged out"; showPanel(false); rows.innerHTML = ""; });

  // list interactions
  refreshBtn?.addEventListener("click", render);
  statusSel?.addEventListener("change", render);
  q?.addEventListener("input", render);
  clearQ?.addEventListener("click", () => { q.value = ""; render(); });

  // approve/reject/delete
  rows.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const tr = e.target.closest("tr");
    const id = tr?.dataset?.id;
    const action = btn.dataset.action;
    if (!id || !action) return;

    try {
      if (action === "delete" && !confirm("Delete this entry?")) return;
      const r = await act(id, action);
      let payload = {};
      try { payload = await r.clone().json(); } catch {}
      if (!r.ok) {
        const txt = await r.text().catch(()=> "");
        throw new Error(`HTTP ${r.status} ${txt}`);
      }
      if (action === "approve") flash(`Approved ${id}. (Check server log for mail result)`);
      if (action === "delete") flash(`Deleted ${id}`);
      if (action === "reject") flash(`Rejected ${id}`);
      await render();
    } catch (err) {
      flash(`Action failed: ${err.message}`, true);
    }
  });

  // mailer debug buttons
  verifyBtn?.addEventListener("click", async () => {
    try {
      const confRes = await fetch("/api/admin/mailer-config", { headers: authHeader() });
      const conf = await confRes.json();
      mailInfo.classList.remove("hidden");
      mailInfo.textContent = JSON.stringify(conf, null, 2);
      const r = await fetch("/api/admin/mailer-verify", { headers: authHeader() });
      const j = await r.json();
      flash(j.ok ? "Mailer verify OK" : "Mailer verify failed", !j.ok);
    } catch (e) {
      flash("Mailer verify error: " + e.message, true);
    }
  });

  testEmailBtn?.addEventListener("click", async () => {
    try {
      const r = await fetch("/api/admin/mailer-test", { method: "POST", headers: authHeader() });
      const j = await r.json().catch(() => ({}));
      flash(j.ok ? "Test email sent" : "Test email failed: " + (j.error || r.status), !j.ok);
    } catch (e) {
      flash("Test email error: " + e.message, true);
    }
  });

  // auto-restore session
  (async () => {
    const has = !!sessionStorage.getItem(AUTH_KEY);
    if (has && (await ping())) { loginStatus.textContent = "Logged in"; showPanel(true); render(); }
    else { clearAuth(); loginStatus.textContent = ""; showPanel(false); }
  })();
})();
