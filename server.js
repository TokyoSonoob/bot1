const express = require("express");
const fetch = require("node-fetch"); // หรือใช้ built-in fetch ใน Node 18+
const cors = require("cors");
const app = express();
app.use(cors());

// แก้ตรงนี้ ใช้ express.json() แทน bodyParser.json()
app.use(express.json());

app.get("/", (_, res) => {
  res.send("Bot is running!");
});

app.post("/skin", async (req, res) => {
  const data = req.body;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(500).json({ error: "Missing Discord webhook URL" });
  }

  const fields = Object.entries(data).map(([key, value]) => ({
    name: key,
    value: value || "-",
    inline: false,
  }));

  const payload = {
    content: "**📥 ฟอร์มสั่งสกินใหม่เข้ามาแล้ว!**",
    embeds: [
      {
        title: "รายละเอียดการสั่งสกิน",
        color: 0xa24dfd,
        fields: fields,
        footer: { text: "Sea muww 乂" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Failed to send webhook");

    res.json({ message: "ส่งข้อมูลสำเร็จ" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ส่งข้อมูลล้มเหลว" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
