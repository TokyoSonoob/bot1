const { Events, PermissionsBitField } = require("discord.js");
const { getFirestore } = require("firebase-admin/firestore");

module.exports = function (client) {
  const db = getFirestore();
  const bidsRef = db.collection("bids");

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const categoryId = "1375026841114509332";
    const channel = message.channel;

    // ตรวจว่าอยู่ในหมวดหมู่ที่กำหนด
    if (!channel.parentId || channel.parentId !== categoryId) return;

    // ตรวจว่าไม่ใช่แอดมิน
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const content = message.content.trim();
    const parts = content.split(" ");

    if (parts.length !== 2) return; // ไม่ใช่รูปแบบ "ชื่อ ราคา"

    const name = parts[0];
    const price = parseFloat(parts[1]);
    if (isNaN(price)) return;

    const docRef = bidsRef.doc(channel.id);
    const docSnap = await docRef.get();

    const latestBid = docSnap.exists ? docSnap.data() : null;

    if (latestBid && price <= latestBid.price) {
      const warn = await message.reply("❌ ราคาน้อยกว่าล่าสุด!");
      setTimeout(() => warn.delete().catch(() => {}), 2000);
      return;
    }

    // บันทึกข้อมูลใหม่ลง Firestore
    await docRef.set({
      name,
      price,
      userId: message.author.id,
      channelId: channel.id,
      updatedAt: Date.now()
    });

    // เปลี่ยนชื่อห้อง
    const match = channel.name.match(/ครั้งที่-(\d+)/);
    const round = match ? match[1] : "1";
    const newName = `ครั้งที่-${round}-${price}`;

    channel.setName(newName).catch(console.error);
  });
};
