// picture.js
const { EmbedBuilder } = require("discord.js");
const crypto = require("crypto");

const PERMA_CHANNEL_ID = "1413522411025862799";

const sessions = new Map();
let clientRef = null;
let baseUrlCache = null;

function getBaseUrl() {
  if (baseUrlCache) return baseUrlCache;
  const fromEnv =
    (process.env.P_BASE_URL && process.env.P_BASE_URL.replace(/\/+$/, "")) ||
    (process.env.RENDER_EXTERNAL_URL &&
      process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, ""));
  const fallback = `http://localhost:${process.env.PORT || 3000}`;
  baseUrlCache = fromEnv || fallback;
  return baseUrlCache;
}

async function handleSlashP(interaction) {
  const id = crypto.randomBytes(16).toString("hex");
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const jumpUrl = `https://discord.com/channels/${guildId}/${channelId}`;

  sessions.set(id, {
    channelId,
    guildId,
    userId: interaction.user.id,
    jumpUrl,
  });

  setTimeout(() => {
    sessions.delete(id);
  }, 15 * 60 * 1000);

  const url = `${getBaseUrl()}/p/${id}`;

  await interaction.reply({
    content: `กดลิ้งค์เลอออ\n${url}\n\nใช้ได้15นาทีหนาาา`,
    ephemeral: true,
  });
}

async function uploadImageForSession(id, fileBuffer, fileName) {
  if (!clientRef) {
    return { ok: false, reason: "NO_CLIENT" };
  }

  const session = sessions.get(id);
  if (!session) {
    return { ok: false, reason: "NO_SESSION" };
  }

  const permaChannel = await clientRef.channels.fetch(PERMA_CHANNEL_ID);
  if (!permaChannel) {
    return { ok: false, reason: "NO_PERMA_CHANNEL" };
  }

  const msg = await permaChannel.send({
    files: [{ attachment: fileBuffer, name: fileName }],
  });

  const attachment = msg.attachments.first();
  if (!attachment) {
    return { ok: false, reason: "NO_ATTACHMENT" };
  }

  const url = attachment.url;

  const originChannel = await clientRef.channels.fetch(session.channelId);
  if (originChannel) {
    const embed = new EmbedBuilder().setColor(0x9b59b6).setImage(url);
    await originChannel.send({ embeds: [embed] });
  }

  sessions.delete(id);

  const redirectUrl =
    session.jumpUrl ||
    `https://discord.com/channels/${session.guildId}/${session.channelId}`;

  return { ok: true, redirectUrl };
}

function getSession(id) {
  return sessions.get(id);
}

function init(client) {
  if (client.pictureInit) return;
  client.pictureInit = true;
  clientRef = client;

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

  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "p") return;
      await handleSlashP(interaction);
    } catch (e) {
      console.error("Slash /p error:", e);
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: "เกิดข้อผิดพลาด ไม่สามารถสร้างลิงก์อัปโหลดได้",
            ephemeral: true,
          });
        } catch {}
      }
    }
  });
}

module.exports = {
  init,
  getSession,
  uploadImageForSession,
};
