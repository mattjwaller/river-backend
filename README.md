# River Monitor Backend

A Node.js backend service for monitoring river water levels and device status.

## Features

- Water level monitoring and history
- Device status tracking
- Weather data integration (coming soon)
- Device command system

## API Endpoints

### Water Level
- `POST /api/data/water-level` - Record new water level data
- `GET /api/data/water-level/current` - Get current water level
- `GET /api/data/water-level/history` - Get water level history
  - Query Parameters:
    - `range`: Time range (e.g., "7d", "30d", "90d")
    - `start_date` and `end_date`: Custom date range (ISO format)
    - `resolution`: Data granularity ("hourly" or "daily")
    - `limit`: Number of data points to return (default: 168)
    - `offset`: Number of data points to skip (default: 0)
  - Response Format:
    ```json
    {
      "data": [
        {
          "timestamp": "2024-02-20T12:00:00.000Z",
          "level_cm": 145,
          "trend": "rising"
        }
      ],
      "meta": {
        "start_date": "2024-02-13T00:00:00.000Z",
        "end_date": "2024-02-20T23:59:59.999Z",
        "min_level": 120,
        "max_level": 170,
        "avg_level": 140,
        "data_points": 168
      }
    }
    ```

### Device Status
- `POST /api/data/device-status` - Record device status
- `GET /api/data/device-status` - Get latest device status

### Device Commands
- `GET /api/commands?device_id=pi-001` - Get pending commands for a device
  - Response Format:
    ```json
    {
      "id": 42,
      "command": "restart-sensor",
      "payload": {}
    }
    ```
- `POST /api/commands/:id/result` - Submit command execution result
  - Request Body:
    ```json
    {
      "status": "done",
      "result": "Sensor restarted successfully"
    }
    ```
- `POST /api/commands` - Create a new command (admin endpoint)
  - Request Body:
    ```json
    {
      "device_id": "pi-001",
      "command": "restart-sensor",
      "payload": {}
    }
    ```
- `GET /api/commands/:id` - Get command status (admin endpoint)

Available Commands:
- `restart-sensor`: Restart the water level sensor
- `reboot`: Reboot the Raspberry Pi
- `update-config`: Update device configuration
- `capture-snapshot`: Capture a system snapshot

### Weather (Coming Soon)
- `GET /api/data/weather/current` - Get current weather
- `GET /api/data/weather/forecast` - Get weather forecast

### Weather Forecast API
The weather forecast API provides access to weather data from the MET.no API, with data stored and served locally.

#### Endpoints

- `POST /api/forecast/fetch` - Fetch and store latest weather forecast data
  - Fetches data from MET.no API for the configured location
  - Updates the local database with the latest forecast
  - Called automatically every hour via cron job

- `GET /api/forecast` - Get forecast for a specified time range
  - Query Parameters:
    - `range` (string): Time range to fetch (e.g., "48h", "7d")
  - Response includes:
    - `meta`: Range info, start/end times, data points count, time_block, normalized
    - `data`: Array of forecast points with temperature, precipitation, wind, etc.
  - Data Normalization:
    - For ranges ≤ 48 hours: Data points are returned hourly
    - For ranges > 48 hours: Data is normalized to 6-hour blocks to reduce data volume
    - The `meta` object includes `time_block` and `normalized` fields to indicate the resolution

- `GET /api/forecast/latest` - Get the most recent forecast data
  - Returns all data points from the most recent forecast fetch
  - Useful for debugging or getting raw forecast data

- `GET /api/forecast/summary` - Get current conditions and 3-day forecast
  - Returns:
    - `current`: Current weather conditions (temperature, wind, rain, pressure, humidity)
    - `forecast`: 3-day forecast with daily min/max temperatures, precipitation, and conditions

#### Data Format

Forecast data points include:
- `timestamp`: Time of the forecast
- `temperature_c`: Temperature in Celsius
- `precipitation_mm`: Precipitation amount in millimeters
- `pressure_hpa`: Air pressure in hectopascals
- `wind_speed_mps`: Wind speed in meters per second
- `relative_humidity_percent`: Relative humidity percentage
- `symbol_code`: Weather condition code (e.g., "partlycloudy_day")

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your configuration:
```
PORT=3000
API_KEY=your-api-key
DATABASE_URL=your-database-url
```

3. Start the server:
```bash
npm start
```

## Development

The project uses:
- Express.js for the web server
- PostgreSQL for data storage
- CORS enabled for cross-origin requests

## Database Schema

