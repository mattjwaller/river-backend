const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function invalid(param, error = 'invalid_parameter') {
  return Object.assign(new Error(error), { status: 400, error, param });
}
function required(value, param) {
  if (value === undefined || value === null || value === '') throw invalid(param, 'missing_parameter');
  return value;
}
function date(value, param) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid(param);
  return new Date(value);
}
function page(query, defaultLimit = 168) {
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw invalid('limit');
  if (!Number.isInteger(offset) || offset < 0) throw invalid('offset');
  return { limit, offset };
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error('API request failed:', err.message);
  res.status(status).json({ error: err.error || (status === 400 ? 'invalid_json' : 'internal_error'), ...(err.param ? { param: err.param } : {}) });
}
module.exports = { wrap, invalid, required, date, page, errorHandler };
