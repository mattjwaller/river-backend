const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const db = require('../db/db');
const moment = require('moment');

// Fetch and store weather forecast
router.post('/fetch', async (req, res) => {
  console.log('POST /forecast/fetch request received');
  try {
    const lat = 52.0181248;
    const lon = -1.3819986;
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RiverMonitor/1.0 (https://github.com/mattjwaller/river-backend)'
      }
    });

    if (!response.ok) {
      throw new Error(`Weather API responded with status: ${response.status}`);
    }

    const data = await response.json();
    const forecastCreatedAt = new Date();
    
    // Process each hourly forecast
    for (const entry of data.properties.timeseries) {
      const timestamp = new Date(entry.time);
      const details = entry.data.instant.details;
      const next1Hours = entry.data.next_1_hours?.details || {};

      await db.pool.query(`
        INSERT INTO weather_forecast (
          timestamp, location_lat, location_lon,
          precipitation_mm, temperature_c, pressure_hpa, wind_speed_mps,
          forecast_created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (timestamp, location_lat, location_lon)
        DO UPDATE SET
          precipitation_mm = EXCLUDED.precipitation_mm,
          temperature_c = EXCLUDED.temperature_c,
          pressure_hpa = EXCLUDED.pressure_hpa,
          wind_speed_mps = EXCLUDED.wind_speed_mps,
          forecast_created_at = EXCLUDED.forecast_created_at
      `, [
        timestamp,
        lat,
        lon,
        next1Hours.precipitation_amount || 0,
        details.air_temperature,
        details.air_pressure_at_sea_level,
        details.wind_speed,
        forecastCreatedAt
      ]);
    }

    console.log('Weather forecast data updated successfully');
    res.json({ message: 'Weather forecast data updated successfully' });
  } catch (err) {
    console.error('Error fetching weather forecast:', err);
    res.status(500).json({ error: 'Failed to fetch weather forecast' });
  }
});

