const form = document.getElementById("driverForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fd = new FormData(form);

  // normalize checkbox boolean
  fd.delete("allowLocationTracking");
  fd.append(
    "allowLocationTracking",
    document.getElementById("allowLocationTracking").checked ? "true" : "false"
  );

  try {
    const res = await fetch("/api/drivers", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      alert("Validation failed. Please check your inputs.");
      return;
    }
    // ⬇️ clearer message
    alert("Thanks! Your application was received and is awaiting approval.");
    window.location.href = "/index.html";
  } catch (e) {
    console.error(e);
    alert("Something went wrong. Try again.");
  }
});
