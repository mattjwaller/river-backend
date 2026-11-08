const { pool } = require('../db/db');
const { wrap, invalid } = require('../lib/http');
async function findDevice(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw invalid('device_id');
  const { rows } = await pool.query('SELECT * FROM devices WHERE external_id = $1', [id]);
  if (!rows.length) throw Object.assign(new Error('device_not_found'), { status: 404, error: 'device_not_found' });
  return rows[0];
}
const scopeDevice = wrap(async (req, res, next) => {
  const id = req.params.device_id ?? req.query.device_id ?? req.body?.device_id;
  if (id !== undefined) req.device = await findDevice(id);
  next();
});
function online(device, fallback) {
  const last = device?.last_seen_at || fallback;
  return !!last && Date.now() - new Date(last).getTime() <= 3 * (device?.heartbeat_interval_seconds || 300) * 1000;
}
module.exports = { findDevice, scopeDevice, online };
