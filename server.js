const express = require("express");
const cors = require("cors");
const app = express();
// require("dotenv").config(); // Not needed in Railway production

const dataRoutes = require("./routes/dataRoutes");
console.log("Data routes loaded");

app.use(cors());
app.use(express.json());
app.use("/api/data", (req, res, next) => {
  console.log(`[${new Date().toISOString()}] /api/data route hit:`, req.method, req.url);
  next();
}, dataRoutes);

app.get("/", (_, res) => {
  console.log(`[${new Date().toISOString()}] Root route hit`);
  res.send("River monitor API is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

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
