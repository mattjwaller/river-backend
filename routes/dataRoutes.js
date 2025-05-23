const express = require("express");
const router = express.Router();
const db = require("../db/db");

router.post("/water-level", async (req, res) => {
  const { level_cm, trend, timestamp, min_level, max_level } = req.body;
  console.log("POST /water-level request received:", req.body);

  // Validate required fields
  if (level_cm === undefined || trend === undefined || timestamp === undefined) {
    console.error("Missing required fields in /water-level request:", req.body);
    return res.status(500).json({ error: "Missing required fields" });
  }

  try {
    await db.pool.query(
      `INSERT INTO water_level (level_cm, trend, timestamp, min_level, max_level)
       VALUES ($1, $2, $3, $4, $5)`,
      [level_cm, trend, timestamp, min_level, max_level]
    );
    console.log("Water level data saved successfully:", { level_cm, trend, timestamp });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error saving water level:', err);
    res.status(500).json({ error: "Failed to save water level" });
  }
});

router.post("/device-status", async (req, res) => {
  const {
    cpu_percent, mem_percent, disk_percent, battery, temperature,
    uptime_seconds, ip_address, wifi_strength, status, timestamp
  } = req.body;
  console.log("POST /device-status request received:", req.body);

  // Validate required fields
  if (cpu_percent === undefined || mem_percent === undefined || 
      disk_percent === undefined || status === undefined || timestamp === undefined) {
    console.error("Missing required fields in /device-status request:", req.body);
    return res.status(500).json({ error: "Missing required fields" });
  }

  try {
    await db.pool.query(
      `INSERT INTO device_status (
        cpu_percent, mem_percent, disk_percent, battery, temperature,
        uptime_seconds, ip_address, wifi_strength, status, timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cpu_percent, mem_percent, disk_percent, battery, temperature,
        uptime_seconds, ip_address, wifi_strength, status, timestamp
      ]
    );
    console.log("Device status data saved successfully:", { cpu_percent, mem_percent, status });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error saving device status:', err);
    res.status(500).json({ error: "Failed to save device status" });
  }
});

// Get current water level
router.get("/water-level/current", async (req, res) => {
  console.log("GET /water-level/current request received");
  try {
    const result = await db.pool.query(
      `SELECT * FROM water_level 
       ORDER BY timestamp DESC 
       LIMIT 1`
    );
    
    if (result.rows.length === 0) {
      console.log("No water level data available");
      return res.json({ message: "No water level data available" });
    }
    
    console.log("Water level data retrieved:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching water level:', err);
    res.status(500).json({ error: "Failed to fetch water level" });
  }
});

// Get water level history
router.get("/water-level/history", (req, res) => {
  const days = parseInt(req.query.days) || 30;
  console.log("GET /water-level/history request received, days:", days);
  const stmt = db.prepare(`
    SELECT * FROM water_level 
    WHERE timestamp >= datetime('now', ?)
    ORDER BY timestamp DESC
  `);
  
  stmt.all(`-${days} days`, (err, rows) => {
    if (err) {
      console.error("Error fetching water level history:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Water level history retrieved, count:", rows.length);
    res.json(rows || []);
  });
});

// Get latest device status
router.get("/device-status", async (req, res) => {
  console.log("GET /device-status request received");
  try {
    const result = await db.pool.query(
      `SELECT * FROM device_status 
       ORDER BY timestamp DESC 
       LIMIT 1`
    );
    
    if (result.rows.length === 0) {
      console.log("No device status data available");
      return res.json({ message: "No device status data available" });
    }
    
    console.log("Device status data retrieved:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching device status:', err);
    res.status(500).json({ error: "Failed to fetch device status" });
  }
});

// Stubbed weather endpoints
router.get("/weather/current", (req, res) => {
  console.log("GET /weather/current request received");
  res.json({
    message: "Weather endpoint not implemented",
    status: "stubbed"
  });
});

router.get("/weather/forecast", (req, res) => {
  console.log("GET /weather/forecast request received");
  res.json({
    message: "Weather forecast endpoint not implemented",
    status: "stubbed"
  });
});

// Log endpoints
router.post("/logs", async (req, res) => {
  const { level, message, source, metadata } = req.body;
  const timestamp = req.body.timestamp || new Date().toISOString();
  console.log("POST /logs request received:", req.body);

  // Validate required fields
  if (level === undefined || message === undefined || source === undefined) {
    console.error("Missing required fields in /logs request:", req.body);
    return res.status(500).json({ error: "Missing required fields" });
  }

  try {
    await db.pool.query(
      `INSERT INTO device_logs (level, message, source, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [level, message, source, timestamp, metadata]
    );
    console.log("Log data saved successfully:", { level, message, source });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error saving log:', err);
    res.status(500).json({ error: "Failed to save log" });
  }
});

// Get recent logs with optional filtering
router.get("/logs", async (req, res) => {
  const { level, source } = req.query;
  let limit = parseInt(req.query.limit, 10);
  let offset = parseInt(req.query.offset, 10);
  if (isNaN(limit) || limit < 1) limit = 100;
  if (isNaN(offset) || offset < 0) offset = 0;
  console.log("GET /logs request received, filters:", { level, source, limit, offset });

  try {
    let query = `SELECT * FROM device_logs WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (level) {
      query += ` AND level = $${paramCount}`;
      params.push(level);
      paramCount++;
    }

    if (source) {
      query += ` AND source = $${paramCount}`;
      params.push(source);
      paramCount++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.pool.query(query, params);
    console.log("Logs retrieved, count:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// Get log statistics
router.get("/logs/stats", async (req, res) => {
  console.log("GET /logs/stats request received");
  try {
    const result = await db.pool.query(`
      SELECT 
        level,
        COUNT(*) as count,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM device_logs
      GROUP BY level
    `);
    console.log("Log statistics retrieved:", result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching log stats:', err);
    res.status(500).json({ error: "Failed to fetch log statistics" });
  }
});

module.exports = router;
