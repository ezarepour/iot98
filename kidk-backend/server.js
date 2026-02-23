const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";
const DB_PATH = path.join(__dirname, "data", "db.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], payloadByUserId: {} }, null, 2), "utf-8");
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const parsed = JSON.parse(raw || "{}");
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    payloadByUserId: parsed.payloadByUserId && typeof parsed.payloadByUserId === "object"
      ? parsed.payloadByUserId
      : {},
  };
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    mobile: user.mobile,
  };
}

function defaultPayload() {
  return {
    children: [],
    feverSessions: [],
    jaundiceTests: [],
    vaccinationRecords: [],
    growthRecords: [],
    consultations: [],
    remoteMessages: [],
    settings: {
      notificationsEnabled: true,
      notificationChannel: "push",
      apiBaseUrl: `http://localhost:${PORT}`,
    },
  };
}

function generateToken(user) {
  return jwt.sign(
    { sub: user.id, mobile: user.mobile },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "kidk-backend" });
});

app.post("/auth/request-otp", (req, res) => {
  const { mobile } = req.body || {};
  if (!mobile || String(mobile).trim().length < 8) {
    return res.status(400).json({ message: "Mobile is required" });
  }
  return res.json({
    message: "OTP generated for demo environment",
    otpCode: "123456",
  });
});

app.post("/auth/signup", async (req, res) => {
  const {
    firstName,
    lastName,
    mobile,
    password,
    otpCode,
  } = req.body || {};

  if (!firstName || !lastName || !mobile || !password || !otpCode) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  if (String(otpCode) !== "123456") {
    return res.status(400).json({ message: "Invalid OTP code" });
  }

  const db = readDb();
  const exists = db.users.some((u) => u.mobile === String(mobile).trim());
  if (exists) {
    return res.status(409).json({ message: "Mobile already registered" });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = {
    id: randomUUID(),
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    mobile: String(mobile).trim(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  db.payloadByUserId[user.id] = defaultPayload();
  writeDb(db);

  const token = generateToken(user);
  return res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post("/auth/login", async (req, res) => {
  const { mobile, password } = req.body || {};
  if (!mobile || !password) {
    return res.status(400).json({ message: "Mobile and password are required" });
  }
  const db = readDb();
  const user = db.users.find((u) => u.mobile === String(mobile).trim());
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = generateToken(user);
  return res.json({ token, user: sanitizeUser(user) });
});

app.get("/auth/me", requireAuth, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.post("/auth/change-password", requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: "Both old and new password are required" });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ message: "New password is too short" });
  }
  const db = readDb();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const valid = await bcrypt.compare(String(oldPassword), user.passwordHash);
  if (!valid) {
    return res.status(400).json({ message: "Old password is incorrect" });
  }
  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  writeDb(db);
  return res.json({ message: "Password updated successfully" });
});

app.get("/sync", requireAuth, (req, res) => {
  const db = readDb();
  const payload = db.payloadByUserId[req.userId] || defaultPayload();
  return res.json({ payload });
});

app.put("/sync", requireAuth, (req, res) => {
  const incoming = req.body?.payload;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ message: "payload object is required" });
  }

  const normalized = {
    children: Array.isArray(incoming.children) ? incoming.children : [],
    feverSessions: Array.isArray(incoming.feverSessions) ? incoming.feverSessions : [],
    jaundiceTests: Array.isArray(incoming.jaundiceTests) ? incoming.jaundiceTests : [],
    vaccinationRecords: Array.isArray(incoming.vaccinationRecords) ? incoming.vaccinationRecords : [],
    growthRecords: Array.isArray(incoming.growthRecords) ? incoming.growthRecords : [],
    consultations: Array.isArray(incoming.consultations) ? incoming.consultations : [],
    remoteMessages: Array.isArray(incoming.remoteMessages) ? incoming.remoteMessages : [],
    settings: incoming.settings && typeof incoming.settings === "object"
      ? incoming.settings
      : defaultPayload().settings,
  };

  const db = readDb();
  db.payloadByUserId[req.userId] = normalized;
  writeDb(db);
  return res.json({ message: "Synced successfully" });
});

app.get("/doctors", requireAuth, (_req, res) => {
  return res.json({
    doctors: [
      { name: "دکتر احمدی", specialty: "اطفال", fee: 650000, rating: 4.8 },
      { name: "دکتر رضایی", specialty: "نوزادان", fee: 820000, rating: 4.9 },
      { name: "دکتر کریمی", specialty: "عفونی کودکان", fee: 740000, rating: 4.6 },
    ],
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Kidk backend running on http://0.0.0.0:${PORT}`);
});
