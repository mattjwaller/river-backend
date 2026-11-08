const crypto = require('crypto');
const fetch = require('node-fetch');
const { transaction } = require('./readings');
const { expire } = require('../routes/commandRoutes');
async function maintenance() {
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(728194)");
    await expire(client);
    if (process.env.ENABLE_DATA_RETENTION !== 'true') return;
    // Complete UTC days only: roll up and delete the exact same disjoint window.
    await client.query(`INSERT INTO water_level_hourly(device_id,timestamp,level_cm,sample_count,min_level,max_level)
      SELECT device_id,date_trunc('hour',timestamp),AVG(level_cm),COUNT(*),MIN(COALESCE(min_level,level_cm)),MAX(COALESCE(max_level,level_cm))
      FROM water_level WHERE timestamp < date_trunc('day',now() AT TIME ZONE 'UTC') - interval '90 days' AND device_id IS NOT NULL
      GROUP BY device_id,date_trunc('hour',timestamp) ON CONFLICT (device_id,timestamp) DO NOTHING`);
    await client.query("DELETE FROM water_level WHERE timestamp < date_trunc('day',now() AT TIME ZONE 'UTC') - interval '90 days'");
    await client.query("DELETE FROM water_level_hourly WHERE timestamp < now() - interval '2 years'");
    await client.query("DELETE FROM device_logs WHERE timestamp < now() - interval '30 days'");
  });
}
let delivering = false;
async function deliverWebhooks() {
  if (delivering || !process.env.ALERT_WEBHOOK_URL || !process.env.ALERT_WEBHOOK_SECRET) return;
  delivering = true;
  try {
    await transaction(async client => {
      const { rows } = await client.query(`SELECT * FROM webhook_outbox WHERE delivered_at IS NULL AND attempts < 5 AND next_attempt_at <= now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED`);
      for (const row of rows) {
        let error = null;
        try {
          const signature = crypto.createHmac('sha256',process.env.ALERT_WEBHOOK_SECRET).update(row.body).digest('hex');
          const response = await fetch(process.env.ALERT_WEBHOOK_URL,{method:'POST',body:row.body,timeout:10000,headers:{'content-type':'application/json','x-webhook-signature':signature},redirect:'error'});
          if (!response.ok) error = `HTTP ${response.status}`;
          response.body?.destroy();
        } catch (err) { error = err.message; }
        await client.query(`UPDATE webhook_outbox SET attempts=attempts+1,last_error=$2,delivered_at=CASE WHEN $2::text IS NULL THEN now() ELSE NULL END,
          next_attempt_at=now()+($3 * interval '1 second') WHERE id=$1`,[row.id,error,Math.min(3600,5 * 2 ** row.attempts)]);
      }
    });
  } finally { delivering = false; }
}
module.exports = { maintenance, deliverWebhooks };
