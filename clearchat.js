// clearchat.js  (discord.js v14)
const { Events, PermissionsBitField } = require("discord.js");

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const raw = message.content.trim();

      // จับคำสั่ง:
      // !chat123456789012345678
      // !chat 123456789012345678
      // !chat <https://discord.com/channels/g/c/123456789012345678>
      const cmd = raw.match(
        /^!chat\s*(?:<?https?:\/\/discord\.com\/channels\/\d+\/\d+\/)?(\d{17,20})>?$/i
      );
      if (!cmd) return;

      const targetId = cmd[1];

      // สิทธิ์ผู้สั่ง
      const memberHasPerm =
        message.member.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages) ||
        message.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!memberHasPerm) {
        return message.reply("❌ คุณต้องมีสิทธิ์ **Manage Messages**").catch(() => {});
      }

      // สิทธิ์บอท
      const botHasPerm = message.guild.members.me
        ?.permissionsIn(message.channel)
        .has(PermissionsBitField.Flags.ManageMessages);
      if (!botHasPerm) {
        return message.reply("❌ บอทไม่มีสิทธิ์ **Manage Messages** ในห้องนี้").catch(() => {});
      }

      // เช็คว่า message เป้าหมายอยู่ในห้องนี้
      let targetMsg;
      try {
        targetMsg = await message.channel.messages.fetch(targetId);
      } catch {
        return message.reply("❌ ไม่พบข้อความเป้าหมายในห้องนี้ (อาจถูกลบไปแล้วหรืออยู่คนละห้อง)").catch(() => {});
      }

      // สร้างรายการที่จะลบ: จาก "ล่าสุด" ไล่ลงไปจนถึงและรวม target
      const toDelete = [];
      let beforeCursor = undefined;
      let found = false;
      const HARD_LIMIT = 20000; // กันดึงเยอะเกิน

      while (!found) {
        const batch = await message.channel.messages.fetch({ limit: 100, ...(beforeCursor ? { before: beforeCursor } : {}) });
        if (batch.size === 0) break;

        for (const msg of batch.values()) {
          toDelete.push(msg);
          if (msg.id === targetId) { found = true; break; }
        }
        const lastMsg = batch.last();
        beforeCursor = lastMsg ? lastMsg.id : undefined;

        if (toDelete.length >= HARD_LIMIT) break;
      }

      if (!found) {
        return message.reply("❌ หาไม่เจอข้อความเป้าหมายในประวัติ (ลึกเกินลิมิตหรือถูกลบไปแล้ว)").catch(() => {});
      }

      // แยก <14 วัน (ลบแบบ bulk ได้) / ≥14 วัน (ต้องลบทีละข้อความ)
      const now = Date.now();
      const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

      let youngCount = 0; // จำนวนบนๆ ที่อายุน้อยกว่า 14 วัน
      for (const m of toDelete) {
        if (now - m.createdTimestamp < MAX_AGE) youngCount++;
        else break; // เจอเกิน 14 วันแล้ว ที่เหลือจะเกินทั้งหมด
      }

      const total = toDelete.length;
      const oldCount = total - youngCount;

      // 1) ลบแบบ bulk ทีละไม่เกิน 100 (ไม่ส่งข้อความแจ้งก่อน เพื่อลดโอกาสโดนลบไปด้วย)
      let remaining = youngCount;
      while (remaining > 0) {
        const n = Math.min(remaining, 100);
        const del = await message.channel.bulkDelete(n, true).catch(() => null);
        const did = del?.size ?? 0;
        if (did === 0) break; // กันลูปค้างกรณีพิเศษ
        remaining -= did;
      }

      // 2) ลบส่วนที่ ≥14 วัน ทีละข้อความ (จากใหม่ของชุดนี้ไปหาเก่าสุด)
      for (const msg of toDelete.slice(youngCount)) {
        try { await msg.delete(); }
        catch { /* ข้ามถ้าลบไม่ได้ (ระบบ/สิทธิ์/pin ที่ลบไม่ได้) */ }
        await wait(150); // เผื่อ rate limit
      }

      // แจ้งสรุป
      const done = await message.channel.send(
        `# ✅ ลบเสร็จแล้ว ${total} ข้อความ`
      ).catch(() => null);
      if (done) setTimeout(() => done.delete().catch(() => {}), 4000);

    } catch (err) {
      console.error("clearchat error:", err);
      message.channel.send("⚠️ มีข้อผิดพลาดในการลบข้อความ").then(m => {
        setTimeout(() => m.delete().catch(() => {}), 4000);
      }).catch(() => {});
    }
  });
};

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}