### Water Level
- id (INTEGER PRIMARY KEY)
- level_cm (REAL)
- trend (TEXT)
- timestamp (DATETIME)
- min_level (REAL)
- max_level (REAL)

### Device Status
- id (INTEGER PRIMARY KEY)
- cpu_percent (REAL)
- mem_percent (REAL)
- disk_percent (REAL)
- battery (REAL)
- temperature (REAL)
- uptime_seconds (INTEGER)
- ip_address (TEXT)
- wifi_strength (INTEGER)
- status (TEXT)
- timestamp (DATETIME)

### Device Commands
- id (SERIAL PRIMARY KEY)
- device_id (TEXT)
- command (TEXT)
- payload (JSONB)
- status (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- picked_up_at (TIMESTAMP)
## RiverWatch v2 migration

`app.js` exports the Express application; `server.js` initializes PostgreSQL and
starts maintenance and webhook delivery. Startup applies additive schema changes
and preserves existing readings with no device ID. Those legacy readings remain
available to unscoped reads; they are never attributed to a particular Pi.
Configure the variables in `.env.example` using Railway's secret configuration.

1. Set separate `ADMIN_API_KEY` and `RIVERWATCH_API_KEY` secrets. Requests use
   `x-api-key`; only the admin key can register devices or issue/revoke tokens.
2. Register each Pi with `POST /api/devices` and JSON
   `{"device_id":"pi-001","heartbeat_interval_seconds":300}`. Existing device
   IDs from the commands table are registered during migration.
3. Issue a token with `POST /api/devices/pi-001/tokens`. The plaintext token is
   returned once; only its SHA-256 hash is stored. Configure the Pi to send
   `Authorization: Bearer dev_…`. Revoke with
   `DELETE /api/devices/pi-001/tokens/:id`.
4. RiverWatch backend functions must enforce workspace membership/roles before
   forwarding reads and commands using `RIVERWATCH_API_KEY`. This repository
   does not implement RiverWatch's workspace authorization or browser proxy.
5. After proxy and Pi migration, set `ALLOW_LEGACY_API_KEY=false`, rotate the
   exposed `API_KEY`, remove it from browser configuration and restrict
   `CORS_ORIGINS` to the deployed RiverWatch origins. No origins are enabled
   by default. CORS is not an authentication boundary.

Current level, history, device status and logs accept optional `device_id`.
Unknown devices return `404 device_not_found`. History supports `5min`, `15min`,
`hourly`, `daily`, `weekly`, and `raw`, date windows, limits and offsets.
CSV export requires `device_id`, `start_date`, and `end_date` at
`GET /api/data/water-level/export`. Logs are available at both `/api/logs` and
`/api/data/logs` with their existing array response.

`POST /api/telemetry` accepts readings and diagnostics from the v2 spec. Sensor
faults use `readings.fault: "echo_timeout" | "out_of_range"`; fault-only posts
record a sensor log and heartbeat without inventing a water level. Status becomes
offline after three configured heartbeat intervals (15 minutes by default).

Commands preserve numeric IDs for compatibility, accept `requested_by`, and
allow only the four documented commands. Polling atomically claims one pending
command; an unclaimed command expires after ten minutes. GET-by-ID and polling
apply expiration immediately; hourly maintenance also expires unused commands.

EA queries accept `station_id` and `since`. Forecast endpoints accept `lat` and
`lon`, rounded to two decimal places, and fetch MET.no on demand. Both upstreams
use a bounded 15-minute in-process cache, independently per service replica.
MET.no's available horizon may be shorter than the requested 14 days; metadata
reports actual point counts. Forecast refresh now warms this cache rather than
persisting forecasts to PostgreSQL. Existing scheduled refresh calls still work.

When `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_SECRET` are set, readings enqueue a
transactional outbox event. Delivery signs the exact JSON bytes with HMAC-SHA256
(hex), retries with exponential backoff, and stops after five attempts. Delivery
is at least once: RiverWatch should deduplicate events. Both values may stay
unset until the webhook phase starts.

With `ENABLE_DATA_RETENTION=true` (disabled by default), hourly maintenance retains raw readings for 90 days (rounded to UTC days), hourly
rollups for two years, and logs for 30 days. Legacy unassigned raw readings expire
but cannot be included in per-device rollups. Usage counts accumulate readings
per UTC day and commands per UTC month in `device_usage`.

Run `npm test -- --runInBand` for local API tests using a database double. The
old live Railway write tests are disabled by default; they require explicit
`RUN_RAILWAY_LEGACY_TESTS=true` and still target the legacy deployment contract.
Validate migration SQL against staging PostgreSQL before production rollout.
