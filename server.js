const express = require("express");
const fetch = require("node-fetch"); // ติดตั้งด้วย npm install node-fetch

const app = express();

const BOT_ID = "myBot1"; // ตั้งชื่อบอทของคุณ
const TARGET_URL = `https://webfor-run.vercel.app/ping/${BOT_ID}`;

// ฟังก์ชันยิง ping
async function sendPing() {
  try {
    const res = await fetch(TARGET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "alive" })
    });

    if (res.ok) {
      console.log(`✅ Ping sent to server (${BOT_ID})`);
    } else {
      console.log(`⚠️ Server responded with status ${res.status}`);
    }
  } catch (err) {
    console.error("❌ Error sending ping:", err.message);
  }
}

// ยิงทุกๆ 30 วินาที
setInterval(sendPing, 30 * 1000);

// หน้าหลักของบอท
app.get("/", (_, res) => {
  res.send("Bot is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  sendPing(); // ยิงทันทีตอนเริ่ม
});
