const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const { z } = require("zod");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 5173;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const DATA_PATH = path.join(__dirname, "data", "drivers.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- uploads ----------
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, "img_" + nanoid(10) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image uploads are allowed"));
  },
});

// ---------- data helpers ----------
function ensureDataFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify([], null, 2));
  }
}
ensureDataFile();

function readDrivers() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch (e) {
    console.error("Failed to read drivers.json:", e);
    return [];
  }
}
function writeDrivers(list) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Failed to write drivers.json:", e);
  }
}

// ---------- validation ----------
const driverSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5).optional().default(""),
  city: z.string().min(1),
  province: z.string().min(1),
  country: z.string().min(1),
  postalCode: z.string().optional().default(""),
  carMake: z.string().min(1),
  carModel: z.string().min(1),
  carYear: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: z.string().optional().default(""),
  seats: z.coerce.number().int().min(1).max(9).optional().default(5),
  weeklyMileage: z.coerce.number().min(0),
  avgDailyDrivingHours: z.coerce.number().min(0).optional().default(0),
  typicalRoutes: z.string().optional().default(""),
  availability: z.string().optional().default(""),
  adPlacementOptions: z.array(z.string()).optional().default([]),
  vehicleCondition: z.string().optional().default(""),
  restrictions: z.string().optional().default(""),
  allowLocationTracking: z.coerce.boolean().optional().default(false),
  monthlyRate: z.coerce.number().min(0).optional().default(50),
  imageUrl: z.string().optional().default(""), // will hold /uploads/<file>
  socialLinks: z
    .object({
      instagram: z.string().optional().default(""),
      tiktok: z.string().optional().default(""),
    })
    .optional()
    .default({ instagram: "", tiktok: "" }),
  notes: z.string().optional().default(""),
});

// ---------- API ----------
app.get("/api/drivers", (req, res) => {
  let drivers = readDrivers();

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

  if (city) drivers = drivers.filter(d => d.city.toLowerCase() === String(city).toLowerCase());
  if (province) drivers = drivers.filter(d => d.province.toLowerCase() === String(province).toLowerCase());
  if (make) drivers = drivers.filter(d => d.carMake.toLowerCase().includes(String(make).toLowerCase()));
  if (model) drivers = drivers.filter(d => d.carModel.toLowerCase().includes(String(model).toLowerCase()));
  if (minWeeklyMileage) drivers = drivers.filter(d => Number(d.weeklyMileage || 0) >= Number(minWeeklyMileage));
  if (maxWeeklyMileage) drivers = drivers.filter(d => Number(d.weeklyMileage || 0) <= Number(maxWeeklyMileage));
  if (minYear) drivers = drivers.filter(d => Number(d.carYear || 0) >= Number(minYear));
  if (maxYear) drivers = drivers.filter(d => Number(d.carYear || 0) <= Number(maxYear));
  if (minRate) drivers = drivers.filter(d => Number(d.monthlyRate || 0) >= Number(minRate));
  if (maxRate) drivers = drivers.filter(d => Number(d.monthlyRate || 0) <= Number(maxRate));
  if (placement) {
    const wanted = String(placement).toLowerCase();
    drivers = drivers.filter(
      d => Array.isArray(d.adPlacementOptions) && d.adPlacementOptions.some(p => String(p).toLowerCase().includes(wanted))
    );
  }

  const dir = (String(sortDir || "asc").toLowerCase() === "desc") ? -1 : 1;
  switch ((sortBy || "").toLowerCase()) {
    case "city": drivers.sort((a,b) => a.city.localeCompare(b.city) * dir); break;
    case "mileage": drivers.sort((a,b) => (Number(a.weeklyMileage||0) - Number(b.weeklyMileage||0)) * dir); break;
    case "year": drivers.sort((a,b) => (Number(a.carYear||0) - Number(b.carYear||0)) * dir); break;
    case "rate": drivers.sort((a,b) => (Number(a.monthlyRate||0) - Number(b.monthlyRate||0)) * dir); break;
    case "latest": drivers.sort((a,b) => (new Date(a.createdAt) - new Date(b.createdAt)) * dir); break;
    default: drivers.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  res.json({ count: drivers.length, drivers });
});

// Create driver (multipart form + image upload)
app.post("/api/drivers", upload.single("image"), (req, res) => {
  const body = { ...req.body };

  // placements from checkboxes -> array -> schema field
  if (body.placement) {
    body.adPlacementOptions = Array.isArray(body.placement) ? body.placement : [body.placement];
  }

  // normalize boolean
  body.allowLocationTracking =
    body.allowLocationTracking === true ||
    body.allowLocationTracking === "true" ||
    body.allowLocationTracking === "on";

  // attach uploaded image path as public URL
  if (req.file) {
    body.imageUrl = `/uploads/${req.file.filename}`;
  }

  // social links from simple fields
  body.socialLinks = {
    instagram: body.ig || "",
    tiktok: body.tiktok || "",
  };
  delete body.ig;
  delete body.tiktok;
  delete body.placement;

  const parsed = driverSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const all = readDrivers();
  const entry = { id: "drv_" + nanoid(8), createdAt: new Date().toISOString(), ...parsed.data };
  all.push(entry);
  writeDrivers(all);
  res.status(201).json(entry);
});

// Static frontend
app.use(express.static(PUBLIC_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`AdVehicles Marketplace running on http://localhost:${PORT}`);
});
