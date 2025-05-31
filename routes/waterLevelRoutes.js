router.get('/latest', async (req, res) => {
  console.log('GET /water-level/latest request received');
  try {
    // Get the latest water level
    const result = await db.pool.query(`
      WITH latest_level AS (
        SELECT 
          id,
          level_cm,
          trend,
          timestamp
        FROM water_level
        ORDER BY timestamp DESC
        LIMIT 1
      ),
      daily_stats AS (
        SELECT 
          COUNT(*) as reading_count,
          MIN(level_cm) as min_level,
          MAX(level_cm) as max_level,
          ROUND(AVG(level_cm)::numeric, 1) as avg_level,
          MIN(timestamp) FILTER (WHERE level_cm = MIN(level_cm)) as min_timestamp,
          MIN(timestamp) FILTER (WHERE level_cm = MAX(level_cm)) as max_timestamp
        FROM water_level
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
      )
      SELECT 
        l.id,
        l.level_cm,
        l.trend,
        l.timestamp,
        s.reading_count,
        s.min_level,
        s.max_level,
        s.avg_level,
        s.min_timestamp,
        s.max_timestamp
      FROM latest_level l
      CROSS JOIN daily_stats s
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No water level data available' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching latest water level:', err);
    res.status(500).json({ error: 'Failed to fetch latest water level' });
  }
}); 