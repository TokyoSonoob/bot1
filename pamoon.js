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
const fetch = require("node-fetch"); // ใช้ดึงแนบรูปจาก permaLink

const db = admin.firestore();
const bidsRef = db.collection("bids");

module.exports = function (client) {
  const bidTimeouts = new Map();

  const AUCTION_CATEGORY_ID = "1375026841114509332"; // หมวดห้อง public
  const ROOM_NAME_KEYWORD = "ครั้งที่";

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

  // 🆕 helper: ล็อกและซ่อนห้องประมูลหลังประกาศผู้ชนะ
  async function lockAndHideChannel(channel, guild) {
    try {
      // ปิดการเข้าถึงของ @everyone
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false,
      });
      // คงสิทธิ์ให้บอทเผื่อแก้ไข/ส่งข้อความได้
      await channel.permissionOverwrites.edit(client.user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        ManageChannels: true,
      });
      // เคลียร์ timeout ของห้องนี้ถ้ามี
      if (bidTimeouts.has(channel.id)) {
        clearTimeout(bidTimeouts.get(channel.id));
        bidTimeouts.delete(channel.id);
      }
      console.log(`🔒 ล็อกและซ่อนห้องเรียบร้อย: ${channel.name}`);
    } catch (e) {
      console.error("❌ ล็อก/ซ่อนห้องล้มเหลว:", e);
    }
  }

  // ===== helper: ดึงแนบรูปจาก permaLink (ข้อความในช่องถาวร) =====
  async function getAttachmentsFromPermaLink(permaLink) {
    const match = permaLink?.match(/https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (!match) return [];
    const [, , channelId, messageId] = match;

    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      { headers: { Authorization: `Bot ${process.env.token}` } }
    );

    if (!res.ok) {
      console.warn("❌ ดึงข้อความจาก permaLink ไม่ได้:", await res.text());
      return [];
    }

    const msgData = await res.json();
    return msgData.attachments || [];
  }

  // ===== helper: สร้างห้อง public + ส่งสรุป + ปุ่มปิดห้อง + อัปเดต Firestore =====
  async function sendAuctionSummary(guild, doc, parentId) {
    const data = doc.data();
    let summary = data.summary || "⚠️ ไม่มีสรุป";

    // แทนที่ "## วันที่ : รอคิวก่อน" ด้วยวันพรุ่งนี้ (ให้ดูเป็นวันเปิด)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = tomorrow.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const finalSummary = summary.replace(
      "## วันที่ : รอคิวก่อน",
      `## วันที่ : ${formattedDate}`
    );

    // แนบรูปจาก permaLink ถ้ามี
    const imageFiles = [];
    if (data.permaLink) {
      const attachments = await getAttachmentsFromPermaLink(data.permaLink);
      for (const file of attachments) {
        try {
          const res = await fetch(file.url);
          const buffer = await res.buffer();
          imageFiles.push({ attachment: buffer, name: file.filename });
        } catch (err) {
          console.warn("⚠️ โหลดรูปจาก permaLink ไม่สำเร็จ:", err.message);
        }
      }
    }

    const channelName = data.roomName || `ครั้งที่-${doc.id}`;
    const publicChannel = await guild.channels.create({
      name: channelName,
      type: 0, // GuildText
      parent: parentId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
          ],
        },
      ],
    });

    // ส่งข้อความสรุป + รูป
    await publicChannel.send({
      content: finalSummary,
      files: imageFiles.length > 0 ? imageFiles : undefined,
    });

    // ส่งปุ่ม "ปิดห้อง" (ตัว handler อยู่ใน index.js ของคุณแล้ว)
    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_public_${publicChannel.id}`)
        .setLabel("ปิดห้อง")
        .setStyle(ButtonStyle.Danger)
    );
    await publicChannel.send({ content: " ", components: [adminRow] });

    // อัปเดต Firestore
    await admin.firestore().collection("auction_records").doc(doc.id).update({
      publicChannelId: publicChannel.id,
    });

    console.log(`✅ เปิดห้อง ${channelName} และเซฟ publicChannelId แล้ว`);
  }

  client.once("ready", async () => {
    await cleanOrphanBids();

    // ===== ฟังก์ชันปิดประมูล (ใช้ร่วมทั้ง cron และคำสั่ง) =====
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

        // ลบข้อมูล bids
        await bidsRef.doc(bidChannelId).delete().catch(() => {});
        console.log(`🗑️ ลบข้อมูล bids ของห้อง ${bidChannel.name} เรียบร้อย`);

        // 🆕 ล็อกและซ่อนห้องประมูลหลังประกาศผล
        await lockAndHideChannel(bidChannel, guild);
      }
    };

    // ===== ตั้ง CRON ปิดประมูล: อังคาร/พฤหัส/เสาร์ 20:00 (เวลาไทย) =====
    const jobClose = schedule.scheduleJob(
      { rule: "0 19 * * 2,3,4,5,6", tz: "Asia/Bangkok" },
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

    // ===== ตั้ง CRON เปิดประมูล: จันทร์/พุธ/ศุกร์ 19:00 (เวลาไทย) → ส่งข้อมูลไป 5 ห้อง =====
    const jobOpen = schedule.scheduleJob(
      { rule: "1 19 * * 1,2,3,4,5", tz: "Asia/Bangkok" },
      async () => {
        try {
          const guild = client.guilds.cache.first();
          if (!guild) {
            console.warn("❌ ไม่พบ guild ที่บอทอยู่");
            return;
          }

          // ตรวจสอบหมวดหมู่ปลายทาง
          const parentId = AUCTION_CATEGORY_ID;
          const category =
            guild.channels.cache.get(parentId) ||
            (await guild.channels.fetch(parentId).catch(() => null));
          if (!category) {
            console.warn("❌ ไม่พบหมวดหมู่ public (AUCTION_CATEGORY_ID)");
            return;
          }

          // ดึงเอกสารที่ยังไม่เปิด (publicChannelId ว่าง/ไม่มี)
          const snap = await admin.firestore().collection("auction_records").get();
          const pending = snap.docs.filter((d) => {
            const pcid = d.data().publicChannelId;
            return pcid === null || pcid === "" || pcid === undefined;
          });

          if (pending.length === 0) {
            console.log("ℹ️ ไม่มีงานค้างสำหรับเปิดประมูล");
            return;
          }

          // เรียงตามเลขใน roomName: "ครั้งที่-<n>" จากน้อยไปมาก
          const docsSorted = pending
            .map((doc) => {
              const data = doc.data();
              const match = data.roomName?.match(/ครั้งที่-(\d+)/);
              const count = match ? parseInt(match[1]) : Number.POSITIVE_INFINITY;
              return { doc, count };
            })
            .filter((x) => Number.isFinite(x.count))
            .sort((a, b) => a.count - b.count)
            .map((x) => x.doc);

          const toOpen = docsSorted.slice(0, 5); // เปิด 5 ห้อง
          if (toOpen.length === 0) {
            console.log("ℹ️ ไม่พบ roomName ตามรูปแบบ 'ครั้งที่-<เลข>'");
            return;
          }

          // เปิดทีละห้อง (กัน rate limit และเพื่อ log)
          const nowTH = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
          console.log(`🚀 OPEN auctions x${toOpen.length} @TH ${nowTH}`);
          for (const d of toOpen) {
            try {
              await sendAuctionSummary(guild, d, parentId);
            } catch (err) {
              console.error(`❌ เปิดห้องล้มเหลว (doc ${d.id}):`, err);
            }
          }
        } catch (e) {
          console.error("❌ open-auctions job error:", e);
        }
      }
    );

    // log นัดครั้งถัดไป
    const nextClose = jobClose.nextInvocation?.();
    if (nextClose) {
      console.log("⏭️ [close] next run (server):", nextClose.toString());
      console.log(
        "⏭️ [close] next run (Asia/Bangkok):",
        nextClose.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
      );
    }
    const nextOpen = jobOpen.nextInvocation?.();
    if (nextOpen) {
      console.log("⏭️ [open] next run (server):", nextOpen.toString());
      console.log(
        "⏭️ [open] next run (Asia/Bangkok):",
        nextOpen.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
      );
    }
  });

  // =========================
  //  MessageCreate & Commands
  // =========================
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

      async function fetchMemberOrNull(guild, userId) {
        return (
          guild.members.cache.get(userId) ||
          (await guild.members.fetch(userId).catch(() => null))
        );
      }

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
            replacedWinner = true;
            oldWinner = {
              userId: bidsData.userId,
              name: bidsData.name,
              price: bidsData.price,
            };
          }
        }
      }

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

        // 🆕 ล็อกและซ่อนห้องแม้ไม่มีผู้ชนะ
        await lockAndHideChannel(bidChannel, message.guild);
        return;
      }

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

        // 🆕 ล็อกและซ่อนห้องหลังประกาศผู้ชนะ
        await lockAndHideChannel(bidChannel, message.guild);

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

    // ===== ข้อความประมูลปกติ =====
    if (!isEligibleAuctionChannel(channel)) return;

    const content = message.content.trim();
    const parts = content.split(" ");

    if (parts.length !== 2 || isNaN(parseFloat(parts[1]))) {
      try {
        const warnMsg = await channel.send('❗เขียนในรูปแบบ **"ชื่อ ราคา" เช่น "sea 100"**');
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

  // ===== ปุ่ม & โมดัลของ !change (ADMIN ONLY) =====
  client.on(Events.InteractionCreate, async (interaction) => {
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

      const [, channelId, hostMsgId] = interaction.customId.split(":");

      const guild = interaction.guild;
      const bidChannel =
        guild.channels.cache.get(channelId) ||
        (await guild.channels.fetch(channelId).catch(() => null));

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

      await bidChannel.send(
        `# ราคาล่าสุด (ปรับโดยแอดมิน) คือ ${amount}\n## <@${userId}>`
      );

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
