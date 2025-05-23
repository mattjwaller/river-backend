const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS water_level (
        id SERIAL PRIMARY KEY,
        level_cm REAL,
        trend TEXT,
        timestamp TIMESTAMP WITH TIME ZONE,
        min_level REAL,
        max_level REAL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS device_status (
        id SERIAL PRIMARY KEY,
        cpu_percent REAL,
        mem_percent REAL,
        disk_percent REAL,
        battery REAL,
        temperature REAL,
        uptime_seconds INTEGER,
        ip_address TEXT,
        wifi_strength INTEGER,
        status TEXT,
        timestamp TIMESTAMP WITH TIME ZONE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS device_logs (
        id SERIAL PRIMARY KEY,
        level TEXT,
        message TEXT,
        source TEXT,
        timestamp TIMESTAMP WITH TIME ZONE,
        metadata JSONB
      )
    `);
  } finally {
    client.release();
  }
};

// Initialize database on startup
initializeDatabase().catch(console.error);

module.exports = pool;