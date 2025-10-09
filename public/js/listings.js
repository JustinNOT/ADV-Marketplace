const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fCity = $("#fCity");
const fProvince = $("#fProvince");
const fMake = $("#fMake");
const fModel = $("#fModel");
const fMinYear = $("#fMinYear");
const fMaxYear = $("#fMaxYear");
const fMinMiles = $("#fMinMiles");
const fMaxMiles = $("#fMaxMiles");
const fMinRate = $("#fMinRate");
const fMaxRate = $("#fMaxRate");
const fPlacement = $("#fPlacement");
const fSort = $("#fSort");

const applyBtn = $("#applyBtn");
const resetBtn = $("#resetBtn");
const cardsEl = $("#cards");
const resultsMeta = $("#resultsMeta");

function buildQuery() {
  const params = new URLSearchParams();
  if (fCity.value) params.set("city", fCity.value);
  if (fProvince.value) params.set("province", fProvince.value.trim());
  if (fMake.value) params.set("make", fMake.value.trim());
  if (fModel.value) params.set("model", fModel.value.trim());
  if (fMinYear.value) params.set("minYear", fMinYear.value);
  if (fMaxYear.value) params.set("maxYear", fMaxYear.value);
  if (fMinMiles.value) params.set("minWeeklyMileage", fMinMiles.value);
  if (fMaxMiles.value) params.set("maxWeeklyMileage", fMaxMiles.value);
  if (fMinRate.value) params.set("minRate", fMinRate.value);
  if (fMaxRate.value) params.set("maxRate", fMaxRate.value);
  if (fPlacement.value) params.set("placement", fPlacement.value);
  const [sortBy, sortDir] = fSort.value.split(":");
  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);
  return params.toString();
}

async function fetchDrivers() {
  const query = buildQuery();
  const url = `/api/drivers${query ? "?" + query : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch drivers");
  }
  return res.json();
}

function driverCard(d) {
  const img = d.imageUrl ? `<img alt="${d.carMake} ${d.carModel}" src="${d.imageUrl}">`
                         : `<div class="placeholder-img">${d.carMake} ${d.carModel}</div>`;
  const placements = Array.isArray(d.adPlacementOptions) && d.adPlacementOptions.length
    ? d.adPlacementOptions.join(" · ")
    : "—";

  return `
    <article class="card">
      <div class="card-media">${img}</div>
      <div class="card-body">
        <div class="card-title">
          <h3>${d.carYear} ${d.carMake} ${d.carModel}</h3>
          <span class="pill">${d.city}, ${d.province}</span>
        </div>
        <p class="muted">Driver: ${d.name} • Weekly mileage: ${d.weeklyMileage} km • Rate: $${d.monthlyRate}/mo</p>
        <p>${d.typicalRoutes || ""}</p>
        <dl class="specs">
          <div><dt>Color</dt><dd>${d.color || "—"}</dd></div>
          <div><dt>Seats</dt><dd>${d.seats || "—"}</dd></div>
          <div><dt>Placements</dt><dd>${placements}</dd></div>
          <div><dt>Restrictions</dt><dd>${d.restrictions || "—"}</dd></div>
        </dl>
        <div class="card-actions">
          <a class="btn" href="mailto:${d.email}?subject=AdVehicles Inquiry: ${encodeURIComponent(d.carMake + ' ' + d.carModel)}">Contact</a>
        </div>
      </div>
    </article>
  `;
}

function populateCityOptions(drivers) {
  const unique = Array.from(new Set(drivers.map(d => d.city).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const current = fCity.value;
  fCity.innerHTML = `<option value="">All</option>` + unique.map(c => `<option ${c===current?'selected':''} value="${c}">${c}</option>`).join("");
}

async function render() {
  try {
    const { count, drivers } = await fetchDrivers();
    resultsMeta.textContent = `${count} driver${count!==1?'s':''} found`;
    cardsEl.innerHTML = drivers.map(driverCard).join("");
    // Populate city list from *current* result set for convenience
    populateCityOptions(drivers);
  } catch (e) {
    console.error(e);
    cardsEl.innerHTML = `<div class="error">Failed to load listings.</div>`;
  }
}

applyBtn.addEventListener("click", render);
resetBtn.addEventListener("click", () => {
  [fCity, fProvince, fMake, fModel, fMinYear, fMaxYear, fMinMiles, fMaxMiles, fMinRate, fMaxRate, fPlacement].forEach(el => el.value = "");
  fSort.value = "latest:desc";
  render();
});

// Initial load
render();