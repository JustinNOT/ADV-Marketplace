// public/js/listings.js
(function () {
  const $ = (s) => document.querySelector(s);
  const cards = $("#cards");
  const resultsMeta = $("#resultsMeta");

  const PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>
         <rect width='100%' height='100%' fill='#0f1118'/>
         <text x='50%' y='50%' font-family='Arial,Helvetica,sans-serif' font-size='36' fill='#A9B0BF' text-anchor='middle' dominant-baseline='middle'>No photo</text>
       </svg>`
    );

  function norm(url) {
    if (!url) return PLACEHOLDER;
    const u = url.startsWith("/") ? url : "/" + url.replace(/^\/+/, "");
    return u || PLACEHOLDER;
  }

  function cityOptionsFrom(drivers) {
    const set = new Set();
    drivers.forEach((d) => d.city && set.add(d.city));
    return ["", ...Array.from(set).sort()];
  }

  function pill(text) {
    return `<span style="border:1px solid #262a36;border-radius:999px;padding:2px 8px;font-size:12px;color:#A9B0BF;background:#0f1118">${text}</span>`;
  }

  function cardHTML(d) {
    const title = `${d.carYear} ${d.carMake} ${d.carModel}`;
    const imgSrc = norm(d.imageUrl);
    const placements = (d.adPlacementOptions || []).join(" · ") || "—";
    const location = `${d.city}${d.province ? ", " + d.province : ""}`;
    const also = (d.otherCities || []).join(", ");
    return `
      <article class="card">
        <img src="${imgSrc}" alt="${d.carMake} ${d.carModel}"
             style="width:100%;height:200px;object-fit:cover;background:#0f1118;border-top-left-radius:12px;border-top-right-radius:12px"
             onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/>
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <h3 style="margin:0">${title}</h3>
            ${pill(location)}
          </div>

          <p class="muted">Weekly mileage: ${Number(d.weeklyMileage || 0)} km • Rate: $${Number(d.monthlyRate || 0)}/mo</p>
          ${d.typicalRoutes ? `<p>${d.typicalRoutes}</p>` : ""}

          ${also ? `<p><span class="muted">Also visits:</span> ${also}</p>` : ""}

          <div class="two-col">
            <div>
              <div class="muted">Color</div><div>${d.color || "-"}</div>
              <div class="muted" style="margin-top:8px">Placements</div><div>${placements}</div>
            </div>
            <div>
              <div class="muted">Seats</div><div>${d.seats || "-"}</div>
              <div class="muted" style="margin-top:8px">Restrictions</div><div>${d.restrictions || "—"}</div>
            </div>
          </div>

          <button class="btn" data-select="${d.id}">Select</button>
          <div class="leadbox" id="lead_${d.id}" style="display:none;margin-top:10px;border:1px solid #262a36;border-radius:10px;padding:10px;background:#0f1118">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input type="text" placeholder="Your name" id="ln_${d.id}" style="flex:1;min-width:180px" />
              <input type="email" placeholder="Your email" id="le_${d.id}" style="flex:1;min-width:220px" />
              <input type="text" placeholder="Company (optional)" id="lc_${d.id}" style="flex:1;min-width:180px" />
            </div>
            <textarea id="lt_${d.id}" rows="2" placeholder="Notes (brief campaign idea, timing, etc.)" style="margin-top:8px;width:100%"></textarea>
            <div style="margin-top:8px;display:flex;gap:8px">
              <button class="btn" data-send="${d.id}">Send</button>
              <button class="ghost" data-cancel="${d.id}">Cancel</button>
            </div>
            <div class="muted" id="ls_${d.id}" style="margin-top:6px"></div>
          </div>
        </div>
      </article>
    `;
  }

  function renderCards(list) {
    resultsMeta.textContent = `${list.length} driver${list.length !== 1 ? "s" : ""} found`;
    cards.innerHTML = list.map(cardHTML).join("") || "";
  }

  function applyToURL() {
    const params = new URLSearchParams();
    const g = (id) => (document.getElementById(id)?.value || "");
    const f = [
      ["city","fCity"],["province","fProvince"],["make","fMake"],["model","fModel"],
      ["minYear","fMinYear"],["maxYear","fMaxYear"],["minWeeklyMileage","fMinMiles"],["maxWeeklyMileage","fMaxMiles"],
      ["minRate","fMinRate"],["maxRate","fMaxRate"],["placement","fPlacement"]
    ];
    f.forEach(([k, id]) => { const v = g(id); if (v) params.set(k, v); });
    const [sortBy, sortDir] = String(g("fSort") || "latest:desc").split(":");
    if (sortBy) params.set("sortBy", sortBy); if (sortDir) params.set("sortDir", sortDir);
    const q = params.toString();
    history.replaceState(null, "", q ? "?" + q : location.pathname);
    return q;
  }

  async function load() {
    const query = location.search.replace(/^\?/, "");
    const res = await fetch("/api/drivers" + (query ? "?" + query : ""));
    const data = await res.json();
    const drivers = data.drivers || [];
    renderCards(drivers);

    const fCity = $("#fCity");
    if (fCity && fCity.options.length <= 1) {
      const opts = cityOptionsFrom(drivers);
      fCity.innerHTML = opts.map((c) => `<option value="${c}">${c || "All"}</option>`).join("");
      const urlCity = new URLSearchParams(location.search).get("city") || "";
      fCity.value = urlCity;
    }
  }

  $("#applyBtn")?.addEventListener("click", async () => { applyToURL(); await load(); });
  $("#resetBtn")?.addEventListener("click", async () => {
    history.replaceState(null, "", location.pathname);
    ["fProvince","fMake","fModel","fMinYear","fMaxYear","fMinMiles","fMaxMiles","fMinRate","fMaxRate"].forEach(id=>{
      const el = document.getElementById(id); if(el) el.value = "";
    });
    const fPlacement = $("#fPlacement"); if (fPlacement) fPlacement.value = "";
    const fSort = $("#fSort"); if (fSort) fSort.value = "latest:desc";
    await load();
  });

  cards.addEventListener("click", async (e) => {
    const sel = e.target.closest("[data-select]");
    const send = e.target.closest("[data-send]");
    const cancel = e.target.closest("[data-cancel]");
    if (sel) {
      const id = sel.getAttribute("data-select");
      document.getElementById("lead_" + id).style.display = "block";
      sel.style.display = "none";
    } else if (cancel) {
      const id = cancel.getAttribute("data-cancel");
      document.getElementById("lead_" + id).style.display = "none";
      const btn = cards.querySelector(`[data-select="${id}"]`); if (btn) btn.style.display = "";
    } else if (send) {
      const id = send.getAttribute("data-send");
      const name = document.getElementById("ln_" + id).value.trim();
      const email = document.getElementById("le_" + id).value.trim();
      const company = document.getElementById("lc_" + id).value.trim();
      const notes = document.getElementById("lt_" + id).value.trim();
      const status = document.getElementById("ls_" + id);
      if (!name || !email) { status.textContent = "Please enter your name and email."; return; }
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: id, clientName: name, clientEmail: email, company, notes })
      });
      const ok = r.ok;
      status.textContent = ok ? "Thanks! We’ll reach out shortly." : "Could not submit. Try again.";
      if (ok) setTimeout(() => {
        document.getElementById("lead_" + id).style.display = "none";
        const btn = cards.querySelector(`[data-select="${id}"]`); if (btn) btn.style.display = "";
      }, 1200);
    }
  });

  document.addEventListener("DOMContentLoaded", load);
})();
