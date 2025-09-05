require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder: ModalRowBuilder,
} = require("discord.js");
const fetch = require("node-fetch");
const path = require("path");
const admin = require("firebase-admin");
const {
  saveAuctionData,
  getAuctionData,
  deleteAuctionData,
} = require("./storage");
require("./server");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ===== โมดูลอื่น ๆ =====
require("./money")(client);
require("./skin")(client);
require("./send")(client);
require("./pamoon")(client);
require("./ticket")(client);
require("./emoji")(client);
require("./embed")(client);
require("./pro")(client);
require("./boom")(client);
require("./report")(client);
require("./eiei")(client);
require("./com")(client);
require("./pitekorn")(client);
require("./clearchat")(client);
require("./everyone")(client);
require("./tk")(client);
require("./dis")(client);
require("./x")(client);
// ===== STATE =====
const imageCollectorState = new Map();
const restrictedChannels = new Set();

// ===== CONFIG =====
const PUBLIC_CATEGORY_ID  = "1375026841114509332"; // หมวดหมู่ public (ห้องเปิดประมูล)
const PRIVATE_CATEGORY_ID = "1387466735619412030"; // หมวดห้องส่วนตัว (ห้องรับงาน)
const PER_DAY_CAPACITY    = 5;                     // 1 วันลงได้ 5 งาน

// ✅ ที่เก็บ "ฐานข้อมูลรูป/permaLink" (server/room ปลายทาง)
const PERMA_GUILD_ID   = "1401622759582466229"; // server (guild) ปลายทาง
const PERMA_CHANNEL_ID = "1413522411025862799"; // room (channel) ปลายทาง

