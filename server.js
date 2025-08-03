// server.js
const express = require("express");
const app = express();

// ไม่ว่าบอทจะตายหรือไม่ก็ยังตอบกลับเสมอ
app.get("/", (_, res) => {
  res.status(200).send("✅ Bot is running (or at least this server is)!");
});

// ฟังพอร์ตให้ Render หรือ Replit ใช้งาน
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
