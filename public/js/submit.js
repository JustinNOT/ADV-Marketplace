const form = document.getElementById("driverForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Build FormData (includes the file input + all named fields)
  const fd = new FormData(form);

  // Normalize checkbox boolean so the server can coerce reliably
  fd.delete("allowLocationTracking");
  fd.append(
    "allowLocationTracking",
    document.getElementById("allowLocationTracking").checked ? "true" : "false"
  );

  try {
    const res = await fetch("/api/drivers", {
      method: "POST",
      body: fd, // no Content-Type header; browser sets multipart boundary
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
