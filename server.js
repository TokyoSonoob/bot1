const express = require("express");
const app = express();
app.use(bodyParser.json());

app.post("/skin", async (req, res) => {
  const data = req.body;

  // ตัวอย่าง webhook URL ของคุณ (เปลี่ยนให้เป็นจริง)
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(500).json({ error: "Missing Discord webhook URL" });
  }

  // แปลงข้อมูลเป็นข้อความ embed fields
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
