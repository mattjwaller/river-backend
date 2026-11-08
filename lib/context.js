const fetch = require('node-fetch');
const { invalid } = require('./http');
const cache = new Map();
async function cached(key, fetcher) {
  const old = cache.get(key);
  if (old && old.until > Date.now()) return old.value;
  const value = Promise.resolve().then(fetcher);
  cache.set(key, { until: Date.now() + 900000, value });
  try { return await value; } catch (err) { cache.delete(key); throw err; }
  finally { if (cache.size > 1000) cache.delete(cache.keys().next().value); }
}
async function json(url) {
  const response = await fetch(url, { timeout: 15000, headers: { 'User-Agent': process.env.UPSTREAM_USER_AGENT || 'RiverWatch/2.0' } });
  if (!response.ok) throw Object.assign(new Error('upstream_error'), { status: 502, error: 'upstream_error' });
  return response.json();
}
function location(q) {
  const lat = q.lat === undefined ? 52.0181248 : Number(q.lat);
  const lon = q.lon === undefined ? -1.3819986 : Number(q.lon);
  if (q.lat === '' || !Number.isFinite(lat) || Math.abs(lat) > 90) throw invalid('lat');
  if (q.lon === '' || !Number.isFinite(lon) || Math.abs(lon) > 180) throw invalid('lon');
  return { lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) };
}
module.exports = { cached, json, location };