// Get forecast for a specified time range
router.get('/', async (req, res) => {
  console.log('GET /forecast request received with range:', req.query.range);
  try {
    const { range = '48h' } = req.query;
    
    // Parse the range parameter (e.g., "48h", "7d")
    const match = /^(\d+)([hd])$/.exec(range);
    if (!match) {
      return res.status(400).json({ error: 'Invalid range format. Use format like "48h" or "7d"' });
    }

    const [_, num, unit] = match;
    const hours = unit === 'd' ? num * 24 : num;
    
    // Calculate the time range
    const now = moment();
    const startTime = now.clone().subtract(1, 'hour'); // Include last hour
    const endTime = now.clone().add(hours, 'hours');

    // Determine if we need to normalize to 6-hour blocks
    const needsNormalization = hours > 48;
    const timeBlock = needsNormalization ? '6 hours' : '1 hour';

    // Get the forecast data with appropriate time blocks
    const result = await db.pool.query(`
      WITH latest_forecast AS (
        SELECT DISTINCT ON (timestamp) *
        FROM weather_forecast
        WHERE timestamp BETWEEN $1 AND $2
        ORDER BY timestamp, forecast_created_at DESC
      ),
      normalized_data AS (
        SELECT 
          CASE 
            WHEN $3 = '6 hours' THEN 
              date_trunc('hour', timestamp - (EXTRACT(HOUR FROM timestamp) % 6) * interval '1 hour')
            ELSE 
              date_trunc('hour', timestamp)
          END as block_start,
          location_lat,
          location_lon,
          SUM(precipitation_mm) as precipitation_mm,
          AVG(temperature_c) as temperature_c,
          AVG(pressure_hpa) as pressure_hpa,
          AVG(wind_speed_mps) as wind_speed_mps,
          MAX(forecast_created_at) as forecast_created_at
        FROM latest_forecast
        GROUP BY 
          CASE 
            WHEN $3 = '6 hours' THEN 
              date_trunc('hour', timestamp - (EXTRACT(HOUR FROM timestamp) % 6) * interval '1 hour')
            ELSE 
              date_trunc('hour', timestamp)
          END,
          location_lat,
          location_lon
      )
      SELECT 
        block_start as timestamp,
        location_lat,
        location_lon,
        ROUND(precipitation_mm::numeric, 2) as precipitation_mm,
        ROUND(temperature_c::numeric, 2) as temperature_c,
        ROUND(pressure_hpa::numeric, 2) as pressure_hpa,
        ROUND(wind_speed_mps::numeric, 2) as wind_speed_mps,
        forecast_created_at
      FROM normalized_data
      ORDER BY block_start ASC
    `, [startTime.toISOString(), endTime.toISOString(), timeBlock]);

    // Add metadata about the forecast
    const response = {
      meta: {
        range: range,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        data_points: result.rows.length,
        forecast_created_at: result.rows[0]?.forecast_created_at || null,
        time_block: timeBlock,
        normalized: needsNormalization
      },
      data: result.rows
    };

    res.json(response);
  } catch (err) {
    console.error('Error fetching forecast:', err);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

// Get latest forecast
router.get('/latest', async (req, res) => {
  console.log('GET /forecast/latest request received');
  try {
    const result = await db.pool.query(`
      SELECT * FROM weather_forecast
      WHERE forecast_created_at = (
        SELECT MAX(forecast_created_at) FROM weather_forecast
      )
      ORDER BY timestamp ASC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching latest forecast:', err);
    res.status(500).json({ error: 'Failed to fetch latest forecast' });
  }
});

// Get weather summary (current conditions + 3-day forecast)
router.get('/summary', async (req, res) => {
  console.log('GET /forecast/summary request received');
  try {
    const now = moment();
    const endTime = now.clone().add(72, 'hours');

    // Get current conditions (latest forecast)
    const currentResult = await db.pool.query(`
      WITH latest_forecast AS (
        SELECT DISTINCT ON (timestamp) *
        FROM weather_forecast
        WHERE timestamp >= $1
        ORDER BY timestamp ASC
        LIMIT 1
      )
      SELECT 
        timestamp,
        temperature_c,
        wind_speed_mps,
        precipitation_mm,
        pressure_hpa
      FROM latest_forecast
    `, [now.toISOString()]);

    // Get 3-day forecast summary
    const forecastResult = await db.pool.query(`
      WITH daily_forecast AS (
        SELECT 
          DATE(timestamp) as forecast_date,
          MIN(temperature_c) as min_temp,
          MAX(temperature_c) as max_temp,
          SUM(precipitation_mm) as total_precip
        FROM weather_forecast w1
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp)
        LIMIT 3
      )
      SELECT 
        forecast_date,
        ROUND(min_temp::numeric, 1) as min_temp,
        ROUND(max_temp::numeric, 1) as max_temp,
        ROUND(total_precip::numeric, 1) as total_precip
      FROM daily_forecast
    `, [now.toISOString(), endTime.toISOString()]);

    // Format the response
    const current = currentResult.rows[0] ? {
      temperature: Math.round(currentResult.rows[0].temperature_c),
      wind: Math.round(currentResult.rows[0].wind_speed_mps),
      rain: Math.round(currentResult.rows[0].precipitation_mm * 10) / 10,
      pressure: Math.round(currentResult.rows[0].pressure_hpa)
    } : null;

    const forecast = forecastResult.rows.map((row, index) => {
      const day = index === 0 ? 'Today' : 
                 index === 1 ? 'Tomorrow' : 
                 moment(row.forecast_date).format('dddd');
      
      return {
        day,
        max: Math.round(row.max_temp),
        min: Math.round(row.min_temp),
        rain: Math.round(row.total_precip * 10) / 10
      };
    });

    res.json({
      current,
      forecast
    });
  } catch (err) {
    console.error('Error fetching weather summary:', err);
    res.status(500).json({ error: 'Failed to fetch weather summary' });
  }
});

module.exports = router; 