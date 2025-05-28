const express = require("express");
const router = express.Router();
const db = require("../db/db");
const fetch = require("node-fetch");

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
  if (status === undefined || timestamp === undefined) {
    console.error("Missing required fields in /device-status request:", req.body);
    return res.status(500).json({ error: "Missing required fields" });
  }

  try {
    // Convert wifi_strength to integer if it exists
    const wifiStrengthInt = wifi_strength !== undefined ? Math.round(Number(wifi_strength)) : null;

    await db.pool.query(
      `INSERT INTO device_status (
        cpu_percent, mem_percent, disk_percent, battery, temperature,
        uptime_seconds, ip_address, wifi_strength, status, timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cpu_percent, mem_percent, disk_percent, battery, temperature,
        uptime_seconds, ip_address, wifiStrengthInt, status, timestamp
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
router.get("/water-level/history", async (req, res) => {
  console.log("GET /water-level/history request received:", req.query);
  
  try {
    // Parse query parameters
    const { start_date, end_date, range, resolution = 'hourly', limit = 168, offset = 0 } = req.query;
    
    // Calculate date range
    let startDate, endDate;
    if (range) {
      // Parse range like "7d", "30d", "90d"
      const match = /^(\d+)([dhm])$/.exec(range);
      if (!match) {
        return res.status(400).json({ error: 'Invalid range format. Use format like "7d", "30d", "90d"' });
      }
      const [_, num, unit] = match;
      const now = new Date();
      endDate = now;
      if (unit === 'd') startDate = new Date(now - num * 24 * 60 * 60 * 1000);
      else if (unit === 'h') startDate = new Date(now - num * 60 * 60 * 1000);
      else if (unit === 'm') startDate = new Date(now - num * 60 * 1000);
    } else if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      return res.status(400).json({ error: 'Must provide either range or start_date and end_date' });
    }

    // Build the query based on resolution
    let groupBy, selectExtra = '';
    if (resolution === 'daily') {
      groupBy = "DATE_TRUNC('day', timestamp)";
      selectExtra = ", DATE_TRUNC('day', timestamp) as ts";
    } else if (resolution === 'hourly') {
      groupBy = "DATE_TRUNC('hour', timestamp)";
      selectExtra = ", DATE_TRUNC('hour', timestamp) as ts";
    } else if (resolution === '15min') {
      groupBy = "DATE_TRUNC('minute', timestamp - (EXTRACT(MINUTE FROM timestamp) % 15) * interval '1 minute')";
      selectExtra = ", DATE_TRUNC('minute', timestamp - (EXTRACT(MINUTE FROM timestamp) % 15) * interval '1 minute') as ts";
    } else if (resolution === '5min') {
      groupBy = "DATE_TRUNC('minute', timestamp - (EXTRACT(MINUTE FROM timestamp) % 5) * interval '1 minute')";
      selectExtra = ", DATE_TRUNC('minute', timestamp - (EXTRACT(MINUTE FROM timestamp) % 5) * interval '1 minute') as ts";
    } else {
      groupBy = null;
    }

    // Query for the data points
    let dataQuery, dataValues;
    if (groupBy) {
      const truncExpr = resolution === 'daily' ? "DATE_TRUNC('day', timestamp)" : 
                        resolution === 'hourly' ? "DATE_TRUNC('hour', timestamp)" :
                        resolution === '15min' ? "DATE_TRUNC('minute', timestamp - (EXTRACT(MINUTE FROM timestamp) % 15) * interval '1 minute')" :
                        "DATE_TRUNC('minute', timestamp - (EXTRACT(MINUTE FROM timestamp) % 5) * interval '1 minute')";
      dataQuery = `
        SELECT
          ${truncExpr} as ts,
          AVG(level_cm) as level_cm,
          CASE
            WHEN AVG(level_cm) > LAG(AVG(level_cm)) OVER (ORDER BY ${truncExpr}) THEN 'rising'
            WHEN AVG(level_cm) < LAG(AVG(level_cm)) OVER (ORDER BY ${truncExpr}) THEN 'falling'
            ELSE 'stable'
          END as trend
        FROM water_level
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY ${truncExpr}
        ORDER BY ts DESC
        LIMIT $3 OFFSET $4
      `;
      dataValues = [startDate.toISOString(), endDate.toISOString(), limit, offset];
    } else {
      dataQuery = `
        SELECT
          level_cm,
          trend,
          timestamp as ts
        FROM water_level
        WHERE timestamp BETWEEN $1 AND $2
        ORDER BY timestamp DESC
        LIMIT $3 OFFSET $4
      `;
      dataValues = [startDate.toISOString(), endDate.toISOString(), limit, offset];
    }

    // Query for metadata
    const metaQuery = `
      SELECT
        MIN(level_cm) as min_level,
        MAX(level_cm) as max_level,
        AVG(level_cm) as avg_level,
        COUNT(*) as data_points
      FROM water_level
      WHERE timestamp BETWEEN $1 AND $2
    `;

    // Execute queries
    const [dataResult, metaResult] = await Promise.all([
      db.pool.query(dataQuery, dataValues),
      db.pool.query(metaQuery, [startDate.toISOString(), endDate.toISOString()])
    ]);

    // Format the response
    const data = dataResult.rows.map(row => ({
      timestamp: row.ts.toISOString(),
      level_cm: Math.round(row.level_cm),
      trend: row.trend
    }));

    const meta = {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      min_level: Math.round(metaResult.rows[0].min_level),
      max_level: Math.round(metaResult.rows[0].max_level),
      avg_level: Math.round(metaResult.rows[0].avg_level),
      data_points: Number(metaResult.rows[0].data_points)
    };

    console.log("Water level history retrieved:", { dataPoints: data.length, meta });
    res.json({ data, meta });
  } catch (err) {
    console.error('Error fetching water level history:', err);
    res.status(500).json({ error: "Failed to fetch water level history" });
  }
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

    const lastUpdate = new Date(result.rows[0].timestamp);
    const now = new Date();
    const minutesSinceLastUpdate = (now - lastUpdate) / (1000 * 60);

    // If no update in 3 minutes, return offline status
    if (minutesSinceLastUpdate > 3) {
      console.log("Device appears offline - last update was", minutesSinceLastUpdate.toFixed(1), "minutes ago");
      return res.json({
        ...result.rows[0],
        status: "offline",
        cpu_percent: null,
        mem_percent: null,
        disk_percent: null,
        battery: null,
        temperature: null,
        uptime_seconds: null,
        ip_address: null,
        wifi_strength: null,
        last_seen: result.rows[0].timestamp
      });
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
  // Accept both device_id/meta and source/metadata for compatibility
  const level = req.body.level;
  const message = req.body.message;
  const source = req.body.device_id || req.body.source; // prefer device_id if present
  const metadata = req.body.meta || req.body.metadata;  // prefer meta if present
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

// Get Environment Agency flood monitoring data
router.get("/ea-flood-data", async (req, res) => {
  console.log("GET /ea-flood-data request received");
  try {
    // Calculate timestamp for 24 hours ago using current date
    const now = new Date();
    const since = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
    
    // Construct the URL with properly encoded parameters
    const baseUrl = "https://environment.data.gov.uk/flood-monitoring/id/measures/1431TH-level-stage-i-15_min-mASD/readings";
    const params = new URLSearchParams({
      since: since,
      _limit: 1000
    });
    const url = `${baseUrl}?${params.toString()}`;
    
    console.log("Fetching from URL:", url);
    
    // Fetch data from Environment Agency API
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Environment Agency API responded with status: ${response.status}. Response: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Environment Agency flood data retrieved successfully");
    res.json(data);
  } catch (err) {
    console.error('Error fetching Environment Agency flood data:', err);
    res.status(500).json({ error: "Failed to fetch Environment Agency flood data" });
  }
});

module.exports = router;
