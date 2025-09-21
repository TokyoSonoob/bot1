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

// --- PAYMENT EMBED (รูปตามที่สั่ง) ---
const PAYMENT_IMG_URL = "https://cdn.discordapp.com/attachments/1376746453795471490/1418928780574986350/956.png?ex=68cfe7e7&is=68ce9667&hm=f7a3c925b2f594255a1f502abc5a4a4bdf02049c0153df6f87249746854977e5&";

function makePaymentEmbed() {
  return new EmbedBuilder()
    .setTitle("ช่องทางการชำระเงิน")
    .setDescription("⭐ สามารถโอนได้เลยน้าา\nแนบสลิปหลังโอนเพื่อความรวดเร็ว")
    .setColor(0x9b59b6)
    .setImage(PAYMENT_IMG_URL);
}

module.exports = function (client) {

  // =========================
  // ⬇⬇ NEW: Helper ดึงราคาบิดล่าสุดของช่อง
  // =========================
  async function getLatestBidPrice(channel, guild) {
    // 1) ลองอ่านจาก Firestore ก่อน (เร็วและแม่นกว่า)
    try {
      const snap = await bidsRef.doc(channel.id).get();
      if (snap.exists) {
        const d = snap.data();
        if (d?.price && isFinite(d.price)) {
          return Number(d.price);
        }
      }
    } catch (e) {
      console.warn("getLatestBidPrice: Firestore error:", e?.message || e);
    }

    // 2) Fallback: สแกนข้อความย้อนหลังเพื่อหาโพสต์ “ชื่อ ราคา”
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
        // ไม่ต้องหา “สูงสุด” — เราเอา “ล่าสุด” ตามเวลาข้อความ
      }
      beforeId = batch.last().id;
      // จำกัดรอบสแกน ~300 ข้อความ
      if (beforeId == null || batch.size < 100) break;
    }

    return latest?.price ?? null;
  }

  function parseBaseRoomName(name) {
    // รองรับ: "ครั้งที่-12", "ครั้งที่-12-150", "ครั้งที่-12-ล่าสุด-150"
    const m = String(name || "").match(/^(ครั้งที่-\d+)(?:-(?:ล่าสุด-)?[\d.]+)?$/);
    return m ? m[1] : null;
  }


  // ฟอร์แมตราคา: จำนวนเต็มไม่ใส่ทศนิยม, มีทศนิยมคงไว้สูงสุด 2 ตำแหน่ง
  function fmtPrice(p) {
    if (p == null) return null;
    const n = Number(p);
    if (!isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/,'');
  }

  // =========================
  // ⬇⬇ NEW: งานหลัก — เปลี่ยนชื่อห้องให้มีเลขบิดล่าสุด
  // =========================
  async function updateAuctionRoomNamesWithLatestBid() {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) {
        console.warn("updateAuctionRoomNamesWithLatestBid: no guild");
        return;
      }

      // ข้ามห้องที่ถูกปิด (“❌ ปิดการประมูล”)
      const channels = guild.channels.cache.filter((ch) => {
        if (!ch || (ch.type !== 0 && ch.type !== 5)) return false; // เฉพาะ text/news
        if (ch.parentId !== AUCTION_CATEGORY_ID) return false;
        if (!/ครั้งที่/i.test(ch.name)) return false;
        if (ch.name.startsWith("❌")) return false;
        // ต้องจับเฉพาะชื่อที่เป็น “ครั้งที่-<n>” หรือ “ครั้งที่-<n>-<num>”
        return /^(ครั้งที่-\d+)(?:-(?:ล่าสุด-)?[\d.]+)?$/.test(ch.name);
      });

      if (!channels.size) {
        // ไม่มีห้องที่จะอัปเดต
        return;
      }

      console.log(`🔄 ตรวจอัปเดตชื่อห้อง (${channels.size} ห้อง) ...`);

      for (const ch of channels.values()) {
        try {
          const base = parseBaseRoomName(ch.name);
          if (!base) continue;

          // ดึงราคาบิดล่าสุดของห้องนี้
          const latest = await getLatestBidPrice(ch, guild);
          const priceStr = fmtPrice(latest);

          // ถ้ายังไม่มีราคา (ยังไม่มีบิด) ให้ถอด suffix ออกให้เหลือ "ครั้งที่-<n>" เฉยๆ
          const desiredName = priceStr ? `${base}-ล่าสุด-${priceStr}` : base;

          if (desiredName !== ch.name) {
            // ป้องกันยาวเกิน 100 ตัวอักษรของ Discord
            const finalName = desiredName.slice(0, 100);
            await ch.setName(finalName).catch(() => {});
            console.log(`✏️ เปลี่ยนชื่อ: ${ch.name} → ${finalName}`);
            // กัน rate-limit นิดหน่อย
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

  // 🆕 helper: ล็อกแล้ว “ซ่อนห้องจาก @everyone” + รีเนมเป็น ❌ ปิดการประมูล
  async function lockChannelReadOnly(channel, guild) {
    try {
      // ซ่อนจากทุกคน (@everyone) และปิดสิทธิ์อื่นๆ ให้ชัดเจน
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false,              // <<< ซ่อนห้อง
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

      // ให้บอทยังเข้ามาจัดการ/โพสต์ได้
      await channel.permissionOverwrites.edit(client.user.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        ManageChannels: true,
        EmbedLinks: true,
        AttachFiles: true,
      });

      // รีเนมเป็น “❌ ปิดการประมูล”
      if (channel.name !== "❌ ปิดการประมูล") {
        await channel.setName("❌ ปิดการประมูล").catch(() => {});
      }

      // เคลียร์ timeout ของห้องนี้ถ้ามี
      if (bidTimeouts.has(channel.id)) {
        clearTimeout(bidTimeouts.get(channel.id));
        bidTimeouts.delete(channel.id);
      }

      console.log(`🔒 ซ่อนห้อง + รีเนมแล้ว: ${channel.id}`);
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

    // ส่งปุ่ม "ปิดห้อง"
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

  // ===== 🧹 ลบห้องที่ปิดประมูลทุกวัน 12:00 (Asia/Bangkok) =====
  function isClosedAuctionChannelName(name) {
    // รองรับทั้งแบบมีขีดและมีเว้นวรรค
    const targets = new Set(["❌-ปิดการประมูล", "❌ ปิดการประมูล"]);
    return targets.has(String(name || ""));
  }

  async function deleteClosedAuctionChannels() {
    try {
      // รองรับหลายกิลด์ (ถ้ามี) — ลบให้ครบทุกกิลด์ที่บอทอยู่
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
            // กัน rate limit เบาๆ
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
    // --- Register /change (guild command) ---
    try {
      const guild = client.guilds.cache.first();
      if (!guild) {
        console.warn("⚠️ ไม่มี guild ให้ลงทะเบียนสแลชคำสั่ง");
      } else {
        // ลบคำสั่งชื่อ 'change' เดิม (กันซ้ำ) แล้วค่อยสร้างใหม่
        const existing = await guild.commands.fetch().catch(() => null);
        const dup = existing?.find(c => c.name === "change");
        if (dup) await guild.commands.delete(dup.id).catch(() => {});

        await guild.commands.create({
          name: "change",
          description: "ปรับราคา/ผู้ชนะ (ADMIN)",
          // ไม่มี options — เปิดฟอร์ม (Modal) ทันทีในห้องที่สั่ง
        });

        console.log(`✅ ลงทะเบียน /change ในกิลด์ ${guild.name} แล้ว`);
      }
    } catch (e) {
      console.error("❌ ลงทะเบียน /change ล้มเหลว:", e);
    }

    // ⬇⬇ NEW: ตั้งงานอัปเดตชื่อห้องทุกๆ 10 นาที (Asia/Bangkok)
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

    // เรียกครั้งแรกทันทีหลังบอทพร้อม
    await updateAuctionRoomNamesWithLatestBid();

    // (Optional) log นัดครั้งถัดไป
    const nextRename = jobRenameTicker.nextInvocation?.();
    if (nextRename) {
      console.log("⏭️ [rename] next run (Asia/Bangkok):",
        nextRename.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
      );
    }

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

        // --- ตัด suffix "-ล่าสุด-<ราคา>" ออกจากชื่อห้องสำหรับล็อกประวัติ ---
        const cleanName =
          (typeof parseBaseRoomName === "function" && parseBaseRoomName(bidChannel.name)) ||
          String(bidChannel.name).replace(/-ล่าสุด-[\\d.]+$/, "");

        const bidDoc = await bidsRef.doc(bidChannelId).get();
        const bidData = bidDoc.exists ? bidDoc.data() : null;

        if (bidData?.userId && bidData?.price && bidData?.name) {
          const { userId, price, name } = bidData;
          const fee = price * 0.08;

          await bidChannel.send(
            `# จบการประมูล \\n## คุณ ${name}\\n## ชนะในราคา ${price} บาท\\n<@${userId}>`
          );

          await receptionChannel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });

          // ✅ ใส่ embed ช่องทางชำระเงิน
          await receptionChannel.send({
            content:
              `# การประมูลได้จบลงไปแล้ว \\n` +
              `## คุณ <@${userId}>\\n` +
              `## ชนะในราคา ${price} บาท\\n` +
              `** คุณ <@${ownerId}> ส่งช่องทางการโอนให้กับคนที่ชนะประมูล\\n` +
              ` และโอนค่าที่ประมูลด้านล่างเลออ\\n` +
              ` เป็นจำนวน ${fee.toFixed(2)} บาท**`,
            embeds: [makePaymentEmbed()],
          });

          await historyChannel.send(
            `# ${cleanName}\\n## คุณ <@${userId}> ได้ไปในราคา ${price} บาท\\n**เจ้าของประมูลคือ <@${ownerId}>**`
          );
        } else {
          await bidChannel.send("# ปิดการประมูล\\n## ไม่มีผู้ประมูลในห้องนี้");
          await receptionChannel.send(
            `# การประมูลได้จบลงแล้ว\\n ## ขอแสดงความเสียใจด้วยคับ ไม่มีผู้ประมูล\\n ## ไม่มีค่าที่ประมูลคับ หากจะลงประมูลใหม่ต้องกดตั๋วอีกครั้งคับ \\n <@${ownerId}>`
          );

          await historyChannel.send(
            `# ${cleanName}\\n## ปิดการประมูล — ไม่มีผู้ประมูล\\n**เจ้าของประมูลคือ <@${ownerId}>**`
          );
        }

        // ลบข้อมูล bids
        await bidsRef.doc(bidChannelId).delete().catch(() => {});
        console.log(`🗑️ ลบข้อมูล bids ของห้อง ${bidChannel.name} เรียบร้อย`);

        // 🔒 เปลี่ยนเป็น "อ่านอย่างเดียว" + รีเนม
        await lockChannelReadOnly(bidChannel, guild);
      }
    };


    // ===== ตั้ง CRON ปิดประมูล: อังคาร/พฤหัส/เสาร์ 20:00 (เวลาไทย) =====
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
      { rule: "0 19 * * 1,2,3,4,5,6,7", tz: "Asia/Bangkok" },
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
              const match = data.roomName?.match(/ครั้งที่-(\\d+)/);
              const count = match ? parseInt(match[1]) : Number.POSITIVE_INFINITY;
              return { doc, count };
            })
            .filter((x) => Number.isFinite(x.count))
            .sort((a, b) => a.count - b.count)
            .map((x) => x.doc);

          const toOpen = docsSorted.slice(0, 10); // เปิด 5 ห้อง
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

    // 🕛 ตั้ง CRON ลบห้องปิดประมูล 12:00 ทุกวัน
    const jobDailyCleanup = schedule.scheduleJob(
      { rule: "0 12 * * *", tz: "Asia/Bangkok" },
      async () => {
        const nowTH = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
        console.log(`🕛 RUN daily closed-channel cleanup @TH ${nowTH}`);
        await deleteClosedAuctionChannels();
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
    const nextCleanup = jobDailyCleanup.nextInvocation?.();
    if (nextCleanup) {
      console.log("⏭️ [cleanup] next run (server):", nextCleanup.toString());
      console.log(
        "⏭️ [cleanup] next run (Asia/Bangkok):",
        nextCleanup.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
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

        // 🆕 เปลี่ยนเป็น "อ่านอย่างเดียว" + รีเนม
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

        // ✅ ใช้ owner จาก receptionRecord และใช้ embed ช่องทางชำระเงิน
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

        await db.collection("bids").doc(bidChannelId).delete().catch(() => {});
        console.log("✅ จบการประมูลเรียบร้อย");

        const historyChannelId = "1376195659501277286";
        const historyChannel = message.guild.channels.cache.get(historyChannelId);
        if (historyChannel) {
          // 🔧 ลบคำว่า -ล่าสุด-<ราคา> ออกจากชื่อห้องก่อน และเพิ่มเจ้าของประมูลด้านล่าง
          const cleanName =
            (typeof parseBaseRoomName === "function" && parseBaseRoomName(bidChannel.name)) ||
            String(bidChannel.name).replace(/-ล่าสุด-[\\d.]+$/, "");
          await historyChannel.send(
            `# ${cleanName}\n## คุณ <@${userId}> ได้ไปในราคา ${price} บาท\n**เจ้าของประมูลคือ <@${receptionRecord.ownerId}>**`
          );
        }

        // 🆕 เปลี่ยนเป็น "อ่านอย่างเดียว" + รีเนม
        await lockChannelReadOnly(bidChannel, message.guild);
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
        const warnMsg = await channel.send('เขียนรูปแบบ**"ชื่อ ราคา"**');
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
  // ===== InteractionCreate (Slash, Modal, Buttons) =====
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // -----------------------------
      // /change → เปิด Modal (ADMIN)
      // -----------------------------
      if (interaction.isChatInputCommand && interaction.isChatInputCommand() && interaction.commandName === "change") {
        // ✅ เช็คสิทธิ์แอดมิน
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
          return;
        }

        // ✅ เช็คว่าอยู่ในห้องประมูลที่ถูกต้อง
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

        // ✅ เปิดฟอร์ม (hostMsgId เว้นว่าง)
        const modal = new ModalBuilder()
          .setCustomId(`auction_change_modal:${bidChannel.id}:`)
          .setTitle("ปรับราคา/ผู้ชนะ (ADMIN)");

        const userIdInput = new TextInputBuilder()
          .setCustomId("user_id")
          .setLabel("User ID (ตัวเลข)")
          .setPlaceholder("เช่น 123456789012345678")
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

      // ------------------------------------------
      // ปุ่มปิดห้อง: close_public_<channelId> (ADMIN)
      // ------------------------------------------
      if (interaction.isButton && interaction.isButton() && interaction.customId.startsWith("close_public_")) {
        // ✅ เช็คสิทธิ์แอดมิน
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
          return;
        }

        const channelId = interaction.customId.replace("close_public_", "");
        const currentChannel = interaction.channel;

        // ✅ กดได้เฉพาะในห้องเดียวกัน
        if (!currentChannel || currentChannel.id !== channelId) {
          await interaction.reply({
            content: "⚠️ ปุ่มนี้ใช้ได้เฉพาะในห้องที่สร้างปุ่มเท่านั้น",
            ephemeral: true,
          });
          return;
        }

        // ปิดการใช้งานปุ่มในข้อความนั้น
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

          await interaction.update({ components: newRows });
        } catch {
          // ถ้า update ไม่ได้ (เช่นหมดเวลา) ก็แค่ตอบแยก
          await interaction.reply({ content: "กำลังปิดห้อง...", ephemeral: true }).catch(() => {});
        }

        // 🔒 ล็อกอ่านอย่างเดียว + รีเนม (helper มีอยู่แล้วในไฟล์นี้)
        try {
          await lockChannelReadOnly(currentChannel, interaction.guild);
          // แจ้งผล
          await currentChannel.send("### ห้องนี้ถูกปิดแล้ว โดยผู้ดูแล");
        } catch (e) {
          await currentChannel.send("❌ ปิดห้องไม่สำเร็จ").catch(() => {});
        }
        return;
      }

      // --------------------------------------------
      // Modal submit: auction_change_modal:<cid>:<mid?>
      // --------------------------------------------
      if (interaction.isModalSubmit && interaction.isModalSubmit() && interaction.customId.startsWith("auction_change_modal:")) {
        // ✅ เช็คสิทธิ์แอดมิน
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

        // รับค่า
        const userId = interaction.fields.getTextInputValue("user_id").trim();
        const amountStr = interaction.fields.getTextInputValue("amount").trim();
        const amount = parseFloat(amountStr);

        // ตรวจรูปแบบ
        if (!/^\\d{17,20}$/.test(userId)) {
          await interaction.reply({ content: "⚠️ รูปแบบ **User ID** ไม่ถูกต้อง", ephemeral: true });
          return;
        }
        if (!isFinite(amount) || amount <= 0) {
          await interaction.reply({ content: "⚠️ รูปแบบ **ราคา** ไม่ถูกต้อง", ephemeral: true });
          return;
        }

        // ต้องมีสมาชิกในกิลด์
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          await interaction.reply({ content: "❌ ไม่พบบุคคลนี้ในเซิร์ฟเวอร์", ephemeral: true });
          return;
        }

        const displayName = member.displayName || member.user.username || "Unknown";

        // บันทึก bids
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

        // แจ้งราคาล่าสุด
        await bidChannel.send(`# ราคาล่าสุด คือ ${amount}\n## <@${userId}>\n**ปรับโดยแอดมิน**`);

        // ตั้ง timeout แจ้งเตือน “ราคาล่าสุด”
        if (bidTimeouts.has(channelId)) {
          clearTimeout(bidTimeouts.get(channelId));
        }
        const timeout = setTimeout(async () => {
          const latest = (await docRef.get()).data();
          if (latest) {
            await bidChannel.send(`# ราคาล่าสุดคือ ${latest.price}\n## <@${latest.userId}>`);
          }
        }, 5 * 60 * 1000);
        bidTimeouts.set(channelId, timeout);

        // ถ้า modal มาจากปุ่ม/ข้อความเดิม ให้ลบข้อความนั้น (กรณีเก่า — เผื่อยังมีหลงเหลือ)
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

      // (ถ้ามี interactions ประเภทอื่น เพิ่มต่อได้ที่นี่)

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
