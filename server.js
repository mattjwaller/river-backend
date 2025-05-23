
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const dataRoutes = require("./routes/dataRoutes");

app.use(cors());
app.use(express.json());
app.use("/api/data", dataRoutes);

app.get("/", (_, res) => res.send("River monitor API is running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
