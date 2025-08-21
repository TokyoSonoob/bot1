const {
  Events,
  PermissionsBitField,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
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

  const AUCTION_CATEGORY_ID = "1375026841114509332";
  const ROOM_NAME_KEYWORD = "ครั้งที่";

  // helper: เฉพาะห้องประมูล + ชื่อมีคำว่า "ครั้งที่"
  function isEligibleAuctionChannel(channel) {
    if (!channel) return false;
    const name = (channel.name || "").toString();
    return channel.parentId === AUCTION_CATEGORY_ID && /ครั้งที่/i.test(name);
  }

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

  // รวม logic ปิดประมูลไว้ในฟังก์ชันเดียว เรียกใช้ได้ทั้งจาก cron และที่อื่น
  const runCloseAuctions = async () => {
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
          `# การประมูลได้จบลงไปแล้ว \n## คุณ <@${userId}>\n## ชนะในราคา ${price} บาท\n** คุณ <@${ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\n และโอนค่าที่ประมูลใน <#1406333052736635000>\n เป็นจำนวน ${fee.toFixed(2)} บาท**`
        );

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
  };

  // ตั้ง cron ให้ทำงานทุก อังคาร, พฤหัส, เสาร์ เวลา 20:00 ตามเวลาไทย
  const job = schedule.scheduleJob(
    { rule: "0 20 * * 2,4,6", tz: "Asia/Bangkok" },
    async () => {
      try {
        const nowTH = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
        console.log(`🔔 RUN close-auctions @TH ${nowTH}`);
        await runCloseAuctions();
      } catch (e) {
        console.error("❌ close-auctions job error:", e);
      }
    }
  );

  // log นัดครั้งถัดไป ช่วยตรวจสอบว่า cron ถูกตั้งจริง
  const next = job.nextInvocation();
  if (next) {
    console.log("⏭️ next run (server clock):", next.toString());
    console.log(
      "⏭️ next run (Asia/Bangkok):",
      next.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
    );
  }
});


  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const channel = message.channel;

    // ===== ADMIN: !end =====
    if (
      message.content === "!end" &&
      message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      const bidChannel = message.channel;
      const bidChannelId = bidChannel.id;

      console.log("🔔 เริ่มจบการประมูลในห้อง:", bidChannel.name);
      await message.delete().catch(() => {});

      // helper: เช็กว่ายังอยู่ในเซิร์ฟไหม
      async function fetchMemberOrNull(guild, userId) {
        return (
          guild.members.cache.get(userId) ||
          (await guild.members.fetch(userId).catch(() => null))
        );
      }

      // helper: ไล่หาข้อความล่าสุดที่เป็น "ชื่อ ราคา" และคนโพสต์ยังอยู่ในเซิร์ฟ
      async function findLatestBidFromMessages(channel, guild) {
        const bidRegex = /^(\S+)\s+(\d+(?:\.\d+)?)$/;
        let beforeId = null;

        while (true) {
          const batch = await channel.messages.fetch({
            limit: 100,
            ...(beforeId ? { before: beforeId } : {}),
          });
          if (!batch.size) break;

          for (const msg of batch.values()) {
            if (msg.author.bot) continue;
            const text = msg.content?.trim() ?? "";
            const m = text.match(bidRegex);
            if (!m) continue;

            const [, name, priceStr] = m;
            const member = await fetchMemberOrNull(guild, msg.author.id);
            if (member) {
              return {
                userId: msg.author.id,
                name,
                price: parseFloat(priceStr),
                messageId: msg.id,
                at: msg.createdTimestamp,
              };
            }
          }

          beforeId = batch.last().id;
        }

        return null;
      }

      // ดึงข้อมูล auction_records
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
        await message.channel
          .send("❌ ไม่พบข้อมูล auction_records ที่ publicChannelId ตรงกับห้องนี้")
          .catch(() => {});
        console.warn("⚠️ ไม่พบ auction_records ที่ publicChannelId =", bidChannelId);
        return;
      }

      const receptionChannel = message.guild.channels.cache.get(receptionRecord.id);
      if (!receptionChannel) {
        await message.channel
          .send("❌ ไม่พบห้องรับรองจาก ID ที่บันทึกไว้")
          .catch(() => {});
        console.warn("⚠️ receptionChannel not found:", receptionRecord.id);
        return;
      }

      // ดึงข้อมูล bids ล่าสุดจาก DB
      const bidsSnap = await db.collection("bids").doc(bidChannelId).get();

      let winner = null;
      let replacedWinner = false;
      let oldWinner = null;

      if (bidsSnap.exists) {
        const bidsData = bidsSnap.data();
        if (bidsData?.userId && bidsData?.price) {
          const member = await fetchMemberOrNull(message.guild, bidsData.userId);
          if (member) {
            winner = {
              userId: bidsData.userId,
              name: bidsData.name,
              price: bidsData.price,
            };
          } else {
            // คนล่าสุดออกจากเซิร์ฟ → เก็บไว้เป็น oldWinner
            replacedWinner = true;
            oldWinner = {
              userId: bidsData.userId,
              name: bidsData.name,
              price: bidsData.price,
            };
          }
        }
      }

      // ถ้าคนล่าสุดใน DB ไม่อยู่ → หา fallback จากข้อความย้อนหลัง
      if (!winner) {
        const fallback = await findLatestBidFromMessages(bidChannel, message.guild);
        if (fallback) {
          winner = fallback;
          await db
            .collection("bids")
            .doc(bidChannelId)
            .set(
              {
                name: winner.name,
                price: winner.price,
                userId: winner.userId,
                channelId: bidChannelId,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
        }
      }

      if (!winner) {
        await bidChannel.send("# ปิดการประมูล\n## ไม่มีผู้ชนะที่ยังอยู่ในเซิร์ฟเวอร์");
        await receptionChannel.send(
          `# การประมูลได้จบลงแล้ว\n## ไม่มีผู้ชนะที่ยังอยู่ในเซิร์ฟเวอร์\n<@${receptionRecord.ownerId}> หากต้องการลงประมูลใหม่ โปรดกดตั๋วอีกครั้ง`
        );
        await db.collection("bids").doc(bidChannelId).delete().catch(() => {});
        console.warn("⚠️ ไม่มีผู้ชนะที่ยังอยู่:", bidChannelId);
        return;
      }

      // ==== มีผู้ชนะแล้ว ====
      const { userId, price, name } = winner;

      try {
        if (replacedWinner && oldWinner) {
          await bidChannel.send(
            `# จบการประมูล \n## คุณ ${name}\n## ชนะในราคา ${price} บาท\n## เนื่องจาก **${oldWinner.name}** ออกจากเซิร์ฟเวอร์ในระหว่างการประมูล\n<@${userId}>`
          );
        } else {
          await bidChannel.send(
            `# จบการประมูล \n## คุณ ${name}\n## ชนะในราคา ${price} บาท\n<@${userId}>`
          );
        }

        await receptionChannel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        const fee = price * 0.08;
        await receptionChannel.send(
          `# การประมูลได้จบลงไปแล้ว \n## คุณ <@${userId}>\n## ชนะในราคา ${price} บาท\n** คุณ <@${receptionRecord.ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\n และโอนค่าที่ประมูลใน <#1406333052736635000>\n เป็นจำนวน ${fee.toFixed(2)} บาท**`
        );

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
        await message.channel
          .send("❌ มีบางอย่างผิดพลาดขณะจบการประมูล")
          .catch(() => {});
      }

      return;
    }

    // ===== ADMIN: !change → สร้าง embed + ปุ่มเปิดฟอร์ม =====
    if (
      message.content.trim() === "!change" &&
      message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      if (!isEligibleAuctionChannel(message.channel)) {
        await message
          .reply(`⚠️ ใช้คำสั่งนี้ได้เฉพาะในห้องที่อยู่ในหมวดประมูล และ **ชื่อห้องต้องมีคำว่า "${ROOM_NAME_KEYWORD}"**`)
          .catch(() => {});
        return;
      }

      await message.delete().catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle("แก้ไข Bid")
        .setDescription("คนที่ไม่ใข่แอดมิน ถ้ากดเป็นเก")
        .setColor(0x8a2be2);

      const btn = new ButtonBuilder()
        .setCustomId(`auction_change_open:${message.channel.id}`)
        .setLabel("Edit")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(btn);
      await message.channel.send({ embeds: [embed], components: [row] });
      return;
    }

    // ===== ข้อความประมูลปกติ: เฉพาะห้องชื่อมี "ครั้งที่" ในหมวดที่กำหนด =====
    if (!isEligibleAuctionChannel(channel)) return;

    const content = message.content.trim();
    const parts = content.split(" ");

    // ตรวจสอบรูปแบบการประมูล "ชื่อ ราคา"
    if (parts.length !== 2 || isNaN(parseFloat(parts[1]))) {
      try {
        const warnMsg = await channel.send(
          "❗เขียนในรูปแบบ **sea 100**"
        );
        setTimeout(async () => {
          await warnMsg.delete().catch(() => {});
        }, 3000);
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

  // ====== ปุ่ม & โมดัลของ !change (ADMIN ONLY) ======
  client.on(Events.InteractionCreate, async (interaction) => {
    // กดปุ่มเปิดฟอร์ม
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("auction_change_open:")
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        await interaction.reply({
          content: "❌ เฉพาะแอดมินเท่านั้น",
          ephemeral: true,
        });
        return;
      }

      const channelId = interaction.customId.split(":")[1];

      // กันเงื่อนไข: ต้องเป็นห้องที่ชื่อมี "ครั้งที่"
      const bidChannel =
        interaction.guild.channels.cache.get(channelId) ||
        (await interaction.guild.channels.fetch(channelId).catch(() => null));
      if (!isEligibleAuctionChannel(bidChannel)) {
        await interaction.reply({
          content: `⚠️ ใช้งานได้เฉพาะห้องที่ชื่อมี "${ROOM_NAME_KEYWORD}" ในหมวดประมูล`,
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        // ฝัง messageId ต้นทางเพื่อจะลบฟอร์มหลัง submit
        .setCustomId(`auction_change_modal:${channelId}:${interaction.message.id}`)
        .setTitle("ปรับราคา/ผู้ชนะ (ADMIN)");

      const userIdInput = new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID (ตัวเลข)")
        .setPlaceholder("ใส่ ID ผู้ใช้ที่จะให้เป็นผู้ชนะ")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("จำนวนราคา (บาท)")
        .setPlaceholder("เช่น 150")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const row1 = new ActionRowBuilder().addComponents(userIdInput);
      const row2 = new ActionRowBuilder().addComponents(amountInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
      return;
    }

    // ส่งโมดัลแล้ว
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("auction_change_modal:")
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        await interaction.reply({
          content: "❌ เฉพาะแอดมินเท่านั้น",
          ephemeral: true,
        });
        return;
      }

      // ดึง channelId และ hostMsgId
      const [, channelId, hostMsgId] = interaction.customId.split(":");

      const guild = interaction.guild;
      const bidChannel =
        guild.channels.cache.get(channelId) ||
        (await guild.channels.fetch(channelId).catch(() => null));

      // กันเงื่อนไข: ต้องเป็นห้องที่ชื่อมี "ครั้งที่"
      if (!isEligibleAuctionChannel(bidChannel)) {
        await interaction.reply({
          content: `⚠️ ใช้งานได้เฉพาะห้องที่ชื่อมี "${ROOM_NAME_KEYWORD}" ในหมวดประมูล`,
          ephemeral: true,
        });
        return;
      }

      const userId = interaction.fields.getTextInputValue("user_id").trim();
      const amountStr = interaction.fields.getTextInputValue("amount").trim();
      const amount = parseFloat(amountStr);

      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({
          content: "⚠️ รูปแบบ **User ID** ไม่ถูกต้อง",
          ephemeral: true,
        });
        return;
      }
      if (!isFinite(amount) || amount <= 0) {
        await interaction.reply({
          content: "⚠️ รูปแบบ **ราคา** ไม่ถูกต้อง",
          ephemeral: true,
        });
        return;
      }

      // ดึงชื่อ (displayName) ของผู้ใช้
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: "❌ ไม่พบบุคคลนี้ในเซิร์ฟเวอร์",
          ephemeral: true,
        });
        return;
      }
      const displayName = member.displayName || member.user.username || "Unknown";

      const docRef = bidsRef.doc(channelId);
      await docRef.set(
        {
          name: displayName,
          price: amount,
          userId: userId,
          channelId: channelId,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      // ประกาศใหม่ในห้อง
      await bidChannel.send(
        `# ราคาล่าสุด (ปรับโดยแอดมิน) คือ ${amount}\n## <@${userId}>`
      );

      // รีสตาร์ทตัวจับเวลา 5 นาที
      if (bidTimeouts.has(channelId)) {
        clearTimeout(bidTimeouts.get(channelId));
      }
      const timeout = setTimeout(async () => {
        const latest = (await docRef.get()).data();
        if (latest) {
          await bidChannel.send(
            `# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`
          );
        }
      }, 5 * 60 * 1000);
      bidTimeouts.set(channelId, timeout);

      // ลบข้อความ embed+ปุ่ม (ฟอร์ม) ต้นทาง
      if (hostMsgId) {
        const hostMsg = await bidChannel.messages.fetch(hostMsgId).catch(() => null);
        if (hostMsg) await hostMsg.delete().catch(() => {});
      }

      await interaction.reply({
        content: `✅ อัปเดตเรียบร้อย: ตั้ง <@${userId}> ที่ราคา ${amount} บาท`,
        ephemeral: true,
      });
      return;
    }
  });
};
