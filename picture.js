// picture.js
const express = require("express");
const { EmbedBuilder } = require("discord.js");
const multer = require("multer");
const crypto = require("crypto");

const PERMA_GUILD_ID = "1401622759582466229";
const PERMA_CHANNEL_ID = "1413522411025862799";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

module.exports = function (client, app, baseUrlFromIndex) {
  if (client.pictureUploadInitialized) return;
  client.pictureUploadInitialized = true;

  if (!app) {
    throw new Error("picture.js ต้องถูกเรียกด้วย Express app: require('./picture')(client, app, baseUrl)");
  }

  const sessions = new Map();

  const resolvedBaseUrl =
    (baseUrlFromIndex && baseUrlFromIndex.replace(/\/+$/, "")) ||
    (process.env.P_BASE_URL && process.env.P_BASE_URL.replace(/\/+$/, "")) ||
    (process.env.RENDER_EXTERNAL_URL &&
      process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "")) ||
    "http://localhost:3000";

  client.once("ready", async () => {
    try {
      if (!client.application) return;
      if (client.pictureSlashRegistered) return;
      client.pictureSlashRegistered = true;

      await client.application.commands.create({
        name: "p",
        description: "สร้างเว็บอัปโหลดรูปภาพให้เป็นลิงก์ถาวร",
      });

      console.log("✅ Registered /p command (global)");
    } catch (err) {
      console.error("Register /p command error:", err);
    }
  });

  app.use(express.urlencoded({ extended: true }));

  app.get("/p/:id", (req, res) => {
    const id = req.params.id;
    const session = sessions.get(id);
    if (!session) {
      res.status(404).send("Session not found or expired.");
      return;
    }

    const html = `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<title>อัปโหลดรูปภาพ</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: radial-gradient(circle at top, #3b0066 0, #0a0018 60%, #000 100%);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    animation: bgPulse 6s ease-in-out infinite;
  }
  @keyframes bgPulse {
    0%,100% { filter: brightness(1); }
    50% { filter: brightness(1.25); }
  }
  .card {
    background: rgba(20, 10, 35, 0.85);
    border-radius: 26px;
    padding: 32px 36px;
    box-shadow: 0 0 40px rgba(151, 71, 255, 0.85), 0 0 70px rgba(151, 71, 255, 0.35);
    max-width: 380px;
    width: 100%;
    text-align: center;
    animation: float 3.5s ease-in-out infinite;
  }
  @keyframes float {
    0%,100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }
  h1 {
    font-size: 22px;
    margin-bottom: 16px;
    letter-spacing: 0.5px;
  }
  .hidden-input { display: none; }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 32px;
    border-radius: 999px;
    border: none;
    font-size: 17px;
    cursor: pointer;
    background: linear-gradient(135deg, #a855f7, #ec4899);
    color: #fff;
    box-shadow: 0 0 25px rgba(236, 72, 153, 0.8), 0 0 45px rgba(168, 85, 247, 0.5);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { transform: scale(1); }
    50% { transform: scale(1.07); }
  }
  .upload-btn:active {
    transform: scale(0.95);
  }
  .note {
    margin-top: 16px;
    font-size: 12px;
    opacity: 0.7;
  }
</style>
</head>
<body>
<div class="card">
  <h1>อัปโหลดรูปภาพ</h1>
  <form id="uploadForm" method="post" enctype="multipart/form-data">
    <input id="fileInput" class="hidden-input" type="file" name="image" accept="image/*" required />
    <button type="button" id="uploadBtn" class="upload-btn">
      อัปโหลดรูปภาพ
    </button>
  </form>
  <div class="note">รองรับไฟล์ภาพไม่เกิน 8MB</div>
</div>
<script>
  const fileInput = document.getElementById("fileInput");
  const form = document.getElementById("uploadForm");
  const btn = document.getElementById("uploadBtn");

  btn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (!fileInput.files || !fileInput.files[0]) return;
    btn.disabled = true;
    btn.textContent = "กำลังอัปโหลด...";
    form.submit();
  });
</script>
</body>
</html>
`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.post("/p/:id", upload.single("image"), async (req, res) => {
    const id = req.params.id;
    const session = sessions.get(id);
    if (!session) {
      res.status(404).send("Session not found or expired.");
      return;
    }
    if (!req.file) {
      res.status(400).send("กรุณาเลือกรูปภาพก่อน");
      return;
    }

    try {
      const permaChannel = await client.channels.fetch(PERMA_CHANNEL_ID);
      if (!permaChannel) {
        res.status(500).send("ไม่พบห้องเก็บรูปถาวรใน Discord");
        return;
      }

      const fileName = req.file.originalname || "image.png";
      const msg = await permaChannel.send({
        files: [{ attachment: req.file.buffer, name: fileName }],
      });

      const attachment = msg.attachments.first();
      if (!attachment) {
        res.status(500).send("อัปโหลดขึ้น Discord ไม่สำเร็จ");
        return;
      }

      const url = attachment.url;

      const originChannel = await client.channels.fetch(session.channelId);
      if (originChannel) {
        const embed = new EmbedBuilder().setColor(0x9b59b6).setImage(url);
        await originChannel.send({ embeds: [embed] });
      }

      sessions.delete(id);

      const redirectUrl =
        session.jumpUrl ||
        `https://discord.com/channels/${session.guildId}/${session.channelId}`;

      const doneHtml = `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<title>อัปโหลดสำเร็จ</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: radial-gradient(circle at top, #064e3b 0, #001b14 70%, #000 100%);
    color: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    animation: bgPulse 5s ease-in-out infinite;
  }
  @keyframes bgPulse {
    0%,100% { filter: brightness(1); }
    50% { filter: brightness(1.3); }
  }
  .wrap { text-align: center; }
  .check-container {
    width: 130px;
    height: 130px;
    border-radius: 999px;
    border: 5px solid #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    box-shadow: 0 0 40px rgba(34, 197, 94, 0.75), 0 0 80px rgba(34, 197, 94, 0.45);
    animation: pop 0.4s ease-out forwards, float 3s ease-in-out infinite 0.4s;
  }
  @keyframes pop {
    0% { transform: scale(0.4); opacity: 0; }
    80% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes float {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  .check {
    width: 60px;
    height: 30px;
    border-left: 6px solid #bbf7d0;
    border-bottom: 6px solid #bbf7d0;
    transform: rotate(-45deg) translateY(-4px);
    opacity: 0;
    animation: draw 0.35s 0.25s ease-out forwards;
  }
  @keyframes draw {
    0% { opacity: 0; transform: rotate(-45deg) scale(0.5); }
    100% { opacity: 1; transform: rotate(-45deg) scale(1); }
  }
  h1 {
    font-size: 22px;
    margin-bottom: 8px;
  }
  p {
    font-size: 15px;
    opacity: 0.9;
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="check-container">
    <div class="check"></div>
  </div>
  <h1>อัปโหลดสำเร็จ</h1>
  <p>กำลังกลับไปที่ห้อง Discord ของคุณ...</p>
</div>
<script>
  setTimeout(function () {
    window.location.href = ${JSON.stringify(redirectUrl)};
  }, 1500);
</script>
</body>
</html>
`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(doneHtml);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).send("เกิดข้อผิดพลาดขณะอัปโหลด");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "p") return;

      const id = crypto.randomBytes(16).toString("hex");
      const guildId = interaction.guildId;
      const channelId = interaction.channelId;
      const jumpUrl = `https://discord.com/channels/${guildId}/${channelId}`;

      sessions.set(id, {
        channelId,
        userId: interaction.user.id,
        guildId,
        jumpUrl,
      });

      setTimeout(() => {
        sessions.delete(id);
      }, 15 * 60 * 1000);

      const url = `${resolvedBaseUrl}/p/${id}`;

      await interaction.reply({
        content: `กดลิ้งค์เลอออ\n${url}\n\nใช้ได้15นาทีหนาาา`,
        ephemeral: true,
      });
    } catch (e) {
      console.error("Slash /p error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "เกิดข้อผิดพลาด ไม่สามารถสร้างลิงก์อัปโหลดได้",
          ephemeral: true,
        });
      }
    }
  });
};
