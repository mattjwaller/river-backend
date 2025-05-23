# River Monitor Backend

A Node.js backend service for monitoring river water levels and device status.

## Features

- Water level monitoring and history
- Device status tracking
- Weather data integration (coming soon)

## API Endpoints

### Water Level
- `POST /api/data/water-level` - Record new water level data
- `GET /api/data/water-level/current` - Get current water level
- `GET /api/data/water-level/history?days=30` - Get water level history

### Device Status
- `POST /api/data/device-status` - Record device status
- `GET /api/data/device-status` - Get latest device status

### Weather (Coming Soon)
- `GET /api/data/weather/current` - Get current weather
- `GET /api/data/weather/forecast` - Get weather forecast

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your configuration:
```
PORT=3000
```

3. Start the server:
```bash
npm start
```

## Development

The project uses:
- Express.js for the web server
- SQLite for data storage
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