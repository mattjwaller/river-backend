const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get pending commands for a device
router.get('/', async (req, res) => {
  const { device_id } = req.query;
  
  if (!device_id) {
    return res.status(400).json({ error: 'device_id is required' });
  }

  try {
    // Use a transaction to ensure atomicity
    const result = await db.pool.query(
      `UPDATE device_commands
       SET status = 'in_progress',
           picked_up_at = now()
       WHERE id = (
         SELECT id FROM device_commands
         WHERE device_id = $1 AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, command, payload`,
      [device_id]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'No pending commands' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching command:', err);
    res.status(500).json({ error: 'Failed to fetch command' });
  }
});

// Submit command result
router.post('/:id/result', async (req, res) => {
  const { id } = req.params;
  const { status, result } = req.body;

  if (!status || !['done', 'error'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be "done" or "error"' });
  }

  try {
    await db.pool.query(
      `UPDATE device_commands
       SET status = $1,
           updated_at = now(),
           result = $2
       WHERE id = $3`,
      [status, result, id]
    );

    res.json({ message: 'Command result updated' });
  } catch (err) {
    console.error('Error updating command result:', err);
    res.status(500).json({ error: 'Failed to update command result' });
  }
});

// Create a new command (admin endpoint)
router.post('/', async (req, res) => {
  const { device_id, command, payload } = req.body;

  if (!device_id || !command) {
    return res.status(400).json({ error: 'device_id and command are required' });
  }

  // Validate command
  const validCommands = ['restart-sensor', 'reboot', 'update-config', 'capture-snapshot'];
  if (!validCommands.includes(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  try {
    const result = await db.pool.query(
      `INSERT INTO device_commands (device_id, command, payload)
       VALUES ($1, $2, $3)
       RETURNING id, device_id, command, payload, status, created_at`,
      [device_id, command, payload || {}]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating command:', err);
    res.status(500).json({ error: 'Failed to create command' });
  }
});

// Get command status (admin endpoint)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.pool.query(
      `SELECT * FROM device_commands WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching command status:', err);
    res.status(500).json({ error: 'Failed to fetch command status' });
  }
});

module.exports = router; 