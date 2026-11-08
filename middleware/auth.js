const crypto = require('crypto');
const { pool } = require('../db/db');
const { wrap } = require('../lib/http');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const matches = (a, b) => typeof a === 'string' && !!b && crypto.timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const authenticate = wrap(async (req, res, next) => {
  if (req.path === '/') return next();
  const key = req.get('x-api-key');
  if (matches(key, process.env.ADMIN_API_KEY)) req.auth = { role: 'admin' };
  else if (matches(key, process.env.RIVERWATCH_API_KEY)) req.auth = { role: 'server' };
  else if (process.env.ALLOW_LEGACY_API_KEY !== 'false' && matches(key, process.env.API_KEY)) req.auth = { role: 'legacy' };
  else {
    const token = /^Bearer (dev_[A-Za-z0-9_-]+)$/.exec(req.get('authorization') || '')?.[1];
    if (token) {
      const { rows } = await pool.query(`SELECT device_id FROM device_tokens WHERE token_hash = $1 AND revoked_at IS NULL`, [digest(token)]);
      if (rows.length) req.auth = { role: 'device', device_id: rows[0].device_id };
    }
  }
  if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
  if (req.auth.role === 'device') {
    const allowed = (req.method === 'POST' && ['/api/telemetry', '/api/data/water-level', '/api/data/device-status', '/api/data/logs', '/api/logs'].includes(req.path)) ||
      (req.method === 'GET' && req.path === '/api/commands') ||
      (req.method === 'POST' && /^\/api\/commands\/[^/]+\/result$/.test(req.path));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    const ids = [req.query.device_id, req.body?.device_id].filter(x => x !== undefined);
    if (ids.some(id => id !== req.auth.device_id)) return res.status(403).json({ error: 'device_scope_mismatch' });
    req.body = req.body || {};
    if (req.method === 'GET') req.query.device_id = req.auth.device_id;
    else req.body.device_id = req.auth.device_id;
  }
  next();
});
function admin(req, res, next) {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}
module.exports = { authenticate, admin, digest };
