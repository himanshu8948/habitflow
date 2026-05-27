require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-before-deploy";
const FRONTEND_DIR = path.join(__dirname, "habit-tracker");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(FRONTEND_DIR));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

async function initDb() {
  if (!pool) {
    console.warn("DATABASE_URL is not set. API routes will return 503 until Postgres is configured.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: "Database is not configured." });
  next();
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token." });
  }
}

function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateAppData(data) {
  return data
    && typeof data === "object"
    && Object.prototype.hasOwnProperty.call(data, "ht_profile")
    && Object.prototype.hasOwnProperty.call(data, "ht_settings")
    && Object.prototype.hasOwnProperty.call(data, "ht_habits")
    && Object.prototype.hasOwnProperty.call(data, "ht_completions")
    && Array.isArray(data.ht_habits)
    && typeof data.ht_completions === "object";
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, database: Boolean(pool) });
});

app.post("/api/auth/register", requireDb, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!validateEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );
    const user = result.rows[0];
    await pool.query("INSERT INTO user_data (user_id, data) VALUES ($1, $2)", [user.id, {}]);
    res.status(201).json({ token: signToken(user), user });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email already registered." });
    console.error(error);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/auth/login", requireDb, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const result = await pool.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
});

app.get("/api/me", requireDb, auth, async (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

app.get("/api/sync", requireDb, auth, async (req, res) => {
  const result = await pool.query("SELECT data, updated_at FROM user_data WHERE user_id = $1", [req.user.id]);
  res.json(result.rows[0] || { data: {}, updated_at: null });
});

app.put("/api/sync", requireDb, auth, async (req, res) => {
  const data = req.body.data;
  if (!validateAppData(data)) return res.status(400).json({ error: "Invalid HabitFlow data." });
  const result = await pool.query(
    `INSERT INTO user_data (user_id, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
     RETURNING updated_at`,
    [req.user.id, data]
  );
  res.json({ ok: true, updated_at: result.rows[0].updated_at });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HabitFlow running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