// ===== Helpers: นับคิว/คาดการณ์ =====
function extractCountFromRoomName(name) {
  if (!name) return null;
  const m = String(name).match(/ครั้งที่-(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function formatThaiDate(date) {
  const d = new Date(date);
  const thDate = d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const weekday = d.toLocaleDateString("th-TH", { weekday: "long" });
  return `${thDate} (${weekday})`;
}
async function getLatestPostedCountFromFirestore() {
  const snap = await admin.firestore().collection("auction_records").get();
  let maxCount = 0;
  snap.forEach(doc => {
    const data = doc.data();
    const hasPublic = data?.publicChannelId ? true : false;
    if (!hasPublic) return;
    const c = extractCountFromRoomName(data?.roomName);
    if (Number.isFinite(c) && c > maxCount) maxCount = c;
  });
  return maxCount;
}
function estimateDateByQueueSize(pendingCount, perDay = PER_DAY_CAPACITY) {
  const offsetDays = Math.floor(pendingCount / perDay) + 1;
  const est = new Date();
  est.setDate(est.getDate() + offsetDays);
  return est;
}

// ✅ ตัดบรรทัด "คาดการณ์" ออก (ไม่ให้ถูกบันทึก/เผยแพร่ public)
function stripEstimatedDate(text) {
  if (!text) return text;
  return text
    .replace(/^\s*##\s*วันที่คาดการจะลง[^\n]*\n?/m, "")
    .replace(/^\s*##\s*ลงประมูลประมาณวันที่[^\n]*\n?/m, "")
    .replace(/^\s*##\s*ล่าสุดที่ลง\s*:\s*ครั้งที่-[^\n]*\n?/m, "");
}

// ===== Utility: โหลดไฟล์แนบจาก permaLink =====
async function getAttachmentsFromPermaLink(permaLink) {
  const match = permaLink?.match(
    /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/
  );
  if (!match) return [];

  const [, , channelId, messageId] = match;

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    {
      headers: { Authorization: `Bot ${process.env.token}` },
    }
  );

  if (!res.ok) {
    console.warn("❌ ดึงข้อความจาก permaLink ไม่ได้:", await res.text());
    return [];
  }

  const msgData = await res.json();
  return msgData.attachments || [];
}

// ====== Booking Panel: อัปเดตตัวเลขคิวแบบเรียลไทม์ ======
const bookingPanels = new Set(); // { channelId, messageId }

function buildBookingEmbed(stats) {
  const { pendingCount, latestPostedCount, etaDate } = stats || {
    pendingCount: 0,
    latestPostedCount: 0,
    etaDate: new Date(),
  };
  const etaText = formatThaiDate(etaDate);
  const embed = new EmbedBuilder()
    .setTitle('จองห้องประมูล')
    .setDescription([
      'เปิดตั๋วเพื่อจองห้อง',
      '',
      `**ปัจจุบันมีคนรอการจองประมูลอยู่:** ${pendingCount} คน`,
      `**หากจองตอนนี้จะลงประมาณวันที่:** ${etaText}`,
    ].join('\n'))
    .setColor(0x9b59b6)
    .setImage('https://media.tenor.com/S4MdyoCR3scAAAAM/oblakao.gif')
    .setFooter({ text: "Make by Purple Shop" });
  return embed;
}
function buildBookingRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_room')
      .setLabel('จองประมูล')
      .setStyle(ButtonStyle.Danger)
  );
}
async function computeStatsFromSnapshotDocs(docs) {
  let pendingCount = 0;
  let latestPostedCount = 0;
  for (const d of docs) {
    const data = d.data();
    if (!data) continue;
    if (data.publicChannelId == null) {
      pendingCount++;
    } else {
      const c = extractCountFromRoomName(data.roomName);
      if (Number.isFinite(c) && c > latestPostedCount) latestPostedCount = c;
    }
  }
  const etaDate = estimateDateByQueueSize(pendingCount, PER_DAY_CAPACITY);
  return { pendingCount, latestPostedCount, etaDate };
}
async function getQueueStatsOnce() {
  const snap = await admin.firestore().collection('auction_records').get();
  return computeStatsFromSnapshotDocs(snap.docs);
}
async function updateAllBookingPanels(stats) {
  for (const ref of Array.from(bookingPanels)) {
    try {
      const channel = await client.channels.fetch(ref.channelId);
      if (!channel || !channel.isTextBased?.()) {
        bookingPanels.delete(ref);
        continue;
      }
      const msg = await channel.messages.fetch(ref.messageId).catch(() => null);
      if (!msg) {
        bookingPanels.delete(ref);
        continue;
      }
      await msg.edit({ embeds: [buildBookingEmbed(stats)], components: [buildBookingRow()] });
    } catch (e) {
      bookingPanels.delete(ref);
    }
  }
}

client.once("ready", async () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);

  // Live update: เมื่อมีการเปลี่ยนแปลงใน auction_records ให้แก้ไขแพแนลทั้งหมด
  admin.firestore().collection('auction_records').onSnapshot(async (snap) => {
    try {
      const stats = await computeStatsFromSnapshotDocs(snap.docs);
      await updateAllBookingPanels(stats);
    } catch (err) {
      console.error('❌ update booking panels error:', err);
    }
  }, (err) => {
    console.error('❌ onSnapshot auction_records error:', err);
  });
});

// ===== Fallback summary =====
async function sendFallbackSummary(channel, summary, userId) {
  await channel.send({ content: summary });
  imageCollectorState.delete(userId);
}

const { getLastBid, setLastBid } = require("./storage");

// ===== helper: เปิดประมูลของ "ห้องนี้เท่านั้น" ไปยังหมวด public =====
async function openPublicAuctionForCurrentRoom(guild, recordLikeDoc, parentId) {
  const data = recordLikeDoc.data();
  let summary = data.summary || "⚠️ ไม่มีสรุป";

  // กันพลาด: ลบบรรทัดคาดการณ์อีกชั้น
  summary = stripEstimatedDate(summary);

  // แทน "## วันที่ : รอคิวก่อน" ด้วยวันพรุ่งนี้ (ให้ดูเป็นวันเปิด)
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

  const channelName = data.roomName || `ครั้งที่-${recordLikeDoc.id}`;
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
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },
    ],
  });

  // ส่งสรุป + รูป (ถ้ามี)
  await publicChannel.send({
    content: finalSummary,
    files: imageFiles.length ? imageFiles : undefined,
  });

  // ปุ่มปิดห้อง public
  const adminRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_public_${publicChannel.id}`)
      .setLabel("ปิดห้อง")
      .setStyle(ButtonStyle.Danger)
  );
  await publicChannel.send({ content: " ", components: [adminRow] });

  // บันทึกเฉพาะ publicChannelId เพื่ออ้างอิงภายหลัง
  await admin.firestore().collection("auction_records").doc(recordLikeDoc.id).set(
    { publicChannelId: publicChannel.id },
    { merge: true }
  );

  return publicChannel.id;
}

// ===== คำสั่ง !room สร้าง "แพแนลจอง" พร้อมตัวเลขคิวสด =====
client.on("messageCreate", async (message) => {
  if (message.content === '!room') {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return;
    }

    await message.delete().catch(console.error);

    // ดึงคิวล่าสุดเพื่อแสดงตอนสร้าง
    let stats = { pendingCount: 0, latestPostedCount: 0, etaDate: new Date() };
    try { stats = await getQueueStatsOnce(); } catch {}

    const panelMsg = await message.channel.send({
      embeds: [buildBookingEmbed(stats)],
      components: [buildBookingRow()],
    });

    // เก็บไว้เพื่ออัปเดตอัตโนมัติเมื่อ Firestore เปลี่ยน
    bookingPanels.add({ channelId: panelMsg.channel.id, messageId: panelMsg.id });
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // ปิดห้อง public (ถ้ามี)
  if (interaction.isButton() && interaction.customId.startsWith("close_public_")) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ปิดห้องนี้", flags: 1 << 6 });
    }
    await interaction.reply({ content: "🗑️ ลบห้องเรียบร้อย...", flags: 1 << 6 });
    await interaction.channel.delete();
  }

  const guild = interaction.guild;

  if (interaction.isButton()) {
    // เปิดห้องส่วนตัว
    if (interaction.customId === "open_room") {
      const parentId = PRIVATE_CATEGORY_ID;
      const counterRef = admin.firestore().collection("auction_counters").doc("counter");
      const counterSnap = await counterRef.get();
      let latestCount = 0;
      if (counterSnap.exists) latestCount = counterSnap.data().latestCount || 0;

      const nextCount = latestCount + 1;
      await counterRef.set({ latestCount: nextCount });

      const baseName = `ครั้งที่-${nextCount}`;
      const channelName = `${baseName}-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-zA-Z0-9ก-๙\-]/g, "");

      await interaction.reply({ content: `✅ สร้างห้องส่วนตัวของคุณแล้ว`, flags: 1 << 6 });
      
      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: 0,
        parent: parentId,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ]},
          { id: client.user.id, allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
          ]},
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle("📋 กรอกข้อมูลได้เลยย")
        .setDescription("กรุณากรอกข้อมูลให้ครบถ้วนตามที่ระบบกำหนด")
        .setColor(0x9b59b6);

      const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_channel").setLabel("ปิดห้อง").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("fill_info").setLabel("กรอกข้อมูล").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("submit_info").setLabel("ส่งข้อมูล").setStyle(ButtonStyle.Success),
      );

      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [adminRow] });
    }

    // ปิดห้องส่วนตัว
    if (interaction.customId === "close_channel") {
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ปิดห้องนี้", flags: 1 << 6 });
      }
      await interaction.reply({ content: "🗑️ ลบห้องเรียบร้อย...", flags: 1 << 6 });
      const channelId = interaction.channel.id;
      await admin.firestore().collection("auction_records").doc(channelId).delete().catch(console.warn);
      await interaction.channel.delete();
    }

    // เปิด modal กรอกข้อมูล
    if (interaction.customId === "fill_info") {
      const modal = new ModalBuilder().setCustomId("auction_form").setTitle("📋 กรอกข้อมูลการประมูล");

      modal.addComponents(
        new ModalRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("start_price").setLabel("💰 ยอดเริ่มต้น (บาท)").setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("bid_step").setLabel("🔼 บิดครั้งละ (บาท)").setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("target_price").setLabel("🎯 ยอดที่ตั้งไว้ (บาท)").setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("prize").setLabel("🎁 สิ่งที่จะได้").setStyle(TextInputStyle.Paragraph).setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("rules").setLabel("📜 กฎ").setStyle(TextInputStyle.Paragraph).setRequired(true),
        ),
      );

      await interaction.showModal(modal);
    }

    // ===== ส่งข้อมูล → เปิดห้อง public "เฉพาะงานของห้องนี้" (ไม่เขียน summary/ไม่มีรูปลง Firestore) =====
    if (interaction.customId === "submit_info") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const channelId = interaction.channel.id;
        const baseName = interaction.channel.name.split("-").slice(0, 2).join("-");
        const docRef = admin.firestore().collection("auction_records").doc(channelId);
        const docSnap = await docRef.get();

        // สรุปที่จะใช้เปิด public:
        // - ถ้ามีใน Firestore แล้ว → ใช้อันนั้น (ปลอดคาดการณ์)
        // - ถ้าไม่มี → ใช้จาก global preview แล้ว strip ออก
        let summaryToUse = null;
        let permaLink = null;

        if (docSnap.exists && docSnap.data()?.summary) {
          summaryToUse = stripEstimatedDate(docSnap.data().summary || "");
          permaLink = docSnap.data()?.permaLink || null;
        } else {
          const previewSummary = globalThis.lastFullSummary?.[channelId] || null;
          if (!previewSummary) {
            await interaction.editReply({ content: "❌ ยังไม่มีข้อมูลสรุป กรุณากรอกฟอร์มก่อน" });
            return;
          }
          summaryToUse = stripEstimatedDate(previewSummary);
          permaLink = null; // ยังไม่มีรูป ไม่เขียน Firestore
        }

        // doc-like object สำหรับเปิด public โดยไม่ต้องเขียน summary ลง Firestore
        const recordLikeDoc = {
          id: channelId,
          data: () => ({
            summary: summaryToUse,
            roomName: baseName,
            permaLink,
          }),
        };

        const parentId = PUBLIC_CATEGORY_ID;
        const parentCategory =
          guild.channels.cache.get(parentId) ||
          (await guild.channels.fetch(parentId).catch(() => null));
        if (!parentCategory) {
          await interaction.editReply({ content: "❌ ไม่พบหมวดหมู่ public (ตรวจสอบ PUBLIC_CATEGORY_ID)" });
          return;
        }

        const newPublicId = await openPublicAuctionForCurrentRoom(guild, recordLikeDoc, parentId);

        await interaction.editReply({
          content: `✅ เปิดห้องประมูลแล้วที่ <#${newPublicId}>`,
        });
      } catch (err) {
        console.error("❌ submit_info error:", err);
        await interaction.editReply({ content: "❌ เกิดข้อผิดพลาดขณะเปิดประมูลของห้องนี้" });
      }
    }

    // กด "ไม่มีรูป" → โชว์พรีวิวเท่านั้น (ไม่เขียน Firestore)
    if (interaction.customId === "no_image") {
      const userId = interaction.user.id;
      const channelId = interaction.channel.id;

      const previewSummary = globalThis.lastFullSummary?.[channelId] || "⚠️ ไม่มีสรุป";

      // ลบข้อความบอทเก่า (ยกเว้น embed หลัก)
      if (imageCollectorState.has(userId)) {
        const oldMsg = imageCollectorState.get(userId);
        try { await oldMsg.delete(); } catch {}
        imageCollectorState.delete(userId);
      }

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter(
        (m) =>
          m.author.id === client.user.id &&
          !m.embeds.some((e) => e.title === "📋 กรอกข้อมูลได้เลยย"),
      );
      for (const m of toDelete.values()) {
        try { await m.delete(); } catch {}
      }

      if (!imageCollectorState.has(userId)) {
        try {
          const msg = await interaction.channel.send({ content: previewSummary });
          imageCollectorState.set(userId, msg);
        } catch (err) {
          console.warn("❌ ส่ง fallback summary ไม่สำเร็จ:", err.message);
        }
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "📷 ระบบรับทราบว่าไม่มีรูปภาพแนบ (ไม่บันทึกข้อมูล)",
          flags: 1 << 6,
        });
      } else {
        await interaction.followUp({
          content: "📷 แสดงสรุปในห้องนี้เรียบร้อย (ไม่บันทึกข้อมูล)",
          ephemeral: true,
        });
      }
    }
  }

  // ===== Modal Submit: auction_form (คง "วันที่" เดิม + เพิ่ม "คาดการณ์" เฉพาะที่โชว์) =====
  if (interaction.isModalSubmit() && interaction.customId === "auction_form") {
    await interaction.deferReply({ ephemeral: true }); // กัน Unknown interaction

    try {
      const filter = (m) => m.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({
        filter,
        time: 30 * 60 * 1000,
      });

      await deleteAuctionData(interaction.channel.id);

      const startPrice  = interaction.fields.getTextInputValue("start_price");
      const bidStep     = interaction.fields.getTextInputValue("bid_step");
      const targetPrice = interaction.fields.getTextInputValue("target_price");
      const prize       = interaction.fields.getTextInputValue("prize");
      const rules       = interaction.fields.getTextInputValue("rules");

      const channelName = interaction.channel.name;
      const title = `# ${channelName.replace(/-/g, " ")}`;

      // ใช้ความยาวคิวจริงจาก Firestore เพื่อคาดการณ์
      const statsNow = await getQueueStatsOnce();
      const estDate  = estimateDateByQueueSize(statsNow.pendingCount, PER_DAY_CAPACITY);
      const estThai  = formatThaiDate(estDate);

      const fullSummary = `${title}

## เริ่มต้นที่ราคา : ${startPrice} บาท
## บิดครั้งละ : ${bidStep} บาท
## ยอดที่ตั้งไว้ : ${targetPrice} บาท
## สิ่งที่จะได้ : ${prize}
## กฎ : ${rules}
## ปิดเวลา 20:00 น.
## วันที่ : รอคิวก่อน
## ลงประมูลประมาณวันที่ ${estThai}
## ล่าสุดที่ลง : ครั้งที่-${statsNow.latestPostedCount || 0}
||@everyone||`;

      if (!globalThis.lastFullSummary) globalThis.lastFullSummary = {};
      globalThis.lastFullSummary[interaction.channel.id] = fullSummary;

      const imagePrompt = new EmbedBuilder()
        .setTitle("📷 กรุณาส่งรูปภาพ")
        .setDescription("🔽 ส่ง **รูปภาพสินค้า** ด้านล่าง หรือกดปุ่มด้านล่างถ้าไม่มีรูป")
        .setColor(0x3498db);

      const noImageRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("no_image").setLabel("📷 ไม่มีรูปภาพ").setStyle(ButtonStyle.Secondary),
      );

      // โชว์สรุป (มีบรรทัดคาดการณ์) ให้ลูกค้าเห็นในห้องนี้
      await interaction.channel.send({
        content: `<@${interaction.user.id}>\n\n${fullSummary}`,
        embeds: [imagePrompt],
        components: [noImageRow],
      });

      await interaction.editReply({ content: "✅ ข้อมูลได้รับแล้ว! แสดงผลในห้องเรียบร้อย กรุณาส่งรูปภาพถ้ามี" });

      // เก็บภาพจากผู้ใช้
      collector.on("collect", async (msg) => {
        const isImage =
          msg.attachments.size > 0 &&
          [...msg.attachments.values()].every((file) => file.contentType?.startsWith("image/"));

        if (!isImage) {
          try {
            await msg.delete();
            await msg.channel.send({ content: `❌ <@${msg.author.id}> โปรดส่ง **เฉพาะรูปภาพ** เท่านั้น` });
          } catch (err) { console.warn("ลบข้อความไม่ได้:", err.message); }
          return;
        }

        // ลบภาพเก่าถ้ามี
        if (imageCollectorState.has(msg.author.id)) {
          const oldMsg = imageCollectorState.get(msg.author.id);
          try { await oldMsg.delete(); } catch (err) { console.warn("ลบภาพเก่าไม่สำเร็จ"); }
        }
        imageCollectorState.set(msg.author.id, msg);

        // ลบข้อความที่ไม่ใช่ embed หลัก
        const messages = await msg.channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter(
          (m) => m.author.id === client.user.id && !m.embeds.some((e) => e.title === "📋 กรอกข้อมูลได้เลยย"),
        );
        for (const m of botMessages.values()) { try { await m.delete(); } catch (err) {} }

        // ส่งรูป + สรุปพรีวิว (มีบรรทัดคาดการณ์) ในห้องปัจจุบัน
        await msg.channel.send({
          content: fullSummary,
          files: [...msg.attachments.values()].map((a) => a.url),
        });

        try { await msg.react("✅"); await msg.delete(); } catch (err) {}

        // ===== ส่งภาพไปยังห้องถาวร (server/room ใหม่) เก็บลิงก์ permaLink =====
        const permaChannel = await client.channels.fetch(PERMA_CHANNEL_ID);

        const permaMsg = await permaChannel.send({
          content: `<#${msg.channel.id}>`,
          files: [...msg.attachments.values()].map((a) => a.url),
        });

        const currentName = interaction.channel.name;
        const baseName = currentName.split("-").slice(0, 2).join("-");
        // 👇 ใช้ PERMA_GUILD_ID/CHANNEL_ID ตามที่กำหนด
        const permaLink = `https://discord.com/channels/${PERMA_GUILD_ID}/${PERMA_CHANNEL_ID}/${permaMsg.id}`;
        const timestamp = admin.firestore.Timestamp.now();
        const weekday = timestamp.toDate().toLocaleDateString("en-US", { weekday: "long" });

        // ✅ เซฟเฉพาะตอน "มีรูป" เพื่อเก็บ permaLink และ summary ที่ล้างบรรทัดคาดการณ์แล้ว
        const summaryToSave = stripEstimatedDate(fullSummary);

        await admin.firestore().collection("auction_records").doc(msg.channel.id).set({
          permaLink,
          summary: summaryToSave,
          date: timestamp,
          weekday,
          roomName: baseName,
          ownerId: interaction.user.id,
          publicChannelId: null, // ยังไม่กด "ส่งข้อมูล"
        }, { merge: true });

        collector.stop();
      });

      collector.on("end", async () => {
        if (!imageCollectorState.has(interaction.user.id)) {
          await sendFallbackSummary(interaction.channel, fullSummary, interaction.user.id);
        }
      });
    } catch (err) {
      console.error("auction_form handler error:", err);
      try { await interaction.editReply({ content: "❌ เกิดข้อผิดพลาดขณะประมวลผลฟอร์ม" }); } catch {}
    }
  }
});

client.login(process.env.token);
