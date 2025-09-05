// ban.js
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
  Events,
} = require("discord.js");

/** ====== ปรับแต่งลิมิต/พฤติกรรมที่นี่ ====== */
const SWEEP = {
  MAX_FETCH_LOOPS_PER_TEXT_CHANNEL: 10,   // ดึง 100 ข้อความ/รอบ => สูงสุด ~1,000 ต่อห้อง
  MAX_FETCH_LOOPS_PER_THREAD: 5,          // สูงสุด ~500 ต่อเธรด
  DELETE_OLDER_THAN_MS: null,             // กรองอายุข้อความ (ms) | null = ไม่กรอง
  BAN_DELETE_MESSAGE_SECONDS: 7 * 24 * 60 * 60, // ลบข้อความ 7 วันย้อนหลังตอน ban
};

async function deleteMessagesInTextLikeChannel(channel, targetId, loopsMax) {
  if (!channel?.permissionsFor) return 0;
  const perms = channel.permissionsFor(channel.client.user.id);
  if (!perms?.has(PermissionsBitField.Flags.ViewChannel) ||
      !perms?.has(PermissionsBitField.Flags.ReadMessageHistory) ||
      !perms?.has(PermissionsBitField.Flags.ManageMessages)) {
    return 0;
  }

  let deletedCount = 0;
  let before;

  for (let i = 0; i < loopsMax; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;

    let targets = batch.filter(m => m.author?.id === targetId);

    if (SWEEP.DELETE_OLDER_THAN_MS != null) {
      const now = Date.now();
      targets = targets.filter(m => (now - m.createdTimestamp) <= SWEEP.DELETE_OLDER_THAN_MS);
    }

    for (const msg of targets.values()) {
      await msg.delete().catch(() => {});
      deletedCount++;
    }

    const last = batch.last();
    before = last?.id;
    if (!before) break;
  }
  return deletedCount;
}

async function sweepAllTextChannels(guild, targetId) {
  let totalDeleted = 0;

  // รวม: ห้องแชทปกติ, ประกาศ, ฟอรั่ม, แชทในห้องเสียง, แชทในสเตจ
  const textLike = guild.channels.cache.filter(ch =>
    ch.type === ChannelType.GuildText ||
    ch.type === ChannelType.GuildAnnouncement ||
    ch.type === ChannelType.GuildForum ||
    ch.type === ChannelType.GuildVoice ||          // ✅ แชทในห้องเสียง
    ch.type === ChannelType.GuildStageVoice        // ✅ แชทในห้องสเตจ
  );

  for (const channel of textLike.values()) {
    // ลบในห้องข้อความ/ประกาศ/แชทในห้องเสียง/สเตจ
    if (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildStageVoice
    ) {
      totalDeleted += await deleteMessagesInTextLikeChannel(
        channel,
        targetId,
        SWEEP.MAX_FETCH_LOOPS_PER_TEXT_CHANNEL
      );
    }

    // ฟอรั่ม + เธรด (รวมถึงเธรดของประกาศ/แชทปกติ ถ้ามี)
    if (channel.threads) {
      const [active, archived] = await Promise.all([
        channel.threads.fetchActive().catch(() => null),
        channel.threads.fetchArchived({ limit: 100 }).catch(() => null),
      ]);

      const allThreads = [];
      if (active?.threads) allThreads.push(...active.threads.values());
      if (archived?.threads) allThreads.push(...archived.threads.values());

      for (const thr of allThreads) {
        totalDeleted += await deleteMessagesInTextLikeChannel(
          thr,
          targetId,
          SWEEP.MAX_FETCH_LOOPS_PER_THREAD
        );
      }
    }
  }

  return totalDeleted;
}

async function disconnectFromVoiceIfAny(guild, targetId) {
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member?.voice?.channel) return false;

  const me = guild.members.me;
  const botPerms = member.voice.channel.permissionsFor(me);
  if (!botPerms?.has(PermissionsBitField.Flags.MoveMembers)) return false;

  await member.voice.disconnect().catch(() => {});
  return true;
}

async function banOrKick(guild, targetId, reason) {
  try {
    await guild.members.ban(targetId, {
      deleteMessageSeconds: SWEEP.BAN_DELETE_MESSAGE_SECONDS,
      reason: reason || "Moderation /ban",
    });
    return { action: "banned" };
  } catch (_) {}

  const member = await guild.members.fetch(targetId).catch(() => null);
  if (member) {
    try {
      await member.kick(reason || "Moderation /ban -> fallback kick");
      return { action: "kicked" };
    } catch (_) {}
  }
  return { action: "none" };
}

function ensureInvokerPerms(interaction) {
  const invoker = interaction.member;
  return invoker?.permissions?.has(PermissionsBitField.Flags.BanMembers);
}

module.exports = (client) => {
  // ลงทะเบียนคำสั่ง /ban
  client.once("ready", async () => {
    try {
      await client.application.commands.create(
        new SlashCommandBuilder()
          .setName("ban")
          .setDescription("ลบข้อความทุกห้อง (รวมแชทในห้องเสียง) ตัดออกจากห้องเสียง และแบน/เตะ")
          .addStringOption(o =>
            o.setName("id")
             .setDescription("Discord User ID ที่ต้องการแบน/เตะ")
             .setRequired(true)
          )
          .toJSON()
      );
      console.log("✅ Registered /ban command");
    } catch (e) {
      console.warn("⚠️ Cannot register /ban command:", e?.message || e);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "ban") return;

    if (!ensureInvokerPerms(interaction)) {
      return interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ (ต้องมีสิทธิ์ Ban Members)", ephemeral: true });
    }

    const targetId = interaction.options.getString("id", true).trim();
    if (!/^\d+$/.test(targetId)) {
      return interaction.reply({ content: "❌ รูปแบบ ID ไม่ถูกต้อง", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply("❌ ใช้คำสั่งนี้ได้เฉพาะในเซิร์ฟเวอร์");
    }

    const disconnected = await disconnectFromVoiceIfAny(guild, targetId).catch(() => false);
    const totalDeleted = await sweepAllTextChannels(guild, targetId).catch(() => 0);
    const { action } = await banOrKick(guild, targetId, `Requested by ${interaction.user.tag}`).catch(() => ({ action: "none" }));

    const lines = [];
    lines.push(`ลบข้อความที่ตรวจพบ : **${totalDeleted}** ข้อความ`);
    if (action === "banned") lines.push("⛔ ดำเนินการ: **แบน** สำเร็จ");
    else if (action === "kicked") lines.push("🚪 ดำเนินการ: **เตะออก** สำเร็จ");
    else lines.push("แบนไม่สำเร็จ");

    await interaction.editReply(lines.join("\n"));
  });
};
