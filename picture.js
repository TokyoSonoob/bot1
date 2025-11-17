// picture.js
const { EmbedBuilder } = require("discord.js");
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const PERMA_GUILD_ID = "1401622759582466229";
const PERMA_CHANNEL_ID = "1413522411025862799";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

module.exports = function (client) {
  // กันไม่ให้ไฟล์นี้รันซ้ำ
  if (client.pictureUploadInitialized) return;
  client.pictureUploadInitialized = true;

  // ---------- สมัคร slash command /p ----------
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
  // --------------------------------------------

  const app = express();
  const port = process.env.P_PORT || 3100;
  const baseUrl = (process.env.P_BASE_URL || `http://localhost:${port}`).replace(
    /\/+$/,
    ""
  );

  const sessions = new Map();

  app.use(express.urlencoded({ extended: true }));

  // ---------- หน้าแรก มีปุ่มเดียวให้กดอัปโหลด ----------
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
    background: radial-gradient(circle at top, #2d0050 0, #050014 60%, #000 100%);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
  }
  .card {
    background: rgba(10, 10, 25, 0.9);
    border-radius: 22px;
    padding: 28px 32px;
    box-shadow: 0 0 28px rgba(151, 71, 255, 0.55);
    max-width: 360px;
    width: 100%;
    text-align: center;
  }
  h1 {
    font-size: 20px;
    margin-bottom: 18px;
  }
  .hidden-input {
    display: none;
  }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 26px;
    border-radius: 999px;
    border: none;
    font-size: 16px;
    cursor: pointer;
    background: linear-gradient(135deg, #a855f7, #ec4899);
    color: #fff;
    box-shadow: 0 0 18px rgba(236, 72, 153, 0.6);
  }
  .upload-btn:active {
    transform: scale(0.97);
  }
  .note {
    margin-top: 14px;
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
  // -------------------------------------------------------

  // ---------- รับไฟล์จากฟอร์ม ----------
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

      // ===== Embed มีแค่รูปอย่างเดียว ไม่มีข้อความ =====
      const originChannel = await client.channels.fetch(session.channelId);
      if (originChannel) {
        const embed = new EmbedBuilder().setImage(url).setColor(0x9b59b6) ;
        await originChannel.send({ embeds: [embed] });
      }

      sessions.delete(id);

      const redirectUrl =
        session.jumpUrl ||
        `https://discord.com/channels/${session.guildId}/${session.channelId}`;

      // ---------- หน้า success + อนิเมชันติ๊กถูก + redirect ----------
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
    background: radial-gradient(circle at top, #14532d 0, #020617 60%, #000 100%);
    color: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
  }
  .wrap {
    text-align: center;
  }
  .check-container {
    width: 110px;
    height: 110px;
    border-radius: 999px;
    border: 4px solid #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
    box-shadow: 0 0 24px rgba(34, 197, 94, 0.65);
    animation: pop 0.5s.ease-out forwards;
  }
  .check {
    width: 52px;
    height: 26px;
    border-left: 5px solid #bbf7d0;
    border-bottom: 5px solid #bbf7d0;
    transform: rotate(-45deg) translateY(-4px);
    transform-origin: center;
    animation: draw 0.5s 0.2s ease-out forwards;
    opacity: 0;
  }
  h1 {
    font-size: 20px;
    margin-bottom: 6px;
  }
  p {
    font-size: 14px;
    opacity: 0.85;
  }
  @keyframes pop {
    0% { transform: scale(0.6); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes draw {
    0% { opacity: 0; transform: rotate(-45deg) scale(0.6); }
    100% { opacity: 1; transform: rotate(-45deg) scale(1); }
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
      // ----------------------------------------------------
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(doneHtml);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).send("เกิดข้อผิดพลาดขณะอัปโหลด");
    }
  });
  // ---------------------------------------------------

  // ---------- ฟัง event /p ----------
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

      const url = `${baseUrl}/p/${id}`;

      await interaction.reply({
        content:
          `กดลิ้งค์เลอออ\n${url}\n\n` +
          `ใช้ได้15นาทีหนาาา`,
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
  // ----------------------------------

  app.listen(port, () => {
    console.log("P upload web listening on port", port);
  });
};
