// server.js
const express = require("express");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto"); // ← replace nanoid with crypto
const { z } = require("zod");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5173;
const NODE_ENV = process.env.NODE_ENV || "production";
const isProd = NODE_ENV === "production";

// --- tiny id helper (replaces nanoid) ---
const rid = (len = 10) =>
  crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);

// ---------- security ----------
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.set("trust proxy", 1);

// ---------- parsers ----------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- Queryable rate limits ----------
const GLOBAL_RATE_WINDOW_MS = Number(process.env.GLOBAL_RATE_WINDOW_MS ?? 60_000);
const GLOBAL_RATE_MAX = Number(process.env.GLOBAL_RATE_MAX ?? (isProd ? 300 : 10_000));
const ADMIN_RATE_WINDOW_MS = Number(process.env.ADMIN_RATE_WINDOW_MS ?? 300_000);
const ADMIN_RATE_MAX = Number(process.env.ADMIN_RATE_MAX ?? (isProd ? 200 : 5_000));

const globalLimiter = rateLimit({
  windowMs: GLOBAL_RATE_WINDOW_MS,
  max: GLOBAL_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ---------- paths & persistence ----------
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "drivers.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.log");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads");
const LEGACY_UPLOAD_DIR = path.join(ROOT, "uploads");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LEGACY_UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf8");

// ---------- health probe ----------
app.get("/healthz", (_req, res) => {
  try {
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "DATA_DIR not writable" });
  }
});

// ---------- helpers ----------
const readDrivers = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
const writeDrivers = (list) => fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
const audit = (entry) =>
  fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
const mask = (s) => {
  if (!s) return "";
  const str = String(s);
  const at = str.indexOf("@");
  if (at > 1) return str[0] + "***" + str.slice(at - 1);
  return str.slice(0, 2) + "***";
};

// ---------- uploads (serve both old & new) ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(null, "img_" + rid(10) + path.extname(file.originalname || "").toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype?.startsWith("image/") ? cb(null, true) : cb(new Error("Only images allowed")),
});
app.use("/uploads", express.static(LEGACY_UPLOAD_DIR, { index: false }));
app.use("/uploads", express.static(UPLOAD_DIR, { index: false }));

async function processUploadInPlace(absPath) {
  const tmp = absPath + ".tmp";
  await sharp(absPath)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(tmp);
  fs.renameSync(tmp, absPath);
}

// ---------- validation ----------
const MAX = {
  NAME: 80,
  EMAIL: 254,
  PHONE: 40,
  CITY: 40,
  PROVINCE: 40,
  COUNTRY: 56,
  POSTAL: 12,
  MAKE: 40,
  MODEL: 40,
  COLOR: 24,
  VEHCOND: 120,
  RESTRICT: 120,
  ROUTES: 500,
  AVAIL: 500,
  NOTES: 1000,
  SOCIAL: 100,
};

const sReq = (n) => z.string().trim().min(1).max(n);
const sOpt = (n) => z.string().trim().max(n).optional().default("");
const nRange = (a, b) => z.coerce.number().min(a).max(b);

const driverSchema = z.object({
  name: sReq(MAX.NAME),
  email: sReq(MAX.EMAIL).email(),
  phone: sOpt(MAX.PHONE),

  city: sReq(MAX.CITY),
  province: sReq(MAX.PROVINCE),
  country: sReq(MAX.COUNTRY),
  postalCode: sOpt(MAX.POSTAL),
  otherCities: z.array(z.string().trim().max(MAX.CITY)).max(10).optional().default([]),

  carMake: sReq(MAX.MAKE),
  carModel: sReq(MAX.MODEL),
  carYear: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: sOpt(MAX.COLOR),
  seats: z.coerce.number().int().min(1).max(9).optional().default(5),

  weeklyMileage: nRange(0, 5000),
  avgDailyDrivingHours: z.coerce.number().min(0).max(24).optional().default(0),

  // form can send 0; you hide it on public form and set from admin UI
  monthlyRate: z.coerce.number().min(0).max(1000).optional().default(0),

  typicalRoutes: sOpt(MAX.ROUTES),
  availability: sOpt(MAX.AVAIL),
  vehicleCondition: sOpt(MAX.VEHCOND),
  restrictions: sOpt(MAX.RESTRICT),
  notes: sOpt(MAX.NOTES),

  allowLocationTracking: z.boolean().optional().default(false),
  adPlacementOptions: z.array(z.string()).max(10).optional().default([]),

  imageUrl: sOpt(2048),
  socialLinks: z
    .object({
      instagram: sOpt(MAX.SOCIAL),
      tiktok: sOpt(MAX.SOCIAL),
    })
    .optional()
    .default({ instagram: "", tiktok: "" }),
});

