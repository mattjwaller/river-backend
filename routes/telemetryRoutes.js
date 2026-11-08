const router = require('express').Router();
const { wrap, required, invalid, date } = require('../lib/http');
const { scopeDevice } = require('../middleware/device');
const { transaction, insertReading } = require('../lib/readings');
router.post('/telemetry', scopeDevice, wrap(async (req, res) => {
  required(req.body.device_id, 'device_id');
  const timestamp = date(required(req.body.timestamp, 'timestamp'), 'timestamp').toISOString();
  const r = required(req.body.readings, 'readings');
  const d = req.body.diagnostics || {};
  if (typeof r !== 'object' || Array.isArray(r)) throw invalid('readings');
  if (typeof d !== 'object' || Array.isArray(d)) throw invalid('diagnostics');
  const fault = r.fault || r.error;
  if (fault !== undefined && !['echo_timeout', 'out_of_range', 'echo timeout', 'out-of-range'].includes(fault)) throw invalid('readings.fault');
  if (!fault && !Number.isFinite(r.level_cm)) throw invalid('readings.level_cm');
  for (const k of ['distance_cm','temperature_c','quality_score']) if (r[k] !== undefined && !Number.isFinite(r[k])) throw invalid(`readings.${k}`);
  for (const k of ['cpu_percent','mem_percent','disk_percent','wifi_strength_dbm','uptime_seconds']) if (d[k] !== undefined && !Number.isFinite(d[k])) throw invalid(`diagnostics.${k}`);
  if (r.quality_score !== undefined && (r.quality_score < 0 || r.quality_score > 1)) throw invalid('readings.quality_score');
  await transaction(async client => {
    const id = req.device.external_id;
    if (!fault) await insertReading(client, id, { ...r, timestamp });
    else await client.query(`INSERT INTO device_logs(device_id,level,source,message,timestamp,metadata) VALUES ($1,$2,'sensor',$3,$4,$5)`, [id, fault.includes('timeout') ? 'error':'warn', fault, timestamp, r]);
    await client.query(`INSERT INTO device_status(device_id,status,timestamp,cpu_percent,mem_percent,disk_percent,wifi_strength,uptime_seconds,ip_address,battery,temperature)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,fault ? 'degraded':'online',timestamp,d.cpu_percent,d.mem_percent,d.disk_percent,d.wifi_strength_dbm,d.uptime_seconds,d.ip_address,d.battery ?? null,r.temperature_c]);
    await client.query('UPDATE devices SET last_seen_at=now() WHERE external_id=$1', [id]);
  });
  res.sendStatus(200);
}));
module.exports = router;
