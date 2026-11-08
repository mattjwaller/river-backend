const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db/db');
const { admin, digest } = require('../middleware/auth');
const { scopeDevice } = require('../middleware/device');
const { wrap, required, invalid } = require('../lib/http');
router.use(admin);
router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT external_id, last_seen_at, heartbeat_interval_seconds FROM devices ORDER BY external_id');
  res.json(rows);
}));
router.post('/', wrap(async (req, res) => {
  const id = required(req.body.device_id, 'device_id');
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw invalid('device_id');
  const interval = req.body.heartbeat_interval_seconds ?? 300;
  if (!Number.isInteger(interval) || interval < 1) throw invalid('heartbeat_interval_seconds');
  const {rows} = await pool.query('INSERT INTO devices(external_id,heartbeat_interval_seconds) VALUES ($1,$2) ON CONFLICT(external_id) DO UPDATE SET heartbeat_interval_seconds=EXCLUDED.heartbeat_interval_seconds RETURNING *', [id,interval]);
  res.status(201).json(rows[0]);
}));
router.post('/:device_id/tokens', scopeDevice, wrap(async (req, res) => {
  const token = 'dev_' + crypto.randomBytes(32).toString('base64url');
  const { rows } = await pool.query(`INSERT INTO device_tokens (device_id, token_hash) VALUES ($1, $2) RETURNING id, device_id, created_at`, [req.device.external_id, digest(token)]);
  res.status(201).json({ ...rows[0], token });
}));
router.delete('/:device_id/tokens/:id', scopeDevice, wrap(async (req, res) => {
  const { rows } = await pool.query(`UPDATE device_tokens SET revoked_at = now() WHERE id::text = $1 AND device_id = $2 AND revoked_at IS NULL RETURNING id`, [req.params.id, req.device.external_id]);
  if (!rows.length) return res.status(404).json({ error: 'token_not_found' });
  res.sendStatus(204);
}));
module.exports = router;
