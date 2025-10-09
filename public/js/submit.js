const form = document.getElementById("driverForm");

function getPlacements() {
  return Array.from(document.querySelectorAll('input[name="placement"]:checked')).map(el => el.value);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    city: document.getElementById("city").value.trim(),
    province: document.getElementById("province").value.trim(),
    country: document.getElementById("country").value.trim() || "Canada",
    postalCode: document.getElementById("postalCode").value.trim(),
    carMake: document.getElementById("carMake").value.trim(),
    carModel: document.getElementById("carModel").value.trim(),
    carYear: document.getElementById("carYear").value,
    color: document.getElementById("color").value.trim(),
    seats: document.getElementById("seats").value,
    weeklyMileage: document.getElementById("weeklyMileage").value,
    avgDailyDrivingHours: document.getElementById("avgDailyDrivingHours").value,
    typicalRoutes: document.getElementById("typicalRoutes").value.trim(),
    availability: document.getElementById("availability").value.trim(),
    adPlacementOptions: getPlacements(),
    vehicleCondition: document.getElementById("vehicleCondition").value.trim(),
    restrictions: document.getElementById("restrictions").value.trim(),
    allowLocationTracking: document.getElementById("allowLocationTracking").checked,
    monthlyRate: document.getElementById("monthlyRate").value,
    imageUrl: document.getElementById("imageUrl").value.trim(),
    socialLinks: {
      instagram: document.getElementById("ig").value.trim(),
      tiktok: document.getElementById("tiktok").value.trim(),
    },
    notes: document.getElementById("notes").value.trim()
  };

  try {
    const res = await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      alert("Validation failed. Please check your inputs.");
      return;
    }
    alert("Submitted! Your listing is now live.");
    window.location.href = "/index.html";
  } catch (e) {
    console.error(e);
    alert("Something went wrong. Try again.");
  }
});