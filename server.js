const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const dataRoutes = require("./routes/dataRoutes");
const commandRoutes = require("./routes/commandRoutes");
const db = require("./db/db");
console.log("Data routes loaded");

// Set default API key if not in environment
if (!process.env.API_KEY) {
  process.env.API_KEY = 'river_1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n';
  console.log('Using default API key for development');
}

app.use(cors());
app.use(express.json());

// API key authentication middleware
app.use((req, res, next) => {
  // Skip API key check for health check endpoint
  if (req.path === '/') {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    console.warn(`[${new Date().toISOString()}] Unauthorized request:`, req.method, req.originalUrl);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use("/api/data", (req, res, next) => {
  console.log(`[${new Date().toISOString()}] /api/data route hit:`, req.method, req.url);
  next();
}, dataRoutes);

app.use("/api/commands", (req, res, next) => {
  console.log(`[${new Date().toISOString()}] /api/commands route hit:`, req.method, req.url);
  next();
}, commandRoutes);

app.get("/", (_, res) => {
  console.log(`[${new Date().toISOString()}] Root route hit`);
  res.send("River monitor API is running");
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;

db.initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API Key: ${process.env.API_KEY}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully.');
  process.exit();
});

process.on('exit', code => {
  console.log('Process exiting with code:', code);
});

setInterval(() => {
  console.log('App is alive at', new Date().toISOString());
}, 10000);
