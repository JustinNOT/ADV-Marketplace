const form = document.getElementById("driverForm");
let submitting = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return;
  submitting = true;

  const fd = new FormData(form);

  // Ensure monthlyRate is NOT sent (field was removed from HTML, but belt & suspenders)
  fd.delete("monthlyRate");

  // normalize checkbox boolean
  fd.delete("allowLocationTracking");
  fd.append(
    "allowLocationTracking",
    document.getElementById("allowLocationTracking").checked ? "true" : "false"
  );

  try {
    const res = await fetch("/api/drivers", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(data);
      alert("Validation failed. Please check your inputs.");
      submitting = false;
      return;
    }
    alert("Thanks! Your application was received and is awaiting approval.");
    window.location.href = "/index.html";
  } catch (err) {
    console.error(err);
    alert("Something went wrong. Try again.");
    submitting = false;
  }
});
