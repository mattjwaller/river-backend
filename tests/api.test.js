const request = require('supertest');
const express = require('express');
const dataRoutes = require('../routes/dataRoutes');

// Create mock data store
const mockData = {
  waterLevel: [],
  deviceStatus: [],
  deviceLogs: []
};

// Mock the database module
jest.mock('../db/db', () => ({
  query: async (text, params) => {
    // Handle INSERT queries
    if (text.startsWith('INSERT INTO water_level')) {
      mockData.waterLevel.push({
        id: mockData.waterLevel.length + 1,
        level_cm: params[0],
        trend: params[1],
        timestamp: params[2],
        min_level: params[3],
        max_level: params[4]
      });
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO device_status')) {
      mockData.deviceStatus.push({
        id: mockData.deviceStatus.length + 1,
        cpu_percent: params[0],
        mem_percent: params[1],
        disk_percent: params[2],
        battery: params[3],
        temperature: params[4],
        uptime_seconds: params[5],
        ip_address: params[6],
        wifi_strength: params[7],
        status: params[8],
        timestamp: params[9]
      });
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO device_logs')) {
      mockData.deviceLogs.push({
        id: mockData.deviceLogs.length + 1,
        level: params[0],
        message: params[1],
        source: params[2],
        timestamp: params[3],
        metadata: params[4]
      });
      return { rows: [] };
    }

    // Handle SELECT queries
    if (text.includes('FROM water_level')) {
      return { rows: mockData.waterLevel.slice(-1) };
    }
    if (text.includes('FROM device_status')) {
      return { rows: mockData.deviceStatus.slice(-1) };
    }
    if (text.includes('FROM device_logs')) {
      // Handle log statistics query
      if (text.includes('COUNT(*)')) {
        const stats = mockData.deviceLogs.reduce((acc, log) => {
          if (!acc[log.level]) {
            acc[log.level] = {
              level: log.level,
              count: 0,
              first_seen: log.timestamp,
              last_seen: log.timestamp
            };
          }
          acc[log.level].count++;
          if (log.timestamp < acc[log.level].first_seen) {
            acc[log.level].first_seen = log.timestamp;
          }
          if (log.timestamp > acc[log.level].last_seen) {
            acc[log.level].last_seen = log.timestamp;
          }
          return acc;
        }, {});
        return { rows: Object.values(stats) };
      }

      // Handle regular log queries
      let filteredLogs = [...mockData.deviceLogs];
      
      // Extract query parameters
      const levelMatch = text.match(/level = \$(\d+)/);
      const sourceMatch = text.match(/source = \$(\d+)/);
      const limitMatch = text.match(/LIMIT \$(\d+)/);
      const offsetMatch = text.match(/OFFSET \$(\d+)/);

      if (levelMatch && params[parseInt(levelMatch[1]) - 1]) {
        filteredLogs = filteredLogs.filter(log => log.level === params[parseInt(levelMatch[1]) - 1]);
      }
      if (sourceMatch && params[parseInt(sourceMatch[1]) - 1]) {
        filteredLogs = filteredLogs.filter(log => log.source === params[parseInt(sourceMatch[1]) - 1]);
      }

      const limit = limitMatch ? params[parseInt(limitMatch[1]) - 1] : 100;
      const offset = offsetMatch ? params[parseInt(offsetMatch[1]) - 1] : 0;

      return { rows: filteredLogs.slice(offset, offset + limit) };
    }

    return { rows: [] };
  }
}));

describe('API Endpoints', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(dataRoutes);
    // Clear mock data before each test
    mockData.waterLevel = [];
    mockData.deviceStatus = [];
    mockData.deviceLogs = [];
  });

  describe('POST /water-level', () => {
    it('should save water level data', async () => {
      const data = {
        level_cm: 150,
        trend: 'rising',
        timestamp: '2024-02-20T12:00:00Z',
        min_level: 100,
        max_level: 200
      };

      const response = await request(app)
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

      const response = await request(app)
        .post('/water-level')
        .send(data);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /water-level/current', () => {
    it('should return the most recent water level', async () => {
      const data = {
        level_cm: 150,
        trend: 'rising',
        timestamp: '2024-02-20T12:00:00Z',
        min_level: 100,
        max_level: 200
      };

      await request(app)
        .post('/water-level')
        .send(data);

      const response = await request(app)
        .get('/water-level/current');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(data);
    });

    it('should return a message when no data is available', async () => {
      const response = await request(app)
        .get('/water-level/current');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'No water level data available');
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
        timestamp: '2024-02-20T12:00:00Z'
      };

      const response = await request(app)
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

      const response = await request(app)
        .post('/device-status')
        .send(data);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /device-status', () => {
    it('should return the most recent device status', async () => {
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
        timestamp: '2024-02-20T12:00:00Z'
      };

      await request(app)
        .post('/device-status')
        .send(data);

      const response = await request(app)
        .get('/device-status');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(data);
    });

    it('should return a message when no data is available', async () => {
      const response = await request(app)
        .get('/device-status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'No device status data available');
    });
  });

  describe('POST /logs', () => {
    it('should save log data', async () => {
      const data = {
        level: 'info',
        message: 'Test log message',
        source: 'test',
        timestamp: '2024-02-20T12:00:00Z',
        metadata: { test: true }
      };

      const response = await request(app)
        .post('/logs')
        .send(data);

      expect(response.status).toBe(200);
    });

    it('should handle missing required fields', async () => {
      const data = {
        level: 'info',
        // Missing message and source
        timestamp: '2024-02-20T12:00:00Z'
      };

      const response = await request(app)
        .post('/logs')
        .send(data);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /logs', () => {
    it('should return logs with filtering', async () => {
      const logs = [
        {
          level: 'info',
          message: 'Test log 1',
          source: 'test',
          timestamp: '2024-02-20T12:00:00Z'
        },
        {
          level: 'error',
          message: 'Test log 2',
          source: 'test',
          timestamp: '2024-02-20T12:01:00Z'
        }
      ];

      for (const log of logs) {
        await request(app)
          .post('/logs')
          .send(log);
      }

      const response = await request(app)
        .get('/logs?level=info');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].level).toBe('info');
    });

    it('should handle invalid query parameters', async () => {
      const response = await request(app)
        .get('/logs?limit=invalid&offset=-1');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /logs/stats', () => {
    it('should return log statistics', async () => {
      const logs = [
        {
          level: 'info',
          message: 'Test log 1',
          source: 'test',
          timestamp: '2024-02-20T12:00:00Z'
        },
        {
          level: 'error',
          message: 'Test log 2',
          source: 'test',
          timestamp: '2024-02-20T12:01:00Z'
        },
        {
          level: 'info',
          message: 'Test log 3',
          source: 'test',
          timestamp: '2024-02-20T12:02:00Z'
        }
      ];

      for (const log of logs) {
        await request(app)
          .post('/logs')
          .send(log);
      }

      const response = await request(app)
        .get('/logs/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      
      const infoStats = response.body.find(stat => stat.level === 'info');
      expect(infoStats).toBeDefined();
      expect(infoStats.count).toBe(2);
      expect(infoStats.first_seen).toBe('2024-02-20T12:00:00Z');
      expect(infoStats.last_seen).toBe('2024-02-20T12:02:00Z');

      const errorStats = response.body.find(stat => stat.level === 'error');
      expect(errorStats).toBeDefined();
      expect(errorStats.count).toBe(1);
      expect(errorStats.first_seen).toBe('2024-02-20T12:01:00Z');
      expect(errorStats.last_seen).toBe('2024-02-20T12:01:00Z');
    });
  });
}); 