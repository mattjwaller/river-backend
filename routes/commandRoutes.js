const router = require('express').Router();
const {pool} = require('../db/db');
const {wrap,required,invalid} = require('../lib/http');
const {scopeDevice} = require('../middleware/device');
const {usage,transaction} = require('../lib/readings');
async function expire(client = pool) {
  await client.query(`UPDATE device_commands SET status='error',result='expired',updated_at=now()
    WHERE status='pending' AND created_at <= now() - interval '10 minutes'`);
}
router.get('/',scopeDevice,wrap(async(req,res)=>{
  required(req.query.device_id,'device_id');
  await expire();
  const {rows}=await pool.query(`UPDATE device_commands SET status='in_progress',picked_up_at=now(),updated_at=now()
    WHERE id=(SELECT id FROM device_commands WHERE device_id=$1 AND status='pending' AND created_at > now() - interval '10 minutes'
      ORDER BY created_at ASC,id ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`,[req.device.external_id]);
  res.json(rows[0] || {message:'No pending commands'});
}));
router.post('/',scopeDevice,wrap(async(req,res)=>{
  const {device_id,command,payload,requested_by}=req.body;
  required(device_id,'device_id'); required(command,'command');
  if (!['reboot','restart-sensor','update-config','capture-snapshot'].includes(command)) return res.status(400).json({error:'unknown_command'});
  if (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload))) throw invalid('payload');
  if (requested_by !== undefined && typeof requested_by !== 'string') throw invalid('requested_by');
  const row=await transaction(async client=>{
    const {rows}=await client.query(`INSERT INTO device_commands(device_id,command,payload,requested_by) VALUES ($1,$2,$3,$4) RETURNING *`,[device_id,command,payload || {},requested_by || null]);
    await usage(client,device_id,'commands'); return rows[0];
  });
  res.status(201).json(row);
}));
router.post('/:id/result',wrap(async(req,res)=>{
  const {status,result}=req.body;
  if (!['done','error'].includes(status)) throw invalid('status');
  if (result !== undefined && typeof result !== 'string') throw invalid('result');
  const {rows}=await pool.query(`UPDATE device_commands SET status=$1,result=$2,updated_at=now()
    WHERE id::text=$3 AND status='in_progress' AND ($4::text IS NULL OR device_id=$4) RETURNING *`,
    [status,result,req.params.id,req.auth?.role === 'device' ? req.auth.device_id:null]);
  if (!rows.length) return res.status(404).json({error:'command_not_found_or_not_in_progress'});
  res.json({message:'Command result updated'});
}));
router.get('/:id',wrap(async(req,res)=>{
  await expire();
  const {rows}=await pool.query('SELECT * FROM device_commands WHERE id::text=$1',[req.params.id]);
  if (!rows.length) return res.status(404).json({error:'command_not_found'});
  res.json(rows[0]);
}));
module.exports=router;
module.exports.expire=expire;
