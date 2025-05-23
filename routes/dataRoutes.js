const express = require("express");
const router = express.Router();
const db = require("../db/db");

router.post("/water-level", (req, res) => {
  const { level_cm, trend, timestamp, min_level, max_level } = req.body;

  const stmt = db.prepare(`
    INSERT INTO water_level (level_cm, trend, timestamp, min_level, max_level)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(level_cm, trend, timestamp, min_level, max_level);

  res.sendStatus(200);
});

router.post("/device-status", (req, res) => {
  const {
    cpu_percent, mem_percent, disk_percent, battery, temperature,
    uptime_seconds, ip_address, wifi_strength, status, timestamp
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO device_status (
      cpu_percent, mem_percent, disk_percent, battery, temperature,
      uptime_seconds, ip_address, wifi_strength, status, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    cpu_percent, mem_percent, disk_percent, battery, temperature,
    uptime_seconds, ip_address, wifi_strength, status, timestamp
  );

  res.sendStatus(200);
});

// Get current water level
router.get("/water-level/current", (req, res) => {
  const stmt = db.prepare(`
    SELECT * FROM water_level 
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  
  stmt.get((err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(row || { message: "No water level data available" });
  });
});

// Get water level history
router.get("/water-level/history", (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const stmt = db.prepare(`
    SELECT * FROM water_level 
    WHERE timestamp >= datetime('now', ?)
    ORDER BY timestamp DESC
  `);
  
  stmt.all(`-${days} days`, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows || []);
  });
});

// Get latest device status
router.get("/device-status", (req, res) => {
  const stmt = db.prepare(`
    SELECT * FROM device_status 
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  
  stmt.get((err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(row || { message: "No device status data available" });
  });
});

// Stubbed weather endpoints
router.get("/weather/current", (req, res) => {
  res.json({
    message: "Weather endpoint not implemented",
    status: "stubbed"
  });
});

router.get("/weather/forecast", (req, res) => {
  res.json({
    message: "Weather forecast endpoint not implemented",
    status: "stubbed"
  });
});

module.exports = router;
