// antiEveryone.js  (discord.js v14)
const { Events, PermissionsBitField } = require("discord.js");

// เซิร์ฟเวอร์ที่ให้บอททำงานเท่านั้น
const TARGET_GUILD_ID = "1336555551970164839";
// โรลที่ได้รับอนุญาตให้ใช้ @everyone
const ALLOWED_ROLE_ID = "1336564600598036501";
// เวลาค้างข้อความแจ้งเตือนก่อนลบ
const TEMP_NOTICE_MS = 5000;

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      // ข้าม DM/บอท/system และข้ามถ้าไม่ใช่เซิร์ฟเวอร์เป้าหมาย
      if (!message.guild || message.author.bot || message.system) return;
      if (message.guild.id !== TARGET_GUILD_ID) return;

      const member = message.member;
      if (!member) return;
      if (member.roles.cache.has(ALLOWED_ROLE_ID)) return;
      const normalized = (message.content || "").replace(/[\u200B-\u200D\uFEFF]/g, "");

      // ตรวจเฉพาะ @everyone (ไม่รวม @here)
      const usedEveryone = /(^|\s)@everyone(\b|[\s!,.?;:])/i.test(normalized);
      if (!usedEveryone) return;

      // สิทธิ์ลบข้อความ
      const me = message.guild.members.me ?? (await message.guild.members.fetchMe());
      const canManage = me
        .permissionsIn(message.channel)
        .has(PermissionsBitField.Flags.ManageMessages);
      if (!canManage) {
        console.warn(`[antiEveryone] Missing ManageMessages in #${message.channel?.name || message.channelId}`);
        return;
      }

      // ลบและแจ้งเตือนชั่วคราว
      await message.delete().catch(() => {});
      const notice = await message.channel
        .send(`<@${member.id}> ห้ามใช้ แท็ค everyone`)
        .catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => {}), TEMP_NOTICE_MS);
    } catch (err) {
      console.error("[antiEveryone] Error:", err);
    }
  });
};
