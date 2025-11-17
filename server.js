// server.js
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

// Middleware พื้นฐาน
app.use(express.json());

// route เช็คสุขภาพ service
app.get("/", (req, res) => {
  res.send("OK");
});

// Render จะยิงเข้ามาที่ PORT ตัวนี้
app.listen(port, () => {
  console.log("🌐 Web server running on port", port);
});

// export app ให้ index.js / picture.js เอาไปต่อยอด
module.exports = app;
