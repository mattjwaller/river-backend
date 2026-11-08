const router = require('express').Router();
const { pool } = require('../db/db');
const { wrap, required, date } = require('../lib/http');
const { scopeDevice } = require('../middleware/device');
router.use(scopeDevice);
router.post('/logs', wrap(async (req, res) => {
  const b = req.body;
  for (const key of ['level', 'message']) required(b[key], key);
  const source = b.source || (b.device_id ? 'device' : required(b.source, 'source'));
  const timestamp = b.timestamp ? date(b.timestamp, 'timestamp').toISOString() : new Date().toISOString();
  await pool.query(`INSERT INTO device_logs(level,message,source,timestamp,metadata,device_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [b.level, b.message, source, timestamp, b.metadata || b.meta || {}, req.device?.external_id || null]);
  res.sendStatus(200);
}));
router.get('/logs', wrap(async (req, res) => {
  const values = []; let sql = 'SELECT * FROM device_logs WHERE 1=1';
  for (const key of ['device_id', 'level', 'source']) {
    if (req.query[key] !== undefined) { values.push(req.query[key]); sql += ` AND ${key} = $${values.length}`; }
  }
  // Preserve legacy pagination defaults for logs.
  const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  values.push(limit, offset);
  sql += ` ORDER BY timestamp DESC, id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`;
  res.json((await pool.query(sql, values)).rows);
}));
router.get('/logs/stats', wrap(async (req, res) => {
  res.json((await pool.query(`SELECT level, COUNT(*) AS count, MIN(timestamp) AS first_seen, MAX(timestamp) AS last_seen
    FROM device_logs WHERE ($1::text IS NULL OR device_id = $1) GROUP BY level`, [req.device?.external_id || null])).rows);
}));
module.exports = router;