const leadSchema = z.object({
  driverId: z.string().min(1),
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  company: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

// ---------- public submit limiter ----------
const postLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- admin auth ----------
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const [scheme, b64] = auth.split(" ");
  const user = (process.env.ADMIN_USER || "").trim();
  const pass = (process.env.ADMIN_PASS || "").trim();

  // Only show native browser prompt if caller explicitly asks for it.
  // Our admin UI will NOT ask for it.
  const wantBrowserPrompt = req.get("x-use-native-auth") === "1";

  function send401(msg) {
    if (wantBrowserPrompt) {
      res.set("WWW-Authenticate", 'Basic realm="AdVehicles Admin"');
    }
    return res.status(401).send(msg);
  }

  if (scheme !== "Basic" || !b64) return send401("Auth required");

  const [u, p] = Buffer.from(b64, "base64").toString().split(":");
  if (u === user && p === pass) return next();

  return send401("Invalid credentials");
}

// ---------- admin rate limit (env-driven) ----------
const adminLimiter = rateLimit({
  windowMs: ADMIN_RATE_WINDOW_MS,
  max: ADMIN_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

// apply limiter+auth to all admin routes
app.use("/api/admin", requireAdmin, adminLimiter);

// ---------- email (Nodemailer) ----------
let mailer = null;
function getMailer() {
  if (mailer !== null) return mailer;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_DEBUG } = process.env;
  const configured = !!(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
  if (!configured) {
    console.warn("[MAIL] Not configured; emails will be skipped.");
    mailer = false;
    return mailer;
  }
  const debug = String(SMTP_DEBUG || "") === "1";
  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_PORT) === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    logger: debug,
    debug: debug,
  });
  console.log(
    `[MAIL] Transport ready host=${SMTP_HOST} port=${SMTP_PORT} secure=${String(SMTP_PORT) === "465"} user=${mask(
      SMTP_USER
    )} debug=${debug}`
  );
  return mailer;
}

