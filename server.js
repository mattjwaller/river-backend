const app = require('./app');
const db = require('./db/db');
const { maintenance, deliverWebhooks } = require('./lib/jobs');
async function start() {
  await db.initializeDatabase();
  const server = app.listen(process.env.PORT || 3000, () => console.log('River monitor API started'));
  const timers = [setInterval(() => maintenance().catch(console.error), 60 * 60 * 1000), setInterval(() => deliverWebhooks().catch(console.error), 5000)];
  timers.forEach(timer => timer.unref());
  process.on('SIGTERM', () => {
    timers.forEach(clearInterval);
    server.close(() => Promise.resolve(db.pool.end?.()).finally(() => process.exit(0)));
  });
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
