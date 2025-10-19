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
  ApplicationCommandOptionType,
} = require("discord.js");
const admin = require("firebase-admin");
const schedule = require("node-schedule");
const fetch = require("node-fetch");

const db = admin.firestore();
const bidsRef = db.collection("bids");
const PAYMENT_IMG_URL = "https://cdn.discordapp.com/attachments/1376746453795471490/1418928780574986350/956.png?ex=68cfe7e7&is=68ce9667&hm=f7a3c925b2f594255a1f502abc5a4a4bdf02049c0153df6f87249746854977e5&";

function makePaymentEmbed() {
  return new EmbedBuilder()
    .setTitle("ช่องทางการชำระเงิน")
    .setDescription("⭐ สามารถโอนได้เลยน้าา\nแนบสลิปหลังโอนเพื่อความรวดเร็ว")
    .setColor(0x9b59b6)
    .setImage(PAYMENT_IMG_URL);
}

module.exports = function (client) {
  async function getLatestBidPrice(channel, guild) {
    try {
      const snap = await bidsRef.doc(channel.id).get();
      if (snap.exists) {
        const d = snap.data();
        if (d?.price && isFinite(d.price)) return Number(d.price);
      }
    } catch (e) {
      console.warn("getLatestBidPrice: Firestore error:", e?.message || e);
    }
    const bidRegex = /^(\S+)\s+(\d+(?:\.\d+)?)$/;
    let beforeId = null;
    let latest = null;
    while (true) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(beforeId ? { before: beforeId } : {}),
      }).catch(() => null);
      if (!batch || !batch.size) break;
      for (const msg of batch.values()) {
        if (msg.author.bot) continue;
        const text = msg.content?.trim() ?? "";
        const m = text.match(bidRegex);
        if (!m) continue;
        const price = parseFloat(m[2]);
        if (!isFinite(price)) continue;
        latest = { price, at: msg.createdTimestamp };
      }
      beforeId = batch.last().id;
      if (beforeId == null || batch.size < 100) break;
    }
    return latest?.price ?? null;
  }

  function parseBaseRoomName(name) {
    const m = String(name || "").match(/^(ครั้งที่-\d+)(?:-(?:ล่าสุด-)?[\d.]+)?$/);
    return m ? m[1] : null;
  }

  function fmtPrice(p) {
    if (p == null) return null;
    const n = Number(p);
    if (!isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/,'');
  }

  async function updateAuctionRoomNamesWithLatestBid() {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) {
        console.warn("updateAuctionRoomNamesWithLatestBid: no guild");
        return;
      }
      const AUCTION_CATEGORY_ID = "1375026841114509332";
      const channels = guild.channels.cache.filter((ch) => {
        if (!ch || (ch.type !== 0 && ch.type !== 5)) return false;
        if (ch.parentId !== AUCTION_CATEGORY_ID) return false;
        if (!/ครั้งที่/i.test(ch.name)) return false;
        if (ch.name.startsWith("❌")) return false;
        return /^(ครั้งที่-\d+)(?:-(?:ล่าสุด-)?[\d.]+)?$/.test(ch.name);
      });
      if (!channels.size) return;
      console.log(`🔄 ตรวจอัปเดตชื่อห้อง (${channels.size} ห้อง) ...`);
      for (const ch of channels.values()) {
        try {
          const base = parseBaseRoomName(ch.name);
          if (!base) continue;
          const latest = await getLatestBidPrice(ch, guild);
          const priceStr = fmtPrice(latest);
          const desiredName = priceStr ? `${base}-ล่าสุด-${priceStr}` : base;
          if (desiredName !== ch.name) {
            const finalName = desiredName.slice(0, 100);
            await ch.setName(finalName).catch(() => {});
            console.log(`✏️ เปลี่ยนชื่อ: ${ch.name} → ${finalName}`);
            await new Promise((r) => setTimeout(r, 400));
          }
        } catch (e) {
          console.warn(`update name fail (${ch?.id}):`, e?.message || e);
        }
      }
    } catch (e) {
      console.error("updateAuctionRoomNamesWithLatestBid error:", e);
    }
  }

  const bidTimeouts = new Map();
  const AUCTION_CATEGORY_ID = "1375026841114509332";
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
    // เว้นว่างไว้ (ไม่ลบ bid)
  }

  async function lockChannelReadOnly(channel, guild) {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendTTSMessages: false,
        AttachFiles: false,
        EmbedLinks: false,
        UseExternalEmojis: false,
        UseExternalStickers: false,
        ReadMessageHistory: false,
      });
      await channel.permissionOverwrites.edit(client.user.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        ManageChannels: true,
        EmbedLinks: true,
        AttachFiles: true,
      });
      if (channel.name !== "❌ ปิดการประมูล") {
        await channel.setName("❌ ปิดการประมูล").catch(() => {});
      }
      if (bidTimeouts.has(channel.id)) {
        clearTimeout(bidTimeouts.get(channel.id));
        bidTimeouts.delete(channel.id);
      }
      console.log(`🔒 ซ่อนห้อง + รีเนมแล้ว: ${channel.id}`);
    } catch (e) {
      console.error("❌ ล็อก/ซ่อนห้องล้มเหลว:", e);
    }
  }

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

  async function sendAuctionSummary(guild, doc, parentId) {
    const data = doc.data();
    let summary = data.summary || "⚠️ ไม่มีสรุป";
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
      type: 0,
      parent: parentId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
          ]
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
    await publicChannel.send({
      content: finalSummary,
      files: imageFiles.length > 0 ? imageFiles : undefined,
    });
    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_public_${publicChannel.id}`)
        .setLabel("ปิดห้อง")
        .setStyle(ButtonStyle.Danger)
    );
    await publicChannel.send({ content: " ", components: [adminRow] });
    await admin.firestore().collection("auction_records").doc(doc.id).update({
      publicChannelId: publicChannel.id,
    });
    console.log(`✅ เปิดห้อง ${channelName} และเซฟ publicChannelId แล้ว`);
  }

  function isClosedAuctionChannelName(name) {
    const targets = new Set(["❌-ปิดการประมูล", "❌ ปิดการประมูล"]);
    return targets.has(String(name || ""));
  }

  async function deleteClosedAuctionChannels() {
    try {
      const guilds = [...client.guilds.cache.values()];
      if (!guilds.length) {
        console.warn("⚠️ ไม่มี guild ใน client");
        return;
      }
      for (const guild of guilds) {
        const candidates = guild.channels.cache.filter(
          (ch) => (ch.type === 0 || ch.type === 5) && isClosedAuctionChannelName(ch.name)
        );
        if (!candidates.size) {
          console.log(`ℹ️ [${guild.name}] ไม่มีห้องชื่อ ❌-ปิดการประมูล ให้ลบ`);
          continue;
        }
        console.log(`🧹 [${guild.name}] พบห้องที่จะลบ ${candidates.size} ห้อง`);
        for (const ch of candidates.values()) {
          try {
            await ch.delete("Daily cleanup: closed auction room");
            await new Promise((r) => setTimeout(r, 700));
          } catch (e) {
            console.error(`❌ ลบห้องไม่สำเร็จ (${ch.id} ${ch.name}) :`, e.message || e);
          }
        }
        console.log(`✅ [${guild.name}] ลบห้องปิดการประมูลเสร็จสิ้น`);
      }
    } catch (err) {
      console.error("❌ deleteClosedAuctionChannels error:", err);
    }
  }

  client.once("ready", async () => {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) {
        console.warn("⚠️ ไม่มี guild ให้ลงทะเบียนสแลชคำสั่ง");
      } else {
        const existing = await guild.commands.fetch().catch(() => null);
        const dup = existing?.find(c => c.name === "change");
        if (dup) await guild.commands.delete(dup.id).catch(() => {});
        await guild.commands.create({
          name: "change",
          description: "ปรับราคา/ผู้ชนะ (ADMIN) — ใช้ในห้องประมูล",
          default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
          dm_permission: false,
          options: [
            {
              name: "user",
              description: "เลือกผู้ชนะ",
              type: ApplicationCommandOptionType.User,
              required: true,
            },
            {
              name: "amount",
              description: "จำนวนราคา (บาท)",
              type: ApplicationCommandOptionType.Number,
              required: true,
            },
          ],
        });
        console.log(`✅ ลงทะเบียน /change (user, amount) — Admin Only ในกิลด์ ${guild.name} แล้ว`);
      }
    } catch (e) {
      console.error("❌ ลงทะเบียน /change ล้มเหลว:", e);
    }

    const jobRenameTicker = schedule.scheduleJob(
      { rule: "*/10 * * * *", tz: "Asia/Bangkok" },
      async () => {
        try {
          const nowTH = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
          console.log(`🕙 RUN rename-with-bid @TH ${nowTH}`);
          await updateAuctionRoomNamesWithLatestBid();
        } catch (e) {
          console.error("❌ rename ticker error:", e);
        }
      }
    );

    await updateAuctionRoomNamesWithLatestBid();

    const nextRename = jobRenameTicker.nextInvocation?.();
    if (nextRename) {
      console.log("⏭️ [rename] next run (Asia/Bangkok):",
        nextRename.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
      );
    }

    await cleanOrphanBids();

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
        const cleanName =
          (typeof parseBaseRoomName === "function" && parseBaseRoomName(bidChannel.name)) ||
          String(bidChannel.name).replace(/-ล่าสุด-[\d.]+$/, "");
        const bidDoc = await bidsRef.doc(bidChannelId).get();
        const bidData = bidDoc.exists ? bidDoc.data() : null;

        if (bidData?.userId && bidData?.price && bidData?.name) {
          const { userId, price, name } = bidData;
          const fee = price * 0.08;
          await bidChannel.send(`# จบการประมูล \n## คุณ ${name}\n## ชนะในราคา ${price} บาท\n<@${userId}>`);
          await receptionChannel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
          await receptionChannel.send({
            content:
              `# การประมูลได้จบลงไปแล้ว \n` +
              `## คุณ <@${userId}>\n` +
              `## ชนะในราคา ${price} บาท\n` +
              `** คุณ <@${ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\n` +
              ` และโอนค่าที่ประมูลด้านล่างเลออ\n` +
              ` เป็นจำนวน ${fee.toFixed(2)} บาท**`,
            embeds: [makePaymentEmbed()],
          });
          await historyChannel.send(
            `# ${cleanName}\n## คุณ <@${userId}> ได้ไปในราคา ${price} บาท\n**เจ้าของประมูลคือ <@${ownerId}>**`
          );
        } else {
          await bidChannel.send("# ปิดการประมูล\n## ไม่มีผู้ประมูลในห้องนี้");
          await receptionChannel.send(
            `# การประมูลได้จบลงแล้ว\n ## ขอแสดงความเสียใจด้วยคับ ไม่มีผู้ประมูล\n ## ไม่มีค่าที่ประมูลคับ หากจะลงประมูลใหม่ต้องกดตั๋วอีกครั้งคับ \n <@${ownerId}>`
          );
          await historyChannel.send(
            `# ${cleanName}\n## ปิดการประมูล — ไม่มีผู้ประมูล\n**เจ้าของประมูลคือ <@${ownerId}>**`
          );
        }

        // ไม่ลบ bids: คงเอกสารไว้ตามคำสั่งผู้ใช้
        await lockChannelReadOnly(bidChannel, guild);
      }
    };

    const jobClose = schedule.scheduleJob(
      { rule: "59 18 * * 1,2,3,4,5,6,7", tz: "Asia/Bangkok" },
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

    const jobOpen = schedule.scheduleJob(
      { rule: "00 19 * * 1,2,3,4,5,6,7", tz: "Asia/Bangkok" },
      async () => {
        try {
          const guild = client.guilds.cache.first();
          if (!guild) {
            console.warn("❌ ไม่พบ guild ที่บอทอยู่");
            return;
          }
          const parentId = AUCTION_CATEGORY_ID;
          const category =
            guild.channels.cache.get(parentId) ||
            (await guild.channels.fetch(parentId).catch(() => null));
          if (!category) {
            console.warn("❌ ไม่พบหมวดหมู่ public (AUCTION_CATEGORY_ID)");
            return;
          }
          const snap = await admin.firestore().collection("auction_records").get();
          const pending = snap.docs.filter((d) => {
            const pcid = d.data().publicChannelId;
            return pcid === null || pcid === "" || pcid === undefined;
          });
          if (pending.length === 0) {
            console.log("ℹ️ ไม่มีงานค้างสำหรับเปิดประมูล");
            return;
          }
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
          const toOpen = docsSorted.slice(0, 10);
          if (toOpen.length === 0) {
            console.log("ℹ️ ไม่พบ roomName ตามรูปแบบ 'ครั้งที่-<เลข>'");
            return;
          }
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

    const jobDailyCleanup = schedule.scheduleJob(
      { rule: "0 12 * * *", tz: "Asia/Bangkok" },
      async () => {
        const nowTH = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
        console.log(`🕛 RUN daily closed-channel cleanup @TH ${nowTH}`);
        await deleteClosedAuctionChannels();
      }
    );

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
    const nextCleanup = jobDailyCleanup.nextInvocation?.();
    if (nextCleanup) {
      console.log("⏭️ [cleanup] next run (server):", nextCleanup.toString());
      console.log(
        "⏭️ [cleanup] next run (Asia/Bangkok):",
        nextCleanup.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
      );
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const channel = message.channel;

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
        await lockChannelReadOnly(bidChannel, message.guild);
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
        await receptionChannel.send({
          content:
            `# การประมูลได้จบลงไปแล้ว \n` +
            `## คุณ <@${userId}>\n` +
            `## ชนะในราคา ${price} บาท\n` +
            `** คุณ <@${receptionRecord.ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\n` +
            ` และโอนค่าที่ประมูลด้านล่างเลออ\n` +
            ` เป็นจำนวน ${fee.toFixed(2)} บาท**`,
          embeds: [makePaymentEmbed()],
        });

        const historyChannelId = "1376195659501277286";
        const historyChannel = message.guild.channels.cache.get(historyChannelId);
        if (historyChannel) {
          const cleanName =
            (typeof parseBaseRoomName === "function" && parseBaseRoomName(bidChannel.name)) ||
            String(bidChannel.name).replace(/-ล่าสุด-[\d.]+$/, "");
          await historyChannel.send(
            `# ${cleanName}\n## คุณ <@${userId}> ได้ไปในราคา ${price} บาท\n**เจ้าของประมูลคือ <@${receptionRecord.ownerId}>**`
          );
        }

        await lockChannelReadOnly(bidChannel, message.guild);
      } catch (err) {
        console.error("❌ เกิดข้อผิดพลาด:", err);
        await message.channel
          .send("❌ มีบางอย่างผิดพลาดขณะจบการประมูล")
          .catch(() => {});
      }

      return;
    }

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

    if (!isEligibleAuctionChannel(channel)) return;

    const content = message.content.trim();
    const parts = content.split(" ");
    if (parts.length !== 2 || isNaN(parseFloat(parts[1]))) {
      try {
        const warnMsg = await channel.send('เขียนรูปแบบ**"ชื่อ ราคา"**');
        setTimeout(async () => { await warnMsg.delete().catch(() => {}); }, 3000);
      } catch (err) {
        console.error("แจ้งเตือนผิดรูปแบบล้มเหลว:", err);
      }
      return;
    }

    try { await message.react("💜"); } catch {}

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
    }, { merge: true });

    if (bidTimeouts.has(channel.id)) clearTimeout(bidTimeouts.get(channel.id));

    const timeout = setTimeout(async () => {
      const latest = (await docRef.get()).data();
      if (latest) {
        const msg = `# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`;
        channel.send(msg);
      }
    }, 5 * 60 * 1000);
    bidTimeouts.set(channel.id, timeout);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand && interaction.isChatInputCommand() && interaction.commandName === "change") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
          return;
        }
        const bidChannel =
          interaction.channel ??
          interaction.guild.channels.cache.get(interaction.channelId) ??
          (await interaction.guild.channels.fetch(interaction.channelId).catch(() => null));
        if (!isEligibleAuctionChannel(bidChannel)) {
          await interaction.reply({
            content: `⚠️ ใช้ได้เฉพาะห้องในหมวดประมูล และ **ชื่อห้องต้องมี "${ROOM_NAME_KEYWORD}"**`,
            ephemeral: true,
          });
          return;
        }
        const user = interaction.options.getUser("user", true);
        const amount = interaction.options.getNumber("amount", true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          await interaction.reply({ content: "❌ ไม่พบบุคคลนี้ในเซิร์ฟเวอร์", ephemeral: true });
          return;
        }
        if (!isFinite(amount) || amount <= 0) {
          await interaction.reply({ content: "⚠️ รูปแบบ **ราคา** ไม่ถูกต้อง", ephemeral: true });
          return;
        }
        const displayName = member.displayName || member.user.username || "Unknown";
        const channelId = bidChannel.id;
        const docRef = bidsRef.doc(channelId);
        await docRef.set(
          {
            name: displayName,
            price: amount,
            userId: user.id,
            channelId,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        await bidChannel.send(`# ราคาล่าสุด คือ ${amount}\n## <@${user.id}>\n**ปรับโดยแอดมิน**`);
        if (bidTimeouts.has(channelId)) clearTimeout(bidTimeouts.get(channelId));
        const timeout = setTimeout(async () => {
          const latest = (await docRef.get()).data();
          if (latest) {
            await bidChannel.send(`# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`);
          }
        }, 5 * 60 * 1000);
        bidTimeouts.set(channelId, timeout);
        await interaction.reply({
          content: `✅ อัปเดตเรียบร้อย: ตั้ง <@${user.id}> ที่ราคา ${amount} บาท`,
          ephemeral: true,
        });
        return;
      }

      if (interaction.isButton && interaction.isButton() && interaction.customId.startsWith("close_public_")) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
          return;
        }
        const channelId = interaction.customId.replace("close_public_", "");
        const currentChannel = interaction.channel;
        if (!currentChannel || currentChannel.id !== channelId) {
          await interaction.reply({
            content: "⚠️ ปุ่มนี้ใช้ได้เฉพาะในห้องที่สร้างปุ่มเท่านั้น",
            ephemeral: true,
          });
          return;
        }
        try {
          const msg = interaction.message;
          const newRows = (msg.components || []).map((row) => {
            const r = ActionRowBuilder.from(row.toJSON());
            r.components = r.components.map((c) => {
              const b = ButtonBuilder.from(c.toJSON());
              return b.setDisabled(true);
            });
            return r;
          });
          await interaction.update({ components: [ ...newRows ] });
        } catch {
          await interaction.reply({ content: "กำลังปิดห้อง...", ephemeral: true }).catch(() => {});
        }
        try {
          await lockChannelReadOnly(currentChannel, interaction.guild);
          await currentChannel.send("### ห้องนี้ถูกปิดแล้ว โดยผู้ดูแล");
        } catch (e) {
          await currentChannel.send("❌ ปิดห้องไม่สำเร็จ").catch(() => {});
        }
        return;
      }

      if (interaction.isModalSubmit && interaction.isModalSubmit() && interaction.customId.startsWith("auction_change_modal:")) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
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
          await interaction.reply({ content: "⚠️ รูปแบบ **User ID** ไม่ถูกต้อง", ephemeral: true });
          return;
        }
        if (!isFinite(amount) || amount <= 0) {
          await interaction.reply({ content: "⚠️ รูปแบบ **ราคา** ไม่ถูกต้อง", ephemeral: true });
          return;
        }
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          await interaction.reply({ content: "❌ ไม่พบบุคคลนี้ในเซิร์ฟเวอร์", ephemeral: true });
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
        await bidChannel.send(`# ราคาล่าสุด คือ ${amount}\n## <@${userId}>\n**ปรับโดยแอดมิน**`);
        if (bidTimeouts.has(channelId)) clearTimeout(bidTimeouts.get(channelId));
        const timeout = setTimeout(async () => {
          const latest = (await docRef.get()).data();
          if (latest) {
            await bidChannel.send(`# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`);
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
    } catch (err) {
      console.error("InteractionCreate error:", err);
      try {
        if (interaction?.isRepliable?.() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ มีข้อผิดพลาดในการทำงานของอินเทอแอคชัน", ephemeral: true });
        }
      } catch {}
    }
  });
};
