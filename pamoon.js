const { Events, PermissionsBitField } = require("discord.js");
const { getFirestore } = require("firebase-admin/firestore");

module.exports = function (client) {
  const db = getFirestore();
  const bidsRef = db.collection("bids");

  // ใช้เก็บ timeout ต่อห้อง
  const bidTimeouts = new Map();

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const channel = message.channel;
    const categoryId = "1375026841114509332";
    const endCommandCategoryId = "1387466735619412030";

    // ---- 🟨 ตรวจว่าเป็น !end โดยแอดมิน ----
    if (message.content === "!end" && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const auctionName = channel.name;

      // อ่านผู้ชนะจาก Firestore
      const bidSnap = await bidsRef.doc(channel.id).get();
      if (!bidSnap.exists) return message.reply("❌ ไม่พบข้อมูลผู้ชนะในห้องนี้");

      const { userId } = bidSnap.data();

      // หาห้องในหมวดหมู่ปลายทางที่ชื่อขึ้นต้นด้วยชื่อห้อง
      const targetChannel = message.guild.channels.cache.find(
        (ch) => ch.parentId === endCommandCategoryId && ch.name.startsWith(auctionName + "-")
      );

      if (!targetChannel) return message.reply("❌ ไม่พบห้อง `" + auctionName + "-xxx` ในหมวดหมู่ปลายทาง");

      // เพิ่ม permission ให้ผู้ชนะ
      await targetChannel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      return message.reply(`✅ เพิ่ม <@${userId}> ลงในห้อง <#${targetChannel.id}> แล้ว`);
    }

    // ---- 🟧 เฉพาะห้องในหมวดหมู่ประมูล ----
    if (!channel.parentId || channel.parentId !== categoryId) return;

    const content = message.content.trim();
    const parts = content.split(" ");

    // บังคับรูปแบบ "ชื่อ ราคา" เช่น "sea 100"
    if (parts.length !== 2) return;

    const name = parts[0];
    const price = parseFloat(parts[1]);
    if (isNaN(price)) return;

    const docRef = bidsRef.doc(channel.id);
    const docSnap = await docRef.get();
    const latestBid = docSnap.exists ? docSnap.data() : null;

    if (latestBid && price <= latestBid.price) {
      const warn = await message.reply("❌ ราคาน้อยกว่าล่าสุด!");
      setTimeout(() => {
        warn.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 2000);
      return;
    }

    // 🟢 บันทึก bid ใหม่
    await docRef.set({
      name,
      price,
      userId: message.author.id,
      channelId: channel.id,
      updatedAt: Date.now()
    });

    // 🕒 ตั้ง timeout 5 นาที
    if (bidTimeouts.has(channel.id)) {
      clearTimeout(bidTimeouts.get(channel.id));
    }

    const timeout = setTimeout(async () => {
      const latest = (await docRef.get()).data();
      const msg = `# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`;
      channel.send(msg);
    }, 5 * 60 * 1000); // 5 นาที

    bidTimeouts.set(channel.id, timeout);
  });
};
