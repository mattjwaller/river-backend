const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const db = require('../db/db');
const moment = require('moment');
const conditions = require('../en.json');

// Map MET.no symbol codes to our condition codes
const symbolCodeMap = {
  'clearsky_day': 'Sun',
  'clearsky_night': 'Sun',
  'fair_day': 'LightCloud',
  'fair_night': 'LightCloud',
  'partlycloudy_day': 'PartlyCloud',
  'partlycloudy_night': 'PartlyCloud',
  'cloudy': 'Cloud',
  'rainshowers_day': 'LightRainSun',
  'rainshowers_night': 'LightRain',
  'rainshowersandthunder_day': 'LightRainThunderSun',
  'rainshowersandthunder_night': 'LightRainThunder',
  'sleet': 'Sleet',
  'sleetandthunder': 'SleetThunder',
  'sleetday': 'SleetSun',
  'sleetnight': 'Sleet',
  'sleetandthunderday': 'SleetSunThunder',
  'sleetandthundernight': 'SleetThunder',
  'snow': 'Snow',
  'snowandthunder': 'SnowThunder',
  'snowday': 'SnowSun',
  'snownight': 'Snow',
  'snowandthunderday': 'SnowSunThunder',
  'snowandthundernight': 'SnowThunder',
  'fog': 'Fog',
  'drizzle': 'Drizzle',
  'drizzleandthunder': 'DrizzleThunder',
  'drizzleday': 'DrizzleSun',
  'drizzlenight': 'Drizzle',
  'drizzleandthunderday': 'DrizzleThunderSun',
  'drizzleandthundernight': 'DrizzleThunder',
  'rain': 'Rain',
  'rainandthunder': 'RainThunder',
  'rainday': 'RainSun',
  'rainnight': 'Rain',
  'rainandthunderday': 'RainThunderSun',
  'rainandthundernight': 'RainThunder',
  'lightsleet': 'LightSleet',
  'heavysleet': 'HeavySleet',
  'lightsleetandthunder': 'LightSleetThunder',
  'heavysleetandthunder': 'HeavySleetThunder',
  'lightsleetday': 'LightSleetSun',
  'heavysleetday': 'HeavySleetSun',
  'lightsleetnight': 'LightSleet',
  'heavysleetnight': 'HeavySleet',
  'lightsleetandthunderday': 'LightSleetThunderSun',
  'heavysleetandthunderday': 'HeavySleetThunderSun',
  'lightsleetandthundernight': 'LightSleetThunder',
  'heavysleetandthundernight': 'HeavySleetThunder',
  'lightsnow': 'LightSnow',
  'heavysnow': 'HeavySnow',
  'lightsnowandthunder': 'LightSnowThunder',
  'heavysnowandthunder': 'HeavySnowThunder',
  'lightsnowday': 'LightSnowSun',
  'heavysnowday': 'HeavySnowSun',
  'lightsnownight': 'LightSnow',
  'heavysnownight': 'HeavySnow',
  'lightsnowandthunderday': 'LightSnowThunderSun',
  'heavysnowandthunderday': 'HeavySnowThunderSun',
  'lightsnowandthundernight': 'LightSnowThunder',
  'heavysnowandthundernight': 'HeavySnowThunder'
};

