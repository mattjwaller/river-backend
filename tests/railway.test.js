const request = require('supertest');

const API_URL = 'https://river-backend-production.up.railway.app';

describe('Railway Backend API Tests', () => {
  describe('POST /water-level', () => {
    it('should save water level data', async () => {
      const data = {
        level_cm: 150,
        trend: 'rising',
        timestamp: new Date().toISOString(),
        min_level: 100,
        max_level: 200
      };
      const response = await request(API_URL)
        .post('/water-level')
        .send(data);
      expect(response.status).toBe(200);
    });

    it('should handle missing required fields', async () => {
      const data = {
        level_cm: 150,
        // Missing trend and timestamp
        min_level: 100,
        max_level: 200
      };
      const response = await request(API_URL)
        .post('/water-level')
        .send(data);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /water-level/current', () => {
    it('should return the most recent water level', async () => {
      const response = await request(API_URL)
        .get('/water-level/current');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('level_cm');
    });
  });

  describe('POST /device-status', () => {
    it('should save device status data', async () => {
      const data = {
        cpu_percent: 45,
        mem_percent: 60,
        disk_percent: 75,
        battery: 85,
        temperature: 35,
        uptime_seconds: 3600,
        ip_address: '192.168.1.100',
        wifi_strength: -65,
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
      const response = await request(API_URL)
        .post('/device-status')
        .send(data);
      expect(response.status).toBe(200);
    });

    it('should handle missing required fields', async () => {
      const data = {
        cpu_percent: 45,
        // Missing mem_percent, disk_percent, status, and timestamp
        battery: 85,
        temperature: 35
      };
      const response = await request(API_URL)
        .post('/device-status')
        .send(data);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /device-status', () => {
    it('should return the most recent device status', async () => {
      const response = await request(API_URL)
        .get('/device-status');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cpu_percent');
    });
  });

  describe('POST /logs', () => {
    it('should save log data', async () => {
      const data = {
        level: 'info',
        message: 'Test log message',
        source: 'test',
        timestamp: new Date().toISOString(),
        metadata: { test: true }
      };
      const response = await request(API_URL)
        .post('/logs')
        .send(data);
      expect(response.status).toBe(200);
    });

    it('should handle missing required fields', async () => {
      const data = {
        level: 'info',
        // Missing message and source
        timestamp: new Date().toISOString()
      };
      const response = await request(API_URL)
        .post('/logs')
        .send(data);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /logs', () => {
    it('should return logs with filtering', async () => {
      const response = await request(API_URL)
        .get('/logs?level=info');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle invalid query parameters', async () => {
      const response = await request(API_URL)
        .get('/logs?limit=invalid&offset=-1');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /logs/stats', () => {
    it('should return log statistics', async () => {
      const response = await request(API_URL)
        .get('/logs/stats');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('level');
      expect(response.body[0]).toHaveProperty('count');
    });
  });
}); 