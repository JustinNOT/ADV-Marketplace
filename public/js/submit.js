// public/js/submit.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('driverForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate image client-side to match server limits (5MB, images only)
    const fileInput = form.querySelector('#image');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const f = fileInput.files[0];
      if (f.size > 5 * 1024 * 1024) {
        alert('Image too large (max 5MB). Please pick a smaller file.');
        return;
      }
      // Allow common image/*; if you want HEIC, we can handle that server-side separately
      if (!f.type || !f.type.startsWith('image/')) {
        alert('Only image files are allowed.');
        return;
      }
    }

    // Build FormData to ensure multipart/form-data
    const fd = new FormData(form);

    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        body: fd,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok:false, error:text }; }

      if (!res.ok || !data?.ok) {
        const msg = (data && data.error) ? data.error : `Upload failed (HTTP ${res.status})`;
        alert(msg);
        return;
      }

      alert('Thanks! Your submission was received.');
      form.reset();
    } catch (err) {
      console.error('Submit error', err);
      alert('Network or server error submitting the form.');
    }
  });
});
