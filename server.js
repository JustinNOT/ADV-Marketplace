const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const { z } = require("zod");

const app = express();
const PORT = process.env.PORT || 5173;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const DATA_PATH = path.join(__dirname, "data", "drivers.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify([], null, 2));
  }
}
ensureDataFile();

function readDrivers() {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(raw);
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

// Validation schema (rich; you can trim later)
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
  imageUrl: z.string().url().optional().or(z.literal("")).default(""),
  socialLinks: z
    .object({
      instagram: z.string().optional().default(""),
      tiktok: z.string().optional().default(""),
    })
    .optional()
    .default({ instagram: "", tiktok: "" }),
  notes: z.string().optional().default("")
});

// ---------- API ----------

// List drivers with simple filters & sorting
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
    sortDir
  } = req.query;

  // filters
  if (city) {
    drivers = drivers.filter(d => d.city.toLowerCase() === String(city).toLowerCase());
  }
  if (province) {
    drivers = drivers.filter(d => d.province.toLowerCase() === String(province).toLowerCase());
  }
  if (make) {
    drivers = drivers.filter(d => d.carMake.toLowerCase().includes(String(make).toLowerCase()));
  }
  if (model) {
    drivers = drivers.filter(d => d.carModel.toLowerCase().includes(String(model).toLowerCase()));
  }
  if (minWeeklyMileage) {
    const v = Number(minWeeklyMileage);
    drivers = drivers.filter(d => Number(d.weeklyMileage || 0) >= v);
  }
  if (maxWeeklyMileage) {
    const v = Number(maxWeeklyMileage);
    drivers = drivers.filter(d => Number(d.weeklyMileage || 0) <= v);
  }
  if (minYear) {
    const v = Number(minYear);
    drivers = drivers.filter(d => Number(d.carYear || 0) >= v);
  }
  if (maxYear) {
    const v = Number(maxYear);
    drivers = drivers.filter(d => Number(d.carYear || 0) <= v);
  }
  if (minRate) {
    const v = Number(minRate);
    drivers = drivers.filter(d => Number(d.monthlyRate || 0) >= v);
  }
  if (maxRate) {
    const v = Number(maxRate);
    drivers = drivers.filter(d => Number(d.monthlyRate || 0) <= v);
  }
  if (placement) {
    const wanted = String(placement).toLowerCase();
    drivers = drivers.filter(d => Array.isArray(d.adPlacementOptions) && d.adPlacementOptions.some(p => p.toLowerCase().includes(wanted)));
  }

  // sorting
  const dir = (String(sortDir || "asc").toLowerCase() === "desc") ? -1 : 1;
  switch ((sortBy || "").toLowerCase()) {
    case "city":
      drivers.sort((a,b) => a.city.localeCompare(b.city) * dir);
      break;
    case "mileage":
      drivers.sort((a,b) => (Number(a.weeklyMileage||0) - Number(b.weeklyMileage||0)) * dir);
      break;
    case "year":
      drivers.sort((a,b) => (Number(a.carYear||0) - Number(b.carYear||0)) * dir);
      break;
    case "rate":
      drivers.sort((a,b) => (Number(a.monthlyRate||0) - Number(b.monthlyRate||0)) * dir);
      break;
    case "latest":
      drivers.sort((a,b) => (new Date(a.createdAt) - new Date(b.createdAt)) * dir);
      break;
    default:
      // default latest DESC
      drivers.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  res.json({ count: drivers.length, drivers });
});

// Create driver
app.post("/api/drivers", (req, res) => {
  const parsed = driverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const driver = parsed.data;
  const all = readDrivers();

  const entry = {
    id: "drv_" + nanoid(8),
    createdAt: new Date().toISOString(),
    ...driver
  };
  all.push(entry);
  writeDrivers(all);
  res.status(201).json(entry);
});

// (Optional) get by id
app.get("/api/drivers/:id", (req,res) => {
  const all = readDrivers();
  const found = all.find(d => d.id === req.params.id);
  if (!found) return res.status(404).json({ error: "Not found" });
  res.json(found);
});

// Serve static frontend
app.use(express.static(PUBLIC_DIR));

// Fallback: serve index for root
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`AdVehicles Marketplace running on http://localhost:${PORT}`);
});