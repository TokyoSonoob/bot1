// reactionDelete.js
const { PermissionsBitField, Partials, Events } = require("discord.js");

/**
 * ใช้คู่กับ client ที่เปิด partials สำหรับข้อความ/รีแอคชันแล้ว
 * เงื่อนไขลบ:
 *  - อิโมจิเป็น "❌"
 *  - ผู้กดรีแอคชันเป็นเจ้าของข้อความ หรือมีสิทธิ์ ManageMessages
 * บอทต้องมีสิทธิ์: ManageMessages (เพื่อลบข้อความ/รีแอคชัน), ViewChannel, ReadMessageHistory
 */
module.exports = (client) => {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      // ข้ามบอท
      if (user.bot) return;

      // fetch partials ให้ครบ
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (reaction.message?.partial) await reaction.message.fetch().catch(() => {});

      const message = reaction.message;
      const guild = message?.guild;
      if (!guild) return; // ทำเฉพาะในเซิร์ฟเวอร์

      // อนุญาตเฉพาะอิโมจิ ❌ (ยูนิโค้ด)
      if (reaction.emoji?.name !== "❌") return;

      // ดึง member ของผู้กด
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      const canManage = member.permissions.has(PermissionsBitField.Flags.ManageMessages);
      const isAuthor = message.author?.id === user.id;

      if (!(canManage || isAuthor)) {
        // ไม่มีสิทธิ์ลบ → เอารีแอคชันของคนนั้นออก
        await reaction.users.remove(user.id).catch(() => {});
        return;
      }

      // ลบข้อความ
      await message.delete().catch(() => {});
    } catch (err) {
      console.error("reaction delete error:", err);
    }
  });
};
