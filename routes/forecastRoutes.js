const router = require('express').Router();
const { wrap, invalid } = require('../lib/http');
const { location, cached, json } = require('../lib/context');
async function points(query) {
  const { lat, lon } = location(query);
  const body = await cached(`forecast:${lat}:${lon}`, () => json(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`));
  return (body.properties?.timeseries || []).map(p => {
    const d = p.data.instant.details;
    const next = p.data.next_1_hours || p.data.next_6_hours || {};
    return { timestamp:p.time,location_lat:lat,location_lon:lon,temperature_c:d.air_temperature,pressure_hpa:d.air_pressure_at_sea_level,
      wind_speed_mps:d.wind_speed,relative_humidity_percent:d.relative_humidity,precipitation_mm:next.details?.precipitation_amount || 0,
      precipitation_hours:p.data.next_1_hours ? 1:6,symbol_code:next.summary?.symbol_code || 'unknown',forecast_created_at:body.properties.meta.updated_at };
  });
}
router.get('/',wrap(async(req,res)=>{
  const range=req.query.range || '48h';
  if (!['6h','24h','48h','7d','14d'].includes(range)) throw invalid('range');
  const hours=parseInt(range,10)*(range.endsWith('d')?24:1), now=Date.now();
  const all=(await points(req.query)).filter(p=>Date.parse(p.timestamp)>=now-3600000 && Date.parse(p.timestamp)<=now+hours*3600000);
  const data=hours>48 ? all.filter(p=>new Date(p.timestamp).getUTCHours()%6===0):all;
  const intervals=data.slice(1).map((p,i)=>(Date.parse(p.timestamp)-Date.parse(data[i].timestamp))/3600000);
  res.json({meta:{range,start_time:new Date(now-3600000).toISOString(),end_time:new Date(now+hours*3600000).toISOString(),data_points:data.length,
    expected_points:hours>48?Math.ceil(hours/6):hours,forecast_created_at:data[0]?.forecast_created_at || null,time_block:hours>48?'6 hours':'1 hour',normalized:hours>48,interval_hours:hours>48?6:1,intervals},data});
}));
router.get('/summary',wrap(async(req,res)=>{
  const now=Date.now(), all=(await points(req.query)).filter(p=>Date.parse(p.timestamp)>=now-3600000 && Date.parse(p.timestamp)<=now+72*3600000);
  const p=all[0];
  const current=p?{temperature:Math.round(p.temperature_c),wind:Math.round(p.wind_speed_mps),rain:p.precipitation_mm,pressure:Math.round(p.pressure_hpa),humidity:Math.round(p.relative_humidity_percent),condition:p.symbol_code}:null;
  const groups=new Map();
  for(const p of all){const day=p.timestamp.slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(p);}
  const forecast=[...groups].slice(0,3).map(([day,ps],i)=>({day:i===0?'Today':i===1?'Tomorrow':new Date(day).toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'}),
    condition:ps[0].symbol_code,max:Math.round(Math.max(...ps.map(p=>p.temperature_c))),min:Math.round(Math.min(...ps.map(p=>p.temperature_c))),
    rain:ps.reduce((s,p)=>s+p.precipitation_mm,0),humidity:Math.round(ps.reduce((s,p)=>s+p.relative_humidity_percent,0)/ps.length)}));
  res.json({current,forecast});
}));
router.get('/latest',wrap(async(req,res)=>res.json(await points(req.query))));
router.post('/fetch',wrap(async(req,res)=>res.json({message:'Weather forecast data updated successfully',stats:{received:(await points(req.query)).length}})));
module.exports=router;