async function sendApprovedEmail(driver) {
  const tx = getMailer();
  if (!tx) {
    console.log("[MAIL] Skipped (not configured)");
    return;
  }
  const from = process.env.SMTP_FROM || `AdVehicles <${process.env.SMTP_USER}>`;
  const to = driver.email;
  const subject = "Your AdVehicles listing is approved ✅";
  const priceLine =
    Number(driver.monthlyRate || 0) > 0
      ? `<p>Your agreed monthly rate is <strong>$${Number(driver.monthlyRate).toFixed(0)}/month</strong>.</p>`
      : "";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
      <h2>You're live!</h2>
      <p>Hi ${driver.name.split(" ")[0] || "there"}, your <strong>${driver.carYear} ${driver.carMake} ${
    driver.carModel
  }</strong> listing is now visible.</p>
      ${priceLine}
      <p>— AdVehicles</p>
    </div>`;

  try {
    console.log("[MAIL] verify/connect…");
    await tx.verify();
    const info = await tx.sendMail({ from, to, subject, html });
    console.log("✅ [MAIL] Approval queued -> messageId:", info?.messageId || "(no id)", "to:", mask(to));
  } catch (e) {
    console.error("❌ [MAIL] Approval send error:", e.message);
  }
}

// ---------- PUBLIC API ----------
app.get("/api/drivers", (req, res) => {
  let drivers = readDrivers().filter((d) => d.status === "approved");

  const {
    city,
    province,
    make,
    model,
    minWeeklyMileage,
    maxWeeklyMileage,
    minYear,
    maxYear,
    minRate,
    maxRate,
    placement,
    sortBy,
    sortDir,
  } = req.query;

  if (city) drivers = drivers.filter((d) => d.city.toLowerCase() === String(city).toLowerCase());
  if (province) drivers = drivers.filter((d) => d.province.toLowerCase() === String(province).toLowerCase());
  if (make) drivers = drivers.filter((d) => d.carMake.toLowerCase().includes(String(make).toLowerCase()));
  if (model) drivers = drivers.filter((d) => d.carModel.toLowerCase().includes(String(model).toLowerCase()));
  if (minWeeklyMileage) drivers = drivers.filter((d) => Number(d.weeklyMileage || 0) >= Number(minWeeklyMileage));
  if (maxWeeklyMileage) drivers = drivers.filter((d) => Number(d.weeklyMileage || 0) <= Number(maxWeeklyMileage));
  if (minYear) drivers = drivers.filter((d) => Number(d.carYear || 0) >= Number(minYear));
  if (maxYear) drivers = drivers.filter((d) => Number(d.carYear || 0) <= Number(maxYear));
  if (minRate) drivers = drivers.filter((d) => Number(d.monthlyRate || 0) >= Number(minRate));
  if (maxRate) drivers = drivers.filter((d) => Number(d.monthlyRate || 0) <= Number(maxRate));
  if (placement) {
    const wanted = String(placement).toLowerCase();
    drivers = drivers.filter(
      (d) =>
        Array.isArray(d.adPlacementOptions) &&
        d.adPlacementOptions.some((p) => String(p).toLowerCase().includes(wanted))
    );
  }

  const dir = String(sortDir || "asc").toLowerCase() === "desc" ? -1 : 1;
  switch ((sortBy || "").toLowerCase()) {
    case "city":
      drivers.sort((a, b) => a.city.localeCompare(b.city) * dir);
      break;
    case "mileage":
      drivers.sort((a, b) => (Number(a.weeklyMileage || 0) - Number(b.weeklyMileage || 0)) * dir);
      break;
    case "year":
      drivers.sort((a, b) => (Number(a.carYear || 0) - Number(b.carYear || 0)) * dir);
      break;
    case "rate":
      drivers.sort((a, b) => (Number(a.monthlyRate || 0) - Number(b.monthlyRate || 0)) * dir);
      break;
    case "latest":
      drivers.sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)) * dir);
      break;
    default:
      drivers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  res.json({ count: drivers.length, drivers });
});

// Create driver (status=pending)
app.post("/api/drivers", postLimiter, upload.single("image"), async (req, res) => {
  try {
    const body = { ...req.body };

    // Honeypot
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return res.status(400).json({ error: "Bot suspected" });
    }
    delete body.website;

    // Normalize placement → adPlacementOptions
    if (body.placement) {
      body.adPlacementOptions = Array.isArray(body.placement) ? body.placement : [body.placement];
    }

    // Coerce checkbox
    body.allowLocationTracking =
      body.allowLocationTracking === true ||
      body.allowLocationTracking === "true" ||
      body.allowLocationTracking === "on";

    // Uploaded image → process then set URL
    if (req.file) {
      const abs = path.join(UPLOAD_DIR, req.file.filename);
      try {
        await processUploadInPlace(abs);
      } catch (imgErr) {
        console.error("Upload processing failed:", imgErr);
        return res.status(400).json({ error: "Invalid image upload" });
      }
      body.imageUrl = `/uploads/${req.file.filename}`;
    }

    // Social links nesting
    body.socialLinks = { instagram: body.ig || "", tiktok: body.tiktok || "" };

    // otherCities: "a,b,c" → ["a","b","c"]
    if (typeof body.otherCities === "string") {
      body.otherCities = body.otherCities.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (!Array.isArray(body.otherCities)) {
      body.otherCities = [];
    }

    // Remove temp fields
    delete body.ig;
    delete body.tiktok;
    delete body.placement;

    // Validate
    const parsed = driverSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    // Persist
    const all = readDrivers();
    const entry = {
      id: "drv_" + rid(8),
      createdAt: new Date().toISOString(),
      status: "pending",
      ...parsed.data,
    };
    all.push(entry);
    writeDrivers(all);
    audit({ action: "create", id: entry.id, email: entry.email, status: "pending" });

    return res.json({ ok: true, id: entry.id, status: entry.status });
  } catch (e) {
    console.error("Driver submit error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Leads (public "Select")
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2));
const readLeads = () => JSON.parse(fs.readFileSync(LEADS_FILE, "utf8") || "[]");
const writeLeads = (a) => fs.writeFileSync(LEADS_FILE, JSON.stringify(a, null, 2));

app.post("/api/leads", async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid lead", details: parsed.error.flatten() });

  const { driverId, clientName, clientEmail, company, notes } = parsed.data;
  const drivers = readDrivers();
  const driver = drivers.find((d) => d.id === driverId && d.status === "approved");
  if (!driver) return res.status(404).json({ error: "Driver not found or not approved" });

  const leads = readLeads();
  const lead = {
    id: "lead_" + rid(8),
    driverId,
    clientName,
    clientEmail,
    company,
    notes,
    createdAt: new Date().toISOString(),
  };
  leads.push(lead);
  writeLeads(leads);
  audit({ action: "lead_create", leadId: lead.id, driverId });

  const tx = getMailer();
  if (tx) {
    tx.sendMail({
      from: process.env.SMTP_FROM || `AdVehicles <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_NOTIFY_TO || process.env.SMTP_USER,
      subject: `New selection: ${driver.carYear} ${driver.carMake} ${driver.carModel} (${driver.city})`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif">Client: ${clientName} &lt;${clientEmail}&gt; ${
        company ? "• " + company : ""
      }<br/>Driver: ${driver.name} — ${driver.city}, ${driver.province}<br/>Notes: ${notes || "-"}</div>`,
    })
      .then((info) => console.log("📧 [MAIL] Lead emailed (msgId:", info?.messageId || "n/a", ")"))
      .catch((e) => console.error("❌ [MAIL] lead error:", e.message));
  }

  res.status(201).json({ ok: true, id: lead.id });
});

// ---------- ADMIN API ----------
app.get("/api/admin/ping", requireAdmin, (_req, res) => res.json({ ok: true }));

app.get("/api/admin/drivers", requireAdmin, (req, res) => {
  const { status = "all" } = req.query;
  let drivers = readDrivers();
  if (["pending", "approved", "rejected"].includes(status)) drivers = drivers.filter((d) => d.status === status);
  res.json({ count: drivers.length, drivers });
});

// set/update monthlyRate (used by admin UI)
app.post("/api/admin/drivers/:id/price", requireAdmin, (req, res) => {
  const id = req.params.id;
  const all = readDrivers();
  const i = all.findIndex((d) => d.id === id);
  if (i < 0) return res.status(404).json({ error: "Not found" });

  const n = Number(req.body?.monthlyRate);
  if (!Number.isFinite(n) || n < 0 || n > 1000) {
    return res.status(400).json({ error: "monthlyRate must be 0–1000" });
  }

  all[i].monthlyRate = n;
  writeDrivers(all);
  audit({ action: "set_price", id, monthlyRate: n });
  res.json({ ok: true, id, monthlyRate: n });
});

// APPROVE — respond immediately; email in background
app.post("/api/admin/drivers/:id/approve", requireAdmin, async (req, res) => {
  const id = req.params.id;
  console.log("[ADMIN] Approve requested", id);
  const all = readDrivers();
  const i = all.findIndex((d) => d.id === id);
  if (i < 0) return res.status(404).json({ error: "Not found" });

  all[i].status = "approved";
  all[i].approvedAt = new Date().toISOString();
  writeDrivers(all);
  audit({ action: "approve", id });

  res.json({ ok: true }); // reply first

  setTimeout(() => {
    console.log("[ADMIN] Sending approval email (background) for", id);
    sendApprovedEmail(all[i]).catch((e) => console.error("❌ [ADMIN] email bg error:", e.message));
  }, 0);
});

app.post("/api/admin/drivers/:id/reject", requireAdmin, (req, res) => {
  const id = req.params.id;
  const all = readDrivers();
  const i = all.findIndex((d) => d.id === id);
  if (i < 0) return res.status(404).json({ error: "Not found" });
  all[i].status = "rejected";
  writeDrivers(all);
  audit({ action: "reject", id });
  res.json({ ok: true });
});

app.delete("/api/admin/drivers/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const all = readDrivers();
  const i = all.findIndex((d) => d.id === id);
  if (i < 0) return res.status(404).json({ error: "Not found" });

  const removed = all.splice(i, 1)[0];
  writeDrivers(all);

  if (removed?.imageUrl?.startsWith("/uploads/")) {
    const base = path.basename(removed.imageUrl);
    const p1 = path.join(UPLOAD_DIR, base);
    const p2 = path.join(LEGACY_UPLOAD_DIR, base);
    [p1, p2].forEach((p) => {
      if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch (_) {}
    });
  }
  audit({ action: "delete", id });
  res.json({ ok: true });
});

// --- Mailer debug endpoints (require admin) ---
app.get("/api/admin/mailer-verify", requireAdmin, async (_req, res) => {
  const tx = getMailer();
  if (!tx) return res.status(400).json({ ok: false, configured: false });
  try {
    await tx.verify();
    res.json({ ok: true, configured: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/admin/mailer-config", requireAdmin, (_req, res) => {
  const h = process.env.SMTP_HOST || null;
  const p = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const u = process.env.SMTP_USER || "";
  const f = process.env.SMTP_FROM || (process.env.SMTP_USER ? `AdVehicles <${process.env.SMTP_USER}>` : "");
  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    configured,
    host: h,
    port: p,
    secure: String(process.env.SMTP_PORT) === "465",
    userMasked: mask(u),
    fromMasked: f ? f.replace(u, mask(u)) : "",
    debug: String(process.env.SMTP_DEBUG || "") === "1",
  });
});

app.post("/api/admin/mailer-test", requireAdmin, async (_req, res) => {
  try {
    const tx = getMailer();
    if (!tx) return res.status(400).json({ ok: false, configured: false });
    const to = process.env.ADMIN_NOTIFY_TO || process.env.SMTP_USER;
    const info = await tx.sendMail({
      from: process.env.SMTP_FROM || `AdVehicles <${process.env.SMTP_USER}>`,
      to,
      subject: "AdVehicles test email",
      text: `Test email at ${new Date().toISOString()}`,
    });
    console.log("📧 [MAIL] Test email sent (msgId:", info?.messageId || "n/a", ") to:", mask(to));
    res.json({ ok: true, messageId: info?.messageId || null });
  } catch (e) {
    console.error("❌ [MAIL] Test send error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- static ----------
app.use(express.static(PUBLIC_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// ---------- error handler ----------
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
  return res.status(500).send("Server error");
});

// ---------- 404 handler ----------
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
});

app.listen(PORT, () => {
  console.log(`AdVehicles running on http://localhost:${PORT} (${NODE_ENV})`);
  console.log(
    `[DEBUG] Rate limits: GLOBAL ${GLOBAL_RATE_MAX}/${GLOBAL_RATE_WINDOW_MS}ms; ADMIN ${ADMIN_RATE_MAX}/${ADMIN_RATE_WINDOW_MS}ms`
  );
});
