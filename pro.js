// spamGuard.js
// discord.js v14

const REPORT_CHANNEL_ID = "1374405235061293148";

// ====== ปรับค่าได้ ======
const WINDOW_MS = 60 * 1000;
const UNIQUE_CHANNELS_THRESHOLD = 5;
const TIMEOUT_MS = 6 * 60 * 60 * 1000;
const MIN_LENGTH_TO_CHECK = 6;

// การกวาดลบทุกห้อง:
const PURGE_FETCH_PER_CHANNEL = 10;
const PURGE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PURGE_INCLUDE_OLDER = false;
// ========================

function normalizeContent(raw) {
  if (!raw) return "";
  let text = String(raw);

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  text = text.replace(urlRegex, (m) => {
    try {
      const u = new URL(m);
      const path1 = (u.pathname || "/").split("/").filter(Boolean)[0] || "";
      return `url:${u.hostname}/${path1}`;
    } catch {
      return "url:invalid";
    }
  });

  text = text.replace(/<@!?&?\d+>/g, "@mention");

  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}\s.,!?/@:_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function purgeUserMessagesAcrossGuild(guild, userId) {
  const now = Date.now();
  const textChannels = guild.channels.cache.filter((c) => c.isTextBased?.() && c.viewable);

  for (const [, ch] of textChannels) {
    try {
      if (!ch.permissionsFor?.(guild.members.me)?.has(["ManageMessages", "ReadMessageHistory"])) continue;

      const messages = await ch.messages.fetch({ limit: PURGE_FETCH_PER_CHANNEL }).catch(() => null);
      if (!messages) continue;

      const byUser = messages.filter((m) => m.author?.id === userId);

      const younger = byUser.filter((m) => now - m.createdTimestamp < PURGE_MAX_AGE_MS);
      const older = byUser.filter((m) => now - m.createdTimestamp >= PURGE_MAX_AGE_MS);

      if (younger.size) {
        await ch.bulkDelete(younger, true).catch(() => {});
      }

      if (PURGE_INCLUDE_OLDER && older.size) {
        for (const [, m] of older) {
          await m.delete().catch(() => {});
        }
      }
    } catch (e) {
    }
  }
}

module.exports = (client) => {
  const recent = new Map(); // recent[userId] = [{ ts, channelId, key }]

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author?.bot) return;

      const raw = message.content || "";
      const key = normalizeContent(raw);

      if (key.length < MIN_LENGTH_TO_CHECK && message.embeds.length === 0 && message.attachments.size === 0) {
        return;
      }

      const now = Date.now();
      const userId = message.author.id;

      if (!recent.has(userId)) recent.set(userId, []);
      const arr = recent.get(userId);

      while (arr.length && now - arr[0].ts > WINDOW_MS) arr.shift();
      arr.push({ ts: now, channelId: message.channelId, key });

      const sameKey = arr.filter((e) => e.key === key);
      const uniqueChannels = new Set(sameKey.map((e) => e.channelId));

      if (uniqueChannels.size >= UNIQUE_CHANNELS_THRESHOLD) {
        // ลบข้อความทริกเกอร์ทันที
        await message.delete().catch(() => {});

        // timeout ผู้กระทำ (ถ้าบอทมีสิทธิ์)
        try {
          if (message.member?.moderatable && message.member?.timeout) {
            await message.member.timeout(
              TIMEOUT_MS,
              `Auto-timeout: suspected spam across ${uniqueChannels.size} channels, key="${key}"`
            );
          }
        } catch {}

        // 🧹 กวาดลบข้อความของคนนี้ “ทุกห้อง”
        await purgeUserMessagesAcrossGuild(message.guild, userId);

        // รายงาน
        try {
          const reportCh = await client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
          if (reportCh?.isTextBased()) {
            await reportCh.send(
              [
                `**ระบบลบข้อความผู้ต้องสงสัยสแปมแล้ว**`,
                `ผู้ใช้: <@${userId}> (\`${userId}\`)`,
                `คำ/ลิงก์ที่ซ้ำ: \`${key}\``,
                `พบกระจายใน **${uniqueChannels.size} ห้อง** ภายใน ${Math.round(WINDOW_MS/1000)} วิ`,
                `${message.member?.communicationDisabledUntilTimestamp ? `Timeout ${Math.round(TIMEOUT_MS/3600000)} ชม.` : `ไม่สามารถ Timeout ได้`}`,
                `โปรดตรวจสอบ`
              ].join("\n")
            );
          }
        } catch {}

        // เคลียร์ history key นี้
        const remain = arr.filter((e) => e.key !== key);
        recent.set(userId, remain);
      }
    } catch (err) {
      console.error("spamGuard error:", err);
    }
  });
};
