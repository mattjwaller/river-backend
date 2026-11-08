const router = require('express').Router();
const { pool } = require('../db/db');
const { wrap, required, invalid, date } = require('../lib/http');
const { scopeDevice, online } = require('../middleware/device');
const { historyQuery, transaction, insertReading } = require('../lib/readings');
router.use(scopeDevice);
router.post('/water-level', wrap(async (req, res) => {
  for (const key of ['level_cm','trend','timestamp']) required(req.body[key], key);
  if (!Number.isFinite(req.body.level_cm)) throw invalid('level_cm');
  if (!['rising','falling','steady','stable'].includes(req.body.trend)) throw invalid('trend');
  const timestamp = date(req.body.timestamp, 'timestamp').toISOString();
  await transaction(async client => {
    await insertReading(client, req.device?.external_id || null, { ...req.body, timestamp });
    if (req.device) await client.query('UPDATE devices SET last_seen_at = now() WHERE external_id = $1', [req.device.external_id]);
  });
  res.sendStatus(200);
}));
router.post('/device-status', wrap(async (req, res) => {
  for (const key of ['status','timestamp']) required(req.body[key], key);
  const timestamp = date(req.body.timestamp, 'timestamp').toISOString();
  const b = req.body;
  await transaction(async client => {
    await client.query(`INSERT INTO device_status(cpu_percent,mem_percent,disk_percent,battery,temperature,uptime_seconds,ip_address,wifi_strength,status,timestamp,device_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [b.cpu_percent,b.mem_percent,b.disk_percent,b.battery ?? null,b.temperature,b.uptime_seconds,b.ip_address,b.wifi_strength,b.status,timestamp,req.device?.external_id || null]);
    if (req.device) await client.query('UPDATE devices SET last_seen_at = now() WHERE external_id = $1', [req.device.external_id]);
  });
  res.sendStatus(200);
}));
router.get('/water-level/current', wrap(async (req, res) => {
  const id = req.device?.external_id || null;
  const { rows } = await pool.query(`SELECT * FROM water_level WHERE ($1::text IS NULL OR device_id = $1) ORDER BY timestamp DESC, id DESC LIMIT 1`, [id]);
  if (!rows.length) return res.json({ ...(id ? {device_id:id} : {}), message:'No water level data available' });
  const current = rows[0];
  const prior = await pool.query(`SELECT level_cm,timestamp FROM water_level WHERE ($1::text IS NULL OR device_id = $1)
    AND timestamp >= $2::timestamp - interval '1 hour' AND timestamp < $2 ORDER BY timestamp ASC LIMIT 1`, [id,current.timestamp]);
  const first = prior.rows[0];
  const elapsed = first ? (new Date(current.timestamp) - new Date(first.timestamp)) / 3600000 : 0;
  const rate = elapsed > 0 ? (Number(current.level_cm) - Number(first.level_cm)) / elapsed : undefined;
  res.json({ ...current, level_cm:Number(current.level_cm), trend:rate === undefined ? (current.trend === 'stable' ? 'steady' : current.trend) : rate > 0 ? 'rising' : rate < 0 ? 'falling' : 'steady',
    ...(rate === undefined ? {} : {rate_cm_per_hour:rate}), is_online:online(req.device,current.timestamp) });
}));
router.get('/water-level/history', wrap(async (req, res) => {
  const q = historyQuery(req.query,req.device?.external_id);
  const [data,meta] = await Promise.all([pool.query(q.sql,q.dataValues),pool.query(q.metaSql,q.values)]);
  const m = meta.rows[0];
  res.json({ ...(req.device ? {device_id:req.device.external_id} : {}), meta:{...q.meta,...m,total_count:Number(m.total_count),data_points:Number(m.data_points || 0)}, data:data.rows.map(r=>({...r,level_cm:Number(r.level_cm)})) });
}));
router.get('/water-level/export', wrap(async (req, res) => {
  required(req.query.device_id,'device_id'); required(req.query.start_date,'start_date'); required(req.query.end_date,'end_date');
  const q = historyQuery({...req.query,range:undefined},req.device.external_id,true);
  // Use a cursor to bound memory for large exports.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DECLARE export_rows NO SCROLL CURSOR FOR ${q.sql}`,q.values);
    res.type('text/csv').attachment('water-level.csv');
    res.write('device_id,timestamp,level_cm,trend\r\n');
    while (!res.destroyed) {
      const {rows} = await client.query('FETCH 1000 FROM export_rows');
      if (!rows.length) break;
      const csv = rows.map(r=>[req.device.external_id,new Date(r.timestamp).toISOString(),Number(r.level_cm),r.trend].join(',')).join('\r\n')+'\r\n';
      if (!res.write(csv)) await new Promise(resolve=>{res.once('drain',resolve);res.once('close',resolve);});
    }
    await client.query('COMMIT'); res.end();
  } catch (err) { await client.query('ROLLBACK'); if (res.headersSent) res.destroy(err); else throw err; }
  finally {client.release();}
}));
router.get('/device-status', wrap(async (req, res) => {
  const id = req.device?.external_id || null;
  const {rows} = await pool.query('SELECT * FROM device_status WHERE ($1::text IS NULL OR device_id = $1) ORDER BY timestamp DESC, id DESC LIMIT 1',[id]);
  if (!rows.length) return res.json(id ? {device_id:id,status:online(req.device) ? 'online':'offline',last_seen_at:req.device.last_seen_at,battery:null} : {message:'No device status data available'});
  const b=rows[0]; const last=req.device?.last_seen_at || b.timestamp;
  res.json({...b,battery:b.battery ?? null,status:online(req.device,b.timestamp) ? (b.status === 'degraded' ? 'degraded':'online'):'offline',last_seen_at:last,last_seen:last});
}));
for (const path of ['/weather/current','/weather/forecast']) router.get(path,(_,res)=>res.json({message:'Weather endpoint not implemented',status:'stubbed'}));
router.use(require('./logRoutes'));
router.use(require('./eaRoutes'));
module.exports = router;
