const router = require('express').Router();
const { wrap, date, invalid } = require('../lib/http');
const { cached, json } = require('../lib/context');
router.get('/ea-flood-data', wrap(async (req, res) => {
  const station = req.query.station_id === undefined ? '1431TH' : req.query.station_id;
  if (typeof station !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(station)) throw invalid('station_id');
  const since = req.query.since === undefined ? new Date(Date.now() - 86400000) : date(req.query.since, 'since');
  const body = await cached(`ea:${station}`, () => json(`https://environment.data.gov.uk/flood-monitoring/id/stations/${station}/readings?_sorted&_limit=10000&since=${new Date(Date.now()-86400000).toISOString()}`));
  // Explicit older windows have their own cache entry to avoid truncating requested history.
  const source = since < new Date(Date.now()-86400000) && req.query.since ? await cached(`ea:${station}:${since.toISOString()}`, () => json(`https://environment.data.gov.uk/flood-monitoring/id/stations/${station}/readings?_sorted&_limit=10000&since=${since.toISOString()}`)) : body;
  res.json({ items: (source.items || []).filter(item => Date.parse(item.dateTime) >= since.getTime()), meta: { station, unitName: 'mASD' } });
}));
module.exports = router;
