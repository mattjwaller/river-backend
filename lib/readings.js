const { invalid, date, page } = require('./http');
function historyQuery(query, deviceId, exporting = false) {
  const resolution = query.resolution || 'hourly';
  const buckets = {
    '5min': "date_trunc('hour', timestamp) + floor(extract(minute from timestamp)/5) * interval '5 minutes'",
    '15min': "date_trunc('hour', timestamp) + floor(extract(minute from timestamp)/15) * interval '15 minutes'",
    hourly: "date_trunc('hour', timestamp)", daily: "date_trunc('day', timestamp)", weekly: "date_trunc('week', timestamp)",
    raw: 'timestamp'
  };
  if (!buckets[resolution]) throw invalid('resolution');
  let start, end;
  if (query.range) {
    const match = /^(\d+)([dhm])$/.exec(query.range);
    if (!match || Number(match[1]) < 1) throw invalid('range');
    end = new Date();
    start = new Date(end - Number(match[1]) * { d: 86400000, h: 3600000, m: 60000 }[match[2]]);
    if (!Number.isFinite(start.getTime())) throw invalid('range');
  } else {
    if (!query.start_date) throw invalid('start_date', 'missing_parameter');
    if (!query.end_date) throw invalid('end_date', 'missing_parameter');
    start = date(query.start_date, 'start_date'); end = date(query.end_date, 'end_date');
  }
  if (start > end) throw invalid('end_date');
  const { limit, offset } = page(query);
  const values = [start.toISOString(), end.toISOString(), deviceId || null];
  // Raw data and retained hourly summaries are disjoint in time after maintenance.
  // Weight averages by sample count when combining summaries with recent readings.
  const cte = `WITH samples AS (
    SELECT timestamp, level_cm, 1::bigint AS sample_count, COALESCE(min_level,level_cm) AS min_level, COALESCE(max_level,level_cm) AS max_level
    FROM water_level WHERE timestamp BETWEEN $1 AND $2 AND ($3::text IS NULL OR device_id = $3)
    ${['hourly', 'daily', 'weekly'].includes(resolution) ? `UNION ALL SELECT timestamp, level_cm, sample_count, min_level, max_level FROM water_level_hourly
    WHERE timestamp BETWEEN $1 AND $2 AND ($3::text IS NULL OR device_id = $3)` : ''}
  ), buckets AS (
    SELECT ${buckets[resolution]} AS timestamp, SUM(level_cm * sample_count)/SUM(sample_count) AS level_cm,
      MIN(min_level) AS min_level, MAX(max_level) AS max_level, SUM(sample_count) AS sample_count
    FROM samples GROUP BY 1
  ), points AS (
    SELECT *, CASE WHEN level_cm > lag(level_cm) OVER (ORDER BY timestamp) THEN 'rising'
      WHEN level_cm < lag(level_cm) OVER (ORDER BY timestamp) THEN 'falling' ELSE 'steady' END AS trend FROM buckets
  )`;
  const sql = `${cte} SELECT timestamp, level_cm, trend FROM points ORDER BY timestamp DESC${exporting ? '' : ' LIMIT $4 OFFSET $5'}`;
  const metaSql = `${cte} SELECT COUNT(*) AS total_count, SUM(sample_count) AS data_points, MIN(min_level) AS min_level,
    MAX(max_level) AS max_level, SUM(level_cm * sample_count)/NULLIF(SUM(sample_count),0) AS avg_level FROM points`;
  return { sql, metaSql, values, dataValues: exporting ? values : [...values, limit, offset], meta: { start_date: start.toISOString(), end_date: end.toISOString(), resolution } };
}
async function usage(client, deviceId, metric) {
  if (!deviceId) return;
  await client.query(`INSERT INTO device_usage(device_id, metric, period, count)
    VALUES ($1, $2, CASE WHEN $2 = 'commands' THEN date_trunc('month', now() AT TIME ZONE 'UTC')::date ELSE (now() AT TIME ZONE 'UTC')::date END, 1)
    ON CONFLICT (device_id, metric, period) DO UPDATE SET count = device_usage.count + 1`, [deviceId, metric]);
}
async function transaction(fn) {
  const { pool } = require('../db/db');
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
async function insertReading(client, deviceId, body) {
  // Serialize writes for a device so previous_level and rate are consistent.
  if (deviceId) await client.query('SELECT external_id FROM devices WHERE external_id = $1 FOR UPDATE', [deviceId]);
  const { rows } = await client.query(`SELECT level_cm, timestamp FROM water_level WHERE device_id = $1 AND timestamp < $2 ORDER BY timestamp DESC LIMIT 1`, [deviceId, body.timestamp]);
  const previous = rows[0];
  const elapsed = previous ? (new Date(body.timestamp) - new Date(previous.timestamp)) / 3600000 : 0;
  const rate = elapsed > 0 ? (body.level_cm - previous.level_cm) / elapsed : null;
  const trend = body.trend === 'stable' ? 'steady' : body.trend || (rate > 0 ? 'rising' : rate < 0 ? 'falling' : 'steady');
  await client.query(`INSERT INTO water_level (level_cm, trend, timestamp, min_level, max_level, device_id, distance_cm, temperature_c, quality_score)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [body.level_cm, trend, body.timestamp, body.min_level, body.max_level, deviceId, body.distance_cm, body.temperature_c, body.quality_score]);
  await usage(client, deviceId, 'readings');
  if (deviceId && process.env.ALERT_WEBHOOK_URL && process.env.ALERT_WEBHOOK_SECRET) {
    const event = { event: 'reading', device_id: deviceId, timestamp: body.timestamp, level_cm: body.level_cm, previous_level_cm: previous ? Number(previous.level_cm) : null, rate_cm_per_hour: rate };
    await client.query('INSERT INTO webhook_outbox(body) VALUES ($1)', [JSON.stringify(event)]);
  }
}
module.exports = { historyQuery, usage, transaction, insertReading };
