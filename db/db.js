const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("data.db");

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS water_level (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_cm REAL,
    trend TEXT,
    timestamp DATETIME,
    min_level REAL,
    max_level REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS device_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cpu_percent REAL,
    mem_percent REAL,
    disk_percent REAL,
    battery REAL,
    temperature REAL,
    uptime_seconds INTEGER,
    ip_address TEXT,
    wifi_strength INTEGER,
    status TEXT,
    timestamp DATETIME
  )`);
});

module.exports = db;