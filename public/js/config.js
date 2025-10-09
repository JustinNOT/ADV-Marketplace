async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("Failed to load config");
    return await res.json();
  } catch (e) {
    console.error(e);
    return null;
  }
}

function setOptions(selectEl, pairs) {
  if (!selectEl) return;
  selectEl.innerHTML = pairs.map(p => `<option value="${p.value}">${p.label}</option>`).join("");
}

function setPlacementSelect(cfg) {
  const sel = document.getElementById("fPlacement");
  if (!sel || !cfg?.adPlacements) return;
  const rows = [{ label: "Any", value: "" }].concat(cfg.adPlacements.map(p => ({ label: p, value: p })));
  setOptions(sel, rows);
}

function setSortOptions(cfg) {
  const sel = document.getElementById("fSort");
  if (!sel || !cfg?.listings?.sortOptions) return;
  setOptions(sel, cfg.listings.sortOptions);
  // default to first option
  if (cfg.listings.sortOptions.length) sel.value = cfg.listings.sortOptions[0].value;
}

function setSubmitFormPlacements(cfg) {
  const host = document.getElementById("placementOptions");
  if (!host || !cfg?.adPlacements) return;
  host.innerHTML = cfg.adPlacements.map(p =>
    `<label><input type="checkbox" name="placement" value="${p}" /> ${p}</label>`
  ).join("");
}

function setSubmitDefaults(cfg) {
  if (!cfg) return;
  const country = document.getElementById("country");
  if (country && cfg.site?.defaultCountry) country.value = cfg.site.defaultCountry;
  const rate = document.getElementById("monthlyRate");
  if (rate && cfg.validation?.defaultMonthlyRate != null) rate.value = cfg.validation.defaultMonthlyRate;
  const year = document.getElementById("carYear");
  if (year) {
    if (cfg.validation?.minYear != null) year.min = cfg.validation.minYear;
    if (cfg.validation?.maxYear != null) year.max = cfg.validation.maxYear;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const cfg = await loadConfig();
  if (!cfg) return;

  // Listings page wiring
  setPlacementSelect(cfg);
  setSortOptions(cfg);

  // Submit page wiring
  setSubmitFormPlacements(cfg);
  setSubmitDefaults(cfg);
});
