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
        WHERE timestamp >= (SELECT timestamp - INTERVAL '24 hours' FROM latest_level)
          AND timestamp <= (SELECT timestamp FROM latest_level)
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

    // Log the raw database result
    console.log('Raw database result:', {
      row: result.rows[0],
      min_level_type: typeof result.rows[0].min_level,
      max_level_type: typeof result.rows[0].max_level,
      min_level_value: result.rows[0].min_level,
      max_level_value: result.rows[0].max_level
    });

    // Create the response object explicitly
    const response = {
      id: result.rows[0].id,
      level_cm: result.rows[0].level_cm,
      trend: result.rows[0].trend,
      timestamp: result.rows[0].timestamp,
      reading_count: result.rows[0].reading_count,
      min_level: Number(result.rows[0].min_level),
      max_level: Number(result.rows[0].max_level),
      avg_level: Number(result.rows[0].avg_level),
      min_timestamp: result.rows[0].min_timestamp,
      max_timestamp: result.rows[0].max_timestamp
    };

    // Log the response object
    console.log('Response object:', {
      response,
      min_level_type: typeof response.min_level,
      max_level_type: typeof response.max_level,
      min_level_value: response.min_level,
      max_level_value: response.max_level
    });

    res.json(response);
  } catch (err) {
    console.error('Error fetching latest water level:', err);
    res.status(500).json({ error: 'Failed to fetch latest water level' });
  }
}); 