// Helper function to map MET.no symbol code to our condition code
function mapSymbolCode(symbolCode) {
  return symbolCodeMap[symbolCode] || 'LightCloud';
}

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
    
    console.log(`Received ${data.properties.timeseries.length} forecast entries from MET.no`);
    
    // Process each hourly forecast
    let storedCount = 0;
    for (const entry of data.properties.timeseries) {
      const timestamp = new Date(entry.time);
      const details = entry.data.instant.details;
      const next1Hours = entry.data.next_1_hours?.details || {};
      let symbolCode = 'unknown';
      if (entry.data.next_1_hours?.summary?.symbol_code) {
        symbolCode = entry.data.next_1_hours.summary.symbol_code;
      } else if (entry.data.next_6_hours?.summary?.symbol_code) {
        symbolCode = entry.data.next_6_hours.summary.symbol_code;
      } else if (entry.data.next_12_hours?.summary?.symbol_code) {
        symbolCode = entry.data.next_12_hours.summary.symbol_code;
      } else {
        console.warn(`No symbol_code available for ${timestamp.toISOString()}`);
      }

      // Log the first entry's data for verification
      if (storedCount === 0) {
        console.log('Sample forecast entry from MET.no:', {
          timestamp: timestamp.toISOString(),
          temperature: details.air_temperature,
          humidity: details.relative_humidity,
          condition: symbolCode,
          precipitation: next1Hours.precipitation_amount,
          cloud_cover: details.cloud_area_fraction,
          wind_direction: details.wind_from_direction,
          wind_speed: details.wind_speed,
          has_humidity: 'relative_humidity' in details
        });
      }

      // Only include humidity if it exists in the details
      const humidity = 'relative_humidity' in details ? details.relative_humidity : null;

      await db.pool.query(`
        INSERT INTO weather_forecast (
          timestamp, location_lat, location_lon,
          precipitation_mm, temperature_c, pressure_hpa, wind_speed_mps,
          relative_humidity_percent, symbol_code, forecast_created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (timestamp, location_lat, location_lon)
        DO UPDATE SET
          precipitation_mm = EXCLUDED.precipitation_mm,
          temperature_c = EXCLUDED.temperature_c,
          pressure_hpa = EXCLUDED.pressure_hpa,
          wind_speed_mps = EXCLUDED.wind_speed_mps,
          relative_humidity_percent = EXCLUDED.relative_humidity_percent,
          symbol_code = EXCLUDED.symbol_code,
          forecast_created_at = EXCLUDED.forecast_created_at
      `, [
        timestamp,
        lat,
        lon,
        next1Hours.precipitation_amount || 0,
        details.air_temperature,
        details.air_pressure_at_sea_level,
        details.wind_speed,
        humidity,
        symbolCode,
        forecastCreatedAt
      ]);
      storedCount++;
    }

    // Verify the stored data
    const verifyResult = await db.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(relative_humidity_percent) as humidity_count,
        COUNT(symbol_code) as condition_count,
        MIN(relative_humidity_percent) as min_humidity,
        MAX(relative_humidity_percent) as max_humidity,
        MIN(temperature_c) as min_temp,
        MAX(temperature_c) as max_temp,
        COUNT(*) FILTER (WHERE relative_humidity_percent IS NULL) as null_humidity_count
      FROM weather_forecast 
      WHERE forecast_created_at = $1
    `, [forecastCreatedAt]);

    console.log('Data verification:', verifyResult.rows[0]);

    // Verify the number of entries stored
    const storedResult = await db.pool.query(`
      SELECT COUNT(*) as count 
      FROM weather_forecast 
      WHERE forecast_created_at = $1
    `, [forecastCreatedAt]);

    console.log(`Weather forecast data updated successfully:
      - Received from MET.no: ${data.properties.timeseries.length} entries
      - Processed: ${storedCount} entries
      - Stored in database: ${storedResult.rows[0].count} entries
      - Humidity data present: ${verifyResult.rows[0].humidity_count} entries
      - Humidity data missing: ${verifyResult.rows[0].null_humidity_count} entries
      - Condition data present: ${verifyResult.rows[0].condition_count} entries
      - Humidity range: ${verifyResult.rows[0].min_humidity} to ${verifyResult.rows[0].max_humidity}
      - Temperature range: ${verifyResult.rows[0].min_temp} to ${verifyResult.rows[0].max_temp}
      - Time range: ${new Date(data.properties.timeseries[0].time).toISOString()} to ${new Date(data.properties.timeseries[data.properties.timeseries.length-1].time).toISOString()}
    `);

    res.json({ 
      message: 'Weather forecast data updated successfully',
      stats: {
        received: data.properties.timeseries.length,
        processed: storedCount,
        stored: storedResult.rows[0].count,
        time_range: {
          start: new Date(data.properties.timeseries[0].time).toISOString(),
          end: new Date(data.properties.timeseries[data.properties.timeseries.length-1].time).toISOString()
        }
      }
    });
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
    const timeBlock = hours > 48 ? '6 hours' : '1 hour';
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
    date_trunc('hour', timestamp) - (EXTRACT(HOUR FROM timestamp)::int % 6) * interval '1 hour'
  ELSE 
    timestamp
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
    date_trunc('hour', timestamp) - (EXTRACT(HOUR FROM timestamp)::int % 6) * interval '1 hour'
  ELSE 
    timestamp
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
        normalized: hours > 48
      },
      data: result.rows
    };

    console.log(`Forecast data retrieved:
      - Time range: ${startTime.toISOString()} to ${endTime.toISOString()}
      - Data points: ${result.rows.length}
      - Time block: ${timeBlock}
      - Normalized: ${hours > 48}
    `);

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
        pressure_hpa,
        COALESCE(relative_humidity_percent, 0) as relative_humidity_percent,
        COALESCE(symbol_code, 'unknown') as symbol_code
      FROM latest_forecast
    `, [now.toISOString()]);

    // Get 3-day forecast summary
    const forecastResult = await db.pool.query(`
      WITH daily_forecast AS (
        SELECT 
          DATE(timestamp) as forecast_date,
          MIN(temperature_c) as min_temp,
          MAX(temperature_c) as max_temp,
          SUM(precipitation_mm) as total_precip,
          AVG(COALESCE(relative_humidity_percent, 0)) as avg_humidity,
          MODE() WITHIN GROUP (ORDER BY COALESCE(symbol_code, 'unknown')) as day_condition
        FROM weather_forecast
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp)
        LIMIT 3
      )
      SELECT 
        forecast_date,
        ROUND(min_temp::numeric, 1) as min_temp,
        ROUND(max_temp::numeric, 1) as max_temp,
        ROUND(total_precip::numeric, 1) as total_precip,
        ROUND(avg_humidity::numeric, 1) as avg_humidity,
        day_condition
      FROM daily_forecast
      ORDER BY forecast_date
    `, [now.toISOString(), endTime.toISOString()]);

    // Format the response
    const current = currentResult.rows[0] ? {
      temperature: Math.round(currentResult.rows[0].temperature_c),
      wind: Math.round(currentResult.rows[0].wind_speed_mps),
      rain: Math.round(currentResult.rows[0].precipitation_mm * 10) / 10,
      pressure: Math.round(currentResult.rows[0].pressure_hpa),
      humidity: Math.round(currentResult.rows[0].relative_humidity_percent),
      condition: currentResult.rows[0].symbol_code
    } : null;

    const forecast = forecastResult.rows.map((row, index) => {
      const day = index === 0 ? 'Today' : 
                 index === 1 ? 'Tomorrow' : 
                 moment(row.forecast_date).format('dddd');
      
      return {
        day,
        condition: row.day_condition,
        max: Math.round(row.max_temp),
        min: Math.round(row.min_temp),
        rain: Math.round(row.total_precip * 10) / 10,
        humidity: Math.round(row.avg_humidity)
      };
    });

    // Log the data for debugging
    console.log('Weather summary data:', {
      current: currentResult.rows[0],
      forecast: forecastResult.rows,
      raw_data: {
        current_query: currentResult.rows[0] ? {
          humidity: currentResult.rows[0].relative_humidity_percent,
          condition: currentResult.rows[0].symbol_code
        } : null,
        forecast_query: forecastResult.rows.map(r => ({
          humidity: r.avg_humidity,
          condition: r.day_condition
        }))
      }
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