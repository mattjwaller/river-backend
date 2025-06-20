const { Pool } = require('pg');
require('dotenv').config();

// Mock database for local development
const mockDb = {
  water_level: [],
  device_status: [],
  device_logs: [],
  device_commands: [],
  query: async (text, params) => {
    console.log('Mock DB Query:', text, params);
    return { rows: [] };
  }
};

// Use mock database in development if DATABASE_URL is not set
const pool = process.env.DATABASE_URL 
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Required for Railway's PostgreSQL
    })
  : mockDb;

// Initialize database tables
const initializeDatabase = async () => {
  // Skip initialization if using mock database
  if (!process.env.DATABASE_URL) {
    console.log('Using mock database for local development');
    return;
  }

  try {
    // First create the tables
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
        cpu_percent INTEGER,
        mem_percent INTEGER,
        disk_percent INTEGER,
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

      CREATE TABLE IF NOT EXISTS device_commands (
        id SERIAL PRIMARY KEY,
        device_id TEXT NOT NULL,
        command TEXT NOT NULL,
        payload JSONB DEFAULT '{}',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP,
        picked_up_at TIMESTAMP,
        result TEXT
      );

      CREATE TABLE IF NOT EXISTS weather_forecast (
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        location_lat DOUBLE PRECISION NOT NULL,
        location_lon DOUBLE PRECISION NOT NULL,
        precipitation_mm DOUBLE PRECISION,
        temperature_c DOUBLE PRECISION,
        pressure_hpa DOUBLE PRECISION,
        wind_speed_mps DOUBLE PRECISION,
        relative_humidity_percent DOUBLE PRECISION,
        symbol_code TEXT,
        forecast_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (timestamp, location_lat, location_lon)
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'weather_forecast' 
          AND column_name = 'relative_humidity_percent'
        ) THEN
          ALTER TABLE weather_forecast 
          ADD COLUMN relative_humidity_percent DOUBLE PRECISION;
        END IF;
      END $$;
    `);
    
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    throw err;
  }
};

// Initialize database on startup
initializeDatabase().catch(console.error);

module.exports = { pool, initializeDatabase };