const request = require('supertest');
const mockState = { readings:[], logs:[], tokens:[] };
const mockQuery = jest.fn(async (sql, p=[]) => {
  if (sql.includes('FROM devices WHERE external_id')) return {rows:['pi-001','pi-002'].includes(p[0])?[{external_id:p[0],last_seen_at:new Date().toISOString()}]:[]};
  if (sql.includes('FROM device_tokens')) return {rows:mockState.tokens.filter(t=>t.token_hash===p[0])};
  if (sql.startsWith('INSERT INTO water_level ')) mockState.readings.push({id:mockState.readings.length+1,level_cm:p[0],trend:p[1],timestamp:p[2],device_id:p[5]});
  if (sql.startsWith('SELECT * FROM water_level WHERE')) return {rows:mockState.readings.filter(r=>!p[0]||r.device_id===p[0]).slice(-1)};
  if (sql.startsWith('INSERT INTO device_logs')) mockState.logs.push({device_id:p[0],level:p[1],source:'sensor',message:p[2]});
  if (sql.startsWith('SELECT * FROM device_logs')) return {rows:mockState.logs.filter(r=>r.device_id===p[0])};
  if (sql.includes('SELECT COUNT(*) AS total_count')) return {rows:[{total_count:'0'}]};
  return { rows:[] };
});
jest.mock('../db/db',()=>({pool:{query:mockQuery,connect:async()=>({query:mockQuery,release(){}})}}));
jest.mock('node-fetch',()=>jest.fn());
const fetch=require('node-fetch');
const app=require('../app');
const {digest}=require('../middleware/auth');
const call=(method,url)=>request(app)[method](url).set('x-api-key','server-test');
beforeEach(()=>{
  process.env.RIVERWATCH_API_KEY='server-test';process.env.ADMIN_API_KEY='admin-test';process.env.API_KEY='legacy-test';
  mockState.readings=[];mockState.logs=[];mockState.tokens=[{device_id:'pi-001',token_hash:digest('dev_test')}];mockQuery.mockClear();
});
test('two Pis post different levels and scoped reads stay separate',async()=>{
  for(const [device_id,level_cm] of [['pi-001',58.2],['pi-002',91.7]]){
    expect((await call('post','/api/telemetry').send({device_id,timestamp:new Date().toISOString(),readings:{level_cm},diagnostics:{}})).status).toBe(200);
  }
  expect((await call('get','/api/data/water-level/current?device_id=pi-001')).body.level_cm).toBe(58.2);
  expect((await call('get','/api/data/water-level/current?device_id=pi-002')).body.level_cm).toBe(91.7);
});
test.each(['/api/data/water-level/current','/api/data/water-level/history?range=24h','/api/data/device-status','/api/logs','/api/commands'])('unknown devices return 404: %s',async path=>{
  const res=await call('get',path+(path.includes('?')?'&':'?')+'device_id=missing');expect(res.status).toBe(404);expect(res.body.error).toBe('device_not_found');
});
test('device token cannot access other devices or create commands',async()=>{
  expect((await request(app).post('/api/telemetry').set('Authorization','Bearer dev_test').send({device_id:'pi-002'})).status).toBe(403);
  expect((await request(app).post('/api/commands').set('Authorization','Bearer dev_test').send({device_id:'pi-001',command:'reboot'})).status).toBe(403);
  expect((await request(app).get('/api/logs').set('Authorization','Bearer dev_test')).status).toBe(403);
});
test('revoked or unknown tokens fail closed',async()=>{
  mockState.tokens=[];expect((await request(app).get('/api/commands').set('Authorization','Bearer dev_test')).status).toBe(401);
});
test('token issuance requires admin',async()=>expect((await call('post','/api/devices/pi-001/tokens').send({})).status).toBe(403));
test('unknown commands are rejected',async()=>{
  const res=await call('post','/api/commands').send({device_id:'pi-001',command:'shell'});expect(res.status).toBe(400);expect(res.body.error).toBe('unknown_command');
});
test('missing telemetry timestamp identifies parameter',async()=>{
  const res=await call('post','/api/telemetry').send({device_id:'pi-001',readings:{level_cm:5}});expect(res.status).toBe(400);expect(res.body.param).toBe('timestamp');
});
test('sensor faults persist without a bogus reading',async()=>{
  expect((await call('post','/api/telemetry').send({device_id:'pi-001',timestamp:new Date().toISOString(),readings:{fault:'echo_timeout'}})).status).toBe(200);
  expect(mockState.readings).toHaveLength(0);expect((await call('get','/api/logs?device_id=pi-001')).body[0]).toMatchObject({source:'sensor',level:'error'});
});
test('history scopes SQL and validates resolution',async()=>{
  expect((await call('get','/api/data/water-level/history?device_id=pi-001&range=24h&resolution=15min')).status).toBe(200);
  expect(mockQuery.mock.calls.some(([sql,p])=>sql.includes('WITH samples')&&p[2]==='pi-001')).toBe(true);
  expect((await call('get','/api/data/water-level/history?range=24h&resolution=bad')).status).toBe(400);
});
test('forecast validates coordinates',async()=>expect((await call('get','/api/forecast?lat=91')).status).toBe(400));
test('EA stations use separate upstream requests and a cache',async()=>{
  fetch.mockResolvedValue({ok:true,json:async()=>({items:[]})});
  for(const station of ['test-a','test-b','test-a'])expect((await call('get',`/api/data/ea-flood-data?station_id=${station}`)).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('legacy key can be disabled for cutover',async()=>{
  process.env.ALLOW_LEGACY_API_KEY='false';expect((await request(app).get('/api/logs').set('x-api-key','legacy-test')).status).toBe(401);delete process.env.ALLOW_LEGACY_API_KEY;
});
