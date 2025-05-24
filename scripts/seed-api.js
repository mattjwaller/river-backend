const fetch = require('node-fetch');

const API_BASE = 'https://river-backend-production.up.railway.app/api/data';
const API_KEY = 'river_1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n'; // Replace with your actual API key

async function seed() {
  // Seed water level readings for the last 90 days
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const timestamp = date.toISOString();
    const level_cm = Math.floor(Math.random() * 101) + 100; // Random level between 100 and 200
    const trend = ['rising', 'falling', 'stable'][Math.floor(Math.random() * 3)];
    const min_level = 100;
    const max_level = 200;

    const waterLevel = await fetch(`${API_BASE}/water-level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        level_cm,
        trend,
        timestamp,
        min_level,
        max_level
      })
    });
    console.log(`Water level for ${timestamp} status:`, waterLevel.status);
  }

  // Seed device status
  const deviceStatus = await fetch(`${API_BASE}/device-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      cpu_percent: 45,
      mem_percent: 60,
      disk_percent: 75,
      battery: 85,
      temperature: 35,
      uptime_seconds: 3600,
      ip_address: '192.168.1.100',
      wifi_strength: -65,
      status: 'healthy',
      timestamp: new Date().toISOString()
    })
  });
  console.log('Device status status:', deviceStatus.status);
  console.log('Device status response:', await deviceStatus.text());

  // Seed log
  const log = await fetch(`${API_BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      level: 'info',
      message: 'Seed log message',
      source: 'seed-script',
      timestamp: new Date().toISOString(),
      metadata: { seed: true }
    })
  });
  console.log('Log status:', log.status);
  console.log('Log response:', await log.text());
}

seed().catch(console.error); 