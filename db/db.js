const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Railway's PostgreSQL
});

// Initialize database tables
const initializeDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS water_level (
        id SERIAL PRIMARY KEY,
        level_cm INTEGER NOT NULL,
        trend TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        min_level INTEGER,
        max_level INTEGER
      );

      CREATE TABLE IF NOT EXISTS device_status (
        id SERIAL PRIMARY KEY,
        cpu_percent INTEGER NOT NULL,
        mem_percent INTEGER NOT NULL,
        disk_percent INTEGER NOT NULL,
        battery INTEGER,
        temperature INTEGER,
        uptime_seconds INTEGER,
        ip_address TEXT,
        wifi_strength INTEGER,
        status TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS device_logs (
        id SERIAL PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        metadata JSONB
      );
    `);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Initialize database on startup
initializeDatabase().catch(console.error);

module.exports = { pool, initializeDatabase };