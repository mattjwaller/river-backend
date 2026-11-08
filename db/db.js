const { Pool } = require('pg');
require('dotenv').config();

// Mock database for local development
const mockDb = {
  water_level: [],
  device_status: [],
  device_logs: [],
  device_commands: [],
  query: async (text, params) => {
    // Local mode intentionally has no persistent storage.
    return { rows: [] };
  }
};

// Use mock database in development if DATABASE_URL is not set
const pool = process.env.DATABASE_URL 
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      options: '-c timezone=UTC',
      ssl: { rejectUnauthorized: false } // Required for Railway's PostgreSQL
    })
  : mockDb;

mockDb.connect = async () => ({ query: mockDb.query, release() {} });

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
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        external_id TEXT PRIMARY KEY,
        last_seen_at TIMESTAMPTZ,
        heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 300 CHECK (heartbeat_interval_seconds > 0)
      );
      INSERT INTO devices(external_id) SELECT DISTINCT device_id FROM device_commands ON CONFLICT DO NOTHING;
      ALTER TABLE water_level ADD COLUMN IF NOT EXISTS device_id TEXT REFERENCES devices(external_id);
      ALTER TABLE device_status ADD COLUMN IF NOT EXISTS device_id TEXT REFERENCES devices(external_id);
      ALTER TABLE device_logs ADD COLUMN IF NOT EXISTS device_id TEXT REFERENCES devices(external_id);
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS requested_by TEXT;
      ALTER TABLE water_level ALTER COLUMN level_cm TYPE DOUBLE PRECISION;
      ALTER TABLE water_level ALTER COLUMN min_level TYPE DOUBLE PRECISION;
      ALTER TABLE water_level ALTER COLUMN max_level TYPE DOUBLE PRECISION;
      ALTER TABLE water_level ADD COLUMN IF NOT EXISTS distance_cm DOUBLE PRECISION;
      ALTER TABLE water_level ADD COLUMN IF NOT EXISTS temperature_c DOUBLE PRECISION;
      ALTER TABLE water_level ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION;
      ALTER TABLE device_status ALTER COLUMN cpu_percent TYPE DOUBLE PRECISION;
      ALTER TABLE device_status ALTER COLUMN mem_percent TYPE DOUBLE PRECISION;
      ALTER TABLE device_status ALTER COLUMN disk_percent TYPE DOUBLE PRECISION;
      ALTER TABLE device_status ALTER COLUMN temperature TYPE DOUBLE PRECISION;
      CREATE TABLE IF NOT EXISTS device_tokens (
        id BIGSERIAL PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(external_id),
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS water_level_device_time ON water_level(device_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS device_status_device_time ON device_status(device_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS device_logs_device_time ON device_logs(device_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS commands_device_status ON device_commands(device_id, status, created_at);
      CREATE TABLE IF NOT EXISTS webhook_outbox (
        id BIGSERIAL PRIMARY KEY,
        body TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        delivered_at TIMESTAMPTZ,
        last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS device_usage (
        device_id TEXT NOT NULL REFERENCES devices(external_id),
        metric TEXT NOT NULL,
        period DATE NOT NULL,
        count BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (device_id, metric, period)
      );
      CREATE TABLE IF NOT EXISTS water_level_hourly (
        device_id TEXT NOT NULL REFERENCES devices(external_id),
        timestamp TIMESTAMP NOT NULL,
        level_cm DOUBLE PRECISION NOT NULL,
        sample_count BIGINT NOT NULL,
        min_level DOUBLE PRECISION,
        max_level DOUBLE PRECISION,
        PRIMARY KEY (device_id, timestamp)
      );
    `);
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    throw err;
  }
};


module.exports = { pool, initializeDatabase };