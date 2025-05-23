const fetch = require('node-fetch');

const API_BASE = 'https://river-backend-production.up.railway.app/api/data';

async function seed() {
  // Seed water level
  const waterLevel = await fetch(`${API_BASE}/water-level`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level_cm: 150,
      trend: 'rising',
      timestamp: new Date().toISOString(),
      min_level: 100,
      max_level: 200
    })
  });
  console.log('Water level status:', waterLevel.status);
  console.log('Water level response:', await waterLevel.text());

  // Seed device status
  const deviceStatus = await fetch(`${API_BASE}/device-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
}); 