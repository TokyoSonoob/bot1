const { Events, PermissionsBitField } = require("discord.js");
const admin = require("firebase-admin");
const schedule = require("node-schedule");

const db = admin.firestore();
const bidsRef = db.collection("bids");

module.exports = function (client) {
  const bidTimeouts = new Map();

  const weekdayMap = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  async function cleanOrphanBids() {
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error("❌ ไม่พบ guild ใน client");
      return;
    }

    const snapshot = await bidsRef.get();
    for (const doc of snapshot.docs) {
      const channelId = doc.id;
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        console.log(`❌ ไม่พบห้อง ${channelId} ใน guild. ลบข้อมูลจาก Firestore...`);
        await bidsRef.doc(channelId).delete().catch(console.error);
      }
    }
  }


client.once("ready", async () => {
  await cleanOrphanBids();

  const weekdayMap = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  schedule.scheduleJob("0 20 * * *", async () => {
    const now = new Date();
    const today = now.getDay(); // Sunday = 0

    console.log(`🔍 ตรวจสอบปิดประมูล เวลา ${now.toLocaleString("th-TH")}`);

    // ปิดแค่วันอังคาร(2), พฤหัสบดี(4), เสาร์(6)
    const allowedDays = [2, 5, 6];
    if (!allowedDays.includes(today)) {
      console.log(`⏳ วันนี้ (${today}) ไม่ใช่วันปิดประมูลที่กำหนด`);
      return;
    }

    const recordsSnap = await db.collection("auction_records").get();
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.log("❌ ไม่พบ guild ใน client");
      return;
    }

    const historyChannelId = "1376195659501277286";
    const historyChannel = guild.channels.cache.get(historyChannelId);
    if (!historyChannel) {
      console.log("❌ ไม่พบช่องประวัติการประมูล");
      return;
    }

    for (const doc of recordsSnap.docs) {
      const record = doc.data();
      const receptionChannelId = doc.id;
      const bidChannelId = record.publicChannelId;
      const ownerId = record.ownerId;

      if (!receptionChannelId || !bidChannelId) continue;

      const receptionChannel = guild.channels.cache.get(receptionChannelId);
      const bidChannel = guild.channels.cache.get(bidChannelId);

      if (!receptionChannel || !bidChannel) continue;

      // ไม่ต้องเช็ค closeDay เพราะเราเช็ควันเองด้านบนแล้ว

      const bidDoc = await bidsRef.doc(bidChannelId).get();
      const bidData = bidDoc.exists ? bidDoc.data() : null;

      if (bidData?.userId && bidData?.price && bidData?.name) {
        const { userId, price, name } = bidData;
        const fee = price * 0.08;

        await bidChannel.send(
          `# จบการประมูล \n## คุณ ${name}\n## ชนะในราคา ${price} บาท\n<@${userId}>`
        );

        await receptionChannel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        await receptionChannel.send(
          `# การประมูลได้จบลงไปแล้ว \n## คุณ <@${userId}>\n## ชนะในราคา ${price} บาท\n** คุณ <@${ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\n และโอนค่าที่ประมูลใน <#1371395778727383040>\n เป็นจำนวน ${fee.toFixed(2)} บาท**`
        );

        // ส่งประวัติการประมูลลงช่องประวัติ
        await historyChannel.send(
          `# ${bidChannel.name}\n## คุณ <@${userId}>\n## ได้ไปในราคา ${price} บาท`
        );

      } else {
        await bidChannel.send("# ปิดการประมูล\n## ไม่มีผู้ประมูลในห้องนี้");
        await receptionChannel.send(
          `# การประมูลได้จบลงแล้ว\n ## ขอแสดงความเสียใจด้วยคับ ไม่มีผู้ประมูล\n ## ไม่มีค่าที่ประมูลคับ หากจะลงประมูลใหม่ต้องกดตั๋วอีกครั้งคับ \n <@${ownerId}>`
        );
      }

      await bidsRef.doc(bidChannelId).delete().catch(() => {});
      console.log(`🗑️ ลบข้อมูล bids ของห้อง ${bidChannel.name} เรียบร้อย`);
    }
  });
});




  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const channel = message.channel;
    const categoryId = "1375026841114509332";

    // คำสั่ง !end สำหรับ admin เท่านั้น
    if (message.content === "!end" && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
  const bidChannel = message.channel;
  const bidChannelId = bidChannel.id;

  console.log("🔔 เริ่มจบการประมูลในห้อง:", bidChannel.name);
  await message.delete().catch(() => {});

  // ดึงข้อมูล auction_records ทั้งหมด
  const recordsSnap = await db.collection("auction_records").get();

  let receptionRecord = null;

  for (const doc of recordsSnap.docs) {
    const data = doc.data();
    if (data.publicChannelId === bidChannelId) {
      receptionRecord = { id: doc.id, ...data };
      break;
    }
  }

  if (!receptionRecord) {
    await message.reply("❌ ไม่พบข้อมูล auction_records ที่ publicChannelId ตรงกับห้องนี้");
    console.warn("⚠️ ไม่พบ auction_records ที่ publicChannelId =", bidChannelId);
    return;
  }

  const receptionChannel = message.guild.channels.cache.get(receptionRecord.id);
  if (!receptionChannel) {
    await message.reply("❌ ไม่พบห้องรับรองจาก ID ที่บันทึกไว้");
    console.warn("⚠️ receptionChannel not found:", receptionRecord.id);
    return;
  }

  // ดึงข้อมูล bids
  const bidsSnap = await db.collection("bids").doc(bidChannelId).get();

  if (!bidsSnap.exists) {
    // ไม่มีผู้ประมูล
    await bidChannel.send("# ปิดการประมูล\n## ไม่มีผู้ประมูลในห้องนี้");
    await receptionChannel.send(`# การประมูลได้จบลงแล้ว\n ## ขอแสดงความเสียใจด้วยคับ ไม่มีผู้ประมูล\n ## ไม่มีค่าที่ประมูลคับ หากจะลงประมูลใหม่ต้องกดตั๋วอีกครั้งคับ \n <@${receptionRecord.ownerId}> `);
    console.warn("⚠️ ไม่มี bids สำหรับห้องนี้:", bidChannelId);
    return;
  }

  const bidsData = bidsSnap.data();
  const { userId, price, name } = bidsData;

  try {
    // ส่งข้อความสรุปใน publicChannelId (bidChannel)
    await bidChannel.send(`# จบการประมูล \n## คุณ ${name}\n## ชนะในราคา ${price} บาท\n<@${userId}>`);

    // เพิ่ม permission ให้ผู้ชนะในห้องรับรอง
    await receptionChannel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    // ส่ง tag ผู้ชนะและเจ้าของในห้องรับรอง แค่ครั้งเดียว
    const fee = price * 0.08;
    await receptionChannel.send(`# การประมูลได้จบลงไปแล้ว \n## คุณ <@${userId}>\n## ชนะในราคา ${price} บาท\n** คุณ <@${receptionRecord.ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\n และโอนค่าที่ประมูลใน <#1371395778727383040>\n เป็นจำนวน ${fee.toFixed(2)} บาท**`);

    // ลบข้อมูล bids
    await db.collection("bids").doc(bidChannelId).delete().catch(() => {});

    console.log("✅ จบการประมูลเรียบร้อย");
    const historyChannelId = "1376195659501277286";
const historyChannel = message.guild.channels.cache.get(historyChannelId);
if (historyChannel) {
  await historyChannel.send(
    `# ${bidChannel.name}\n## คุณ <@${userId}>\n ## ได้ไปในราคา ${price} บาท`
  );
}
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาด:", err);
    await message.reply("❌ มีบางอย่างผิดพลาดขณะจบการประมูล");
  }
}



    // หากไม่ใช่คำสั่ง !end ให้เช็คว่าห้องอยู่ในหมวดหมู่ประมูลหรือไม่
    if (!channel.parentId || channel.parentId !== categoryId) return;

    const content = message.content.trim();
    const parts = content.split(" ");

    // ตรวจสอบรูปแบบการประมูล "ชื่อ ราคา"
    if (parts.length !== 2 || isNaN(parseFloat(parts[1]))) {
      try {
        const warnMsg = await channel.send(
          "❗ หากจะประมูล กรุณาเขียนในรูปแบบ ชื่อ ตัวเลข เช่น **sea 100** ไม่อย่างนั้นบอทจะไม่จดจำการประมูลของคุณ"
        );
        setTimeout(async () => {
          await warnMsg.delete().catch(() => {});
        }, 2000);
      } catch (err) {
        console.error("แจ้งเตือนผิดรูปแบบล้มเหลว:", err);
      }
      return;
    }

    try {
      await message.react("💜");
    } catch (err) {
      console.error("เพิ่มอิโมจิไม่ได้:", err);
    }

    const name = parts[0];
    const price = parseFloat(parts[1]);

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

    await docRef.set({
      name,
      price,
      userId: message.author.id,
      channelId: channel.id,
      updatedAt: Date.now(),
    });

    if (bidTimeouts.has(channel.id)) {
      clearTimeout(bidTimeouts.get(channel.id));
    }

    const timeout = setTimeout(async () => {
      const latest = (await docRef.get()).data();
      const msg = `# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`;
      channel.send(msg);
    }, 5 * 60 * 1000);

    bidTimeouts.set(channel.id, timeout);
  });
};
