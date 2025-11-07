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
  getLastBid,
  setLastBid,
} = require("./storage");
require("./server");

// ===== Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],              
});

// ===== โมดูลอื่น ๆ =====
require("./back")(client);
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
require("./dis")(client);
require("./ban")(client);
require("./test")(client);
require("./tt")(client);

// ===== Dynamic Backoffice Chain =====
const BACKOFFICE_ROOT_NAME  = "หลังบ้านประมูล";
const BACKOFFICE_BASE_NAME  = "หลังบ้านประมูล";
const BACKOFFICE_START_N    = 2;
const CATEGORY_MAX_CHANNELS = 50;
const BACKOFFICE_MAX_N      = 4;

function isCategory(ch) { return ch?.type === 4; }
function childrenOf(guild, categoryId) {
  // คืน Array เรียงจากบนลงล่าง
  return guild.channels.cache
    .filter(ch => ch.parentId === categoryId && (ch.type === 0 || ch.type === 5))
    .sort((a,b) => (a.rawPosition ?? a.position) - (b.rawPosition ?? b.position))
    .toJSON(); // สำคัญ: แปลงเป็น Array
}
function countChildren(guild, categoryId) {
  return childrenOf(guild, categoryId).length; // ใช้ length แทน size
}


function getCategoryByExactName(guild, name) {
  return guild.channels.cache.find(ch => isCategory(ch) && ch.name === name) || null;
}
function parseBackofficeN(name) {
  const m = String(name||"").match(/^หลังบ้านประมูล(\d+)$/);
  return m ? parseInt(m[1],10) : null;
}

/** ให้แน่ใจว่า chain ถูกเรียง “จากบนลงล่าง”: ROOT → 2 → 3 → ...
 *  - ถ้า 2 ไม่มี → สร้างใต้ ROOT
 *  - ถ้า 3 ไม่มี → สร้างใต้ 2 ... ต่อไป
 *  - ทุกอันจะถูก setPosition ให้อยู่ "ถัดลงมา" จากตัวก่อนหน้า
 *  - คืน id ของหมวด "แรกที่ยังไม่เต็ม" ถ้าระบุ wantSlot=true
 */
async function ensureBackofficeChain(guild, { wantSlot=false } = {}) {
  const root = getCategoryByExactName(guild, BACKOFFICE_ROOT_NAME)
            || guild.channels.cache.find(ch => isCategory(ch) && ch.name === BACKOFFICE_ROOT_NAME)
            || null;
  if (!root) throw new Error(`ไม่พบหมวด "${BACKOFFICE_ROOT_NAME}"`);

  let lastCat = root;

  // เดินตั้งแต่ 2 → BACKOFFICE_MAX_N (เช่น 4)
  for (let n = BACKOFFICE_START_N; n <= BACKOFFICE_MAX_N; n++) {
    const name = `${BACKOFFICE_BASE_NAME}${n}`;
    let cat = getCategoryByExactName(guild, name);

    if (!cat) {
      // ถ้าหาไม่เจอ ให้สร้างเฉพาะในกรอบ 2..MAX เท่านั้น
      cat = await guild.channels.create({ name, type: 4 }).catch(() => null);
      if (!cat) throw new Error(`create category "${name}" failed`);
      try { await cat.setPosition((lastCat.rawPosition ?? lastCat.position ?? 0) + 1); } catch {}
    } else {
      // จัดตำแหน่งต่อท้ายอันก่อนหน้า
      try {
        const should = (lastCat.rawPosition ?? lastCat.position ?? 0) + 1;
        if ((cat.rawPosition ?? cat.position ?? 0) < should) {
          await cat.setPosition(should);
        }
      } catch {}
    }

    if (wantSlot) {
      const used = countChildren(guild, cat.id);
      if (used < CATEGORY_MAX_CHANNELS) return cat.id;
    }

    lastCat = cat;
  }

  // ไม่มีช่องว่างในกรอบ 2..MAX
  return null;
}

async function findOrCreateBackofficeSlot(guild) {
  // เรียง/สร้างเฉพาะ 2..MAX แล้วคืน "ตัวแรกที่ยังไม่เต็ม"
  const slotId = await ensureBackofficeChain(guild, { wantSlot: true });
  if (slotId) return slotId;

  // ⛔ เต็มทั้ง 2..MAX แล้ว — ห้ามสร้าง "หลังบ้านประมูล5+" เด็ดขาด
  return null;
}


/** ลบทุกหมวด "หลังบ้านประมูลN" ที่ไม่มีห้องภายใน (N>=2) */
async function deleteEmptyBackofficeCategories(guild) {
  const cats = guild.channels.cache.filter(ch => isCategory(ch) && /^หลังบ้านประมูล\d+$/.test(ch.name));
  for (const cat of cats.values()) {
    if (countChildren(guild, cat.id) === 0) {
      try { await cat.delete("auto-clean empty backoffice category"); } catch {}
    }
  }
}

/** Rebalance: ถ้า N ไม่เต็มและ N+1 มีห้อง → ย้าย “ห้องบนสุด” จาก N+1 → N (จนกว่า N จะเต็ม หรือ N+1 จะว่าง) */
async function rebalanceBackofficeChain(guild) {
  // เรียง ROOT→2→3→… (แน่ใจว่า chain อยู่ในลำดับ)
  await ensureBackofficeChain(guild);

  // สร้างรายการหมวดเรียง N
  const chain = guild.channels.cache
    .filter(ch => isCategory(ch) && (ch.name === BACKOFFICE_ROOT_NAME || /^หลังบ้านประมูล\d+$/.test(ch.name)))
    .map(ch => ({ ch, n: ch.name === BACKOFFICE_ROOT_NAME ? 1 : parseBackofficeN(ch.name) }))
    .filter(x => Number.isFinite(x.n))
    .sort((a,b) => a.n - b.n);

  // เดินทุกคู่ (N, N+1)
  for (let i = 0; i < chain.length - 1; i++) {
    const cur = chain[i];
    const nxt = chain[i+1];
    if (cur.n < BACKOFFICE_START_N) continue; // ไม่ยุ่งกับ ROOT

    let usedCur = countChildren(guild, cur.ch.id);
    let usedNxt = countChildren(guild, nxt.ch.id);

    while (usedCur < CATEGORY_MAX_CHANNELS && usedNxt > 0) {
      // ดึง "ห้องบนสุด" ของ N+1 (ตำแหน่งบนสุดในหมวดนั้น)
      const top = childrenOf(guild, nxt.ch.id).at(0);
      if (!top) break;
      try {
        await top.setParent(cur.ch.id, { lockPermissions: false }); // ย้ายหมวด
        // วางไว้ด้านล่างสุดของหมวด N (Discord จะต่อท้ายเอง)
      } catch {}
      usedCur++;
      usedNxt--;
    }
  }

  // ลบหมวดว่างหลังรีบาลานซ์
  await deleteEmptyBackofficeCategories(guild);
}







// ===== STATE =====
const imageCollectorState = new Map();
const restrictedChannels = new Set();

// ===== CONFIG =====
const PUBLIC_CATEGORY_ID  = "1375026841114509332"; // หมวดหมู่ public (ห้องเปิดประมูล)
const PRIVATE_CATEGORY_ID = "1412976647736524830"; // หมวดห้องส่วนตัว (ห้องรับงาน)
const PER_DAY_CAPACITY    = 10;

// ✅ ที่เก็บ "ฐานข้อมูลรูป/permaLink" (server/room ปลายทาง)
const PERMA_GUILD_ID   = "1401622759582466229"; // server (guild) ปลายทาง
const PERMA_CHANNEL_ID = "1413522411025862799"; // room (channel) ปลายทาง

// ✅ ห้องที่ต้องอัปเดตแพแนลเสมอ
const BOOKING_PANEL_CHANNEL_ID = "1376381836456103946";

// ✅ ไอดีแอดมินที่ต้องถูกแท็กเมื่อแจ้งปิดห้อง
const ADMIN_CLOSE_NOTIFY_ID = "849964668177088562";


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
// เปิดห้องจริงรอบ 19:00 ของแต่ละวัน → ถ้าจองหลัง 19:00 ให้เลื่อนไปเริ่มนับวันถัดไป
function estimateDateByQueueSize(pendingCount, perDay = PER_DAY_CAPACITY, opts = {}) {
  const { cutoffHour = 19 } = opts; // เวลาเปิดประจำวัน (ไทย)
  const now = new Date();

  // จุดตัดของ "วันนี้" เวลา 19:00
  const cutoff = new Date(now);
  cutoff.setHours(cutoffHour, 0, 0, 0);

  // ถ้าเลย 19:00 แล้ว ถือว่าเริ่มนับคิวตั้งแต่ "พรุ่งนี้"
  const baseDay = now.getTime() >= cutoff.getTime() ? 1 : 0;

  // จำนวนวันที่ต้องรอตามคิว (วันละ perDay ห้อง)
  const dayFromQueue = Math.floor(pendingCount / perDay);

  const est = new Date(cutoff);
  est.setDate(est.getDate() + baseDay + dayFromQueue);
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

// ====== Booking Panel ======
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
      `**มีคนจองประมูลอยู่: ${pendingCount} คน**`,
      `**หากจองตอนนี้จะลงประมาณวันที่ ${etaText}**`,
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
  // ผูกกับรอบเปิดจริง 19:00
  const etaDate = estimateDateByQueueSize(pendingCount, PER_DAY_CAPACITY, { cutoffHour: 19 });
  return { pendingCount, latestPostedCount, etaDate };
}

async function getQueueStatsOnce() {
  const snap = await admin.firestore().collection('auction_records').get();
  return computeStatsFromSnapshotDocs(snap.docs);
}

async function updateAllBookingPanels(stats) {
  // อัปเดตทุก panel ที่เคยสร้างด้วย !room (ถ้ายังมีอยู่)
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

  // ✅ อัปเดต/สร้าง panel ในห้องเป้าหมาย BOOKING_PANEL_CHANNEL_ID
  await updateOrCreatePanelInChannel(BOOKING_PANEL_CHANNEL_ID, stats);
}

/** หา embed ชื่อ "จองห้องประมูล" ในห้อง target แล้วแก้ไข ถ้าไม่เจอให้สร้างใหม่ */
async function updateOrCreatePanelInChannel(channelId, stats) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased?.()) return;

    // หา message ของบอทที่มี embed title = "จองห้องประมูล"
    const messages = await channel.messages.fetch({ limit: 50 });
    const target = messages.find(m =>
      m.author?.id === client.user.id &&
      m.embeds?.some(e => (e.title || "") === "จองห้องประมูล")
    );

    const payload = { embeds: [buildBookingEmbed(stats)], components: [buildBookingRow()] };
    if (target) {
      await target.edit(payload);
    } else {
      await channel.send(payload);
    }
  } catch (err) {
    console.warn("updateOrCreatePanelInChannel error:", err.message);
  }
}

// ===== Fallback summary =====
async function sendFallbackSummary(channel, summary, userId) {
  await channel.send({ content: summary });
  imageCollectorState.delete(userId);
}

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

// ===== Ready / Live update =====
client.once("ready", async () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);

  // Live update: เมื่อมีการเปลี่ยนแปลงใน auction_records ให้แก้ไขแพแนลห้องเป้าหมาย
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

  // อัปเดต/สร้าง panel ในห้องเป้าหมายครั้งแรกตอน ready
  try {
    const stats = await getQueueStatsOnce();
    await updateOrCreatePanelInChannel(BOOKING_PANEL_CHANNEL_ID, stats);
  } catch {}
});

// ===== Interaction =====
client.on(Events.InteractionCreate, async (interaction) => {
  // ปิดห้อง public (ถ้ามี)
  if (interaction.isButton() && interaction.customId.startsWith("close_public_")) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      await interaction.deferReply({ ephemeral: true });
      return interaction.editReply({ content: "❌ คุณไม่มีสิทธิ์ปิดห้องนี้" });
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: "🗑️ ลบห้องเรียบร้อย..." });
    await interaction.channel.delete().catch(() => {});
    return;
  }

  const guild = interaction.guild;

  if (interaction.isButton()) {
    // เปิดห้องส่วนตัว (ห้องรับรอง)
   if (interaction.customId === "open_room") {
  await interaction.deferReply({ ephemeral: true });
  try {
    const parentId = await findOrCreateBackofficeSlot(interaction.guild);

    // ⛔ เต็มทั้ง หลังบ้านประมูล2–4 → ไม่สร้างห้อง และแจ้งผู้ใช้
    if (!parentId) {
      await interaction.editReply({
        content: "❌ ขณะนี้หมวด **หลังบ้านประมูล2–4** เต็มทั้งหมดแล้ว (งดสร้างหมวดใหม่) กรุณารอแอดมินเคลียร์คิวหรือย้ายห้องก่อนนะครับ",
      });
      return;
    }

    // ===== เดิม: นับครั้ง + สร้างห้อง =====
    const counterRef = admin.firestore().collection("auction_counters").doc("counter");
    const counterSnap = await counterRef.get();
    let latestCount = 0;
    if (counterSnap.exists) latestCount = counterSnap.data().latestCount || 0;

    const nextCount = latestCount + 1;
    await counterRef.set({ latestCount: nextCount });

    const baseName   = `ครั้งที่-${nextCount}`;
    const channelName = `${baseName}-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-zA-Z0-9ก-๙\-]/g, "");

    await interaction.editReply({ content: `✅ สร้างห้องส่วนตัวของคุณแล้ว` });

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
      new ButtonBuilder().setCustomId("notify_admin_close").setLabel("แจ้งแอดมินปิดห้อง").setStyle(ButtonStyle.Primary),
    );

    await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [adminRow] });
  } catch (err) {
    await interaction.editReply({ content: "❌ สร้างห้องส่วนตัวไม่สำเร็จ" });
  }
}



    // ✅ ปุ่ม "แจ้งแอดมินปิดห้อง" ในห้องรับรอง
    if (interaction.customId === "notify_admin_close") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const notifyText = `**<@${ADMIN_CLOSE_NOTIFY_ID}> คุณ <@${interaction.user.id}> จะปิดห้องอ้ายว่าไง**`;
        await interaction.channel.send({ content: notifyText });
        await interaction.editReply({ content: "✅ แจ้งแอดมินให้ปิดห้องเรียบร้อยแล้ว" });
      } catch (err) {
        await interaction.editReply({ content: "❌ แจ้งแอดมินไม่สำเร็จ" });
      }
    }

    // ปิดห้องส่วนตัว
   if (interaction.customId === "close_channel") {
  await interaction.deferReply({ ephemeral: true });
  const member = await guild.members.fetch(interaction.user.id);
  if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.editReply({ content: "❌ คุณไม่มีสิทธิ์ปิดห้องนี้" });
  }
  await interaction.editReply({ content: "🗑️ ลบห้องเรียบร้อย..." });
  const channelId = interaction.channel.id;
  await admin.firestore().collection("auction_records").doc(channelId).delete().catch(console.warn);
  await interaction.channel.delete().catch(() => {});
  // ✅ เรียกรีบาลานซ์หลังลบ
  try { await rebalanceBackofficeChain(guild); } catch {}
}


    // เปิด modal กรอกข้อมูล
    // ...เดิม...
if (interaction.customId === "fill_info") {
  const modal = new ModalBuilder().setCustomId("auction_form").setTitle("📋 กรอกข้อมูลการประมูล");

  modal.addComponents(
    new ModalRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("start_price")
        .setLabel("💰 ยอดเริ่มต้น (บาท)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("เช่น 100 (ตัวเลขเท่านั้น และต้องห้ามต่ำกว่า 50)")
    ),
    new ModalRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("bid_step")
        .setLabel("🔼 บิดครั้งละ (บาท)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("เช่น 10")
    ),
    new ModalRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("target_price")
        .setLabel("🎯 ยอดที่ตั้งไว้ (บาท)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("เช่น 500")
    ),
    new ModalRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("prize").setLabel("🎁 สิ่งที่จะได้").setStyle(TextInputStyle.Paragraph).setRequired(true),
    ),
    new ModalRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("rules").setLabel("📜 กฎ").setStyle(TextInputStyle.Paragraph).setRequired(true),
    ),
  );

  return interaction.showModal(modal);
}


    // ===== ส่งข้อมูล → เปิดห้อง public "เฉพาะงานของห้องนี้" (ADMIN ONLY) =====
    if (interaction.customId === "submit_info") {
      // ⛔ อนุญาตเฉพาะแอดมิน/ผู้มีสิทธิ์จัดการช่อง
      const member = await guild.members.fetch(interaction.user.id);
      const isAdmin =
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageChannels);

      if (!isAdmin) {
        return interaction.reply({
          content: "❌ ปุ่มนี้ใช้ได้เฉพาะแอดมินเท่านั้น",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const channelId = interaction.channel.id;
        const baseName = interaction.channel.name.split("-").slice(0, 2).join("-");
        const docRef = admin.firestore().collection("auction_records").doc(channelId);
        const docSnap = await docRef.get();

        // สรุปที่จะใช้เปิด public:
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
          permaLink = null; // ยังไม่มีรูป
          // ✅ สร้างเอกสารไว้เป็น pending (นับคิว) แม้ไม่มีรูป
          await docRef.set({
            permaLink: null,
            summary: summaryToUse,
            roomName: baseName,
            ownerId: interaction.user.id,
            publicChannelId: null,
          }, { merge: true });
        }

        // doc-like object สำหรับเปิด public
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

    if (interaction.customId === "no_image") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;

        const previewSummary = globalThis.lastFullSummary?.[channelId] || "⚠️ ไม่มีสรุป";

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

        const baseName = interaction.channel.name.split("-").slice(0, 2).join("-");
        const summaryToSave = stripEstimatedDate(previewSummary);
        await admin.firestore().collection("auction_records").doc(channelId).set({
          permaLink: null,
          summary: summaryToSave,
          roomName: baseName,
          ownerId: userId,
          publicChannelId: null,
        }, { merge: true });

        await interaction.editReply({
          content: "📷 บันทึกแบบไม่มีรูปแล้ว (นับรวมในคิว) และแสดงสรุปในห้องนี้เรียบร้อย",
        });

        try {
          const stats = await getQueueStatsOnce();
          await updateAllBookingPanels(stats);
        } catch (e) {}
      } catch (e) {
        try {
          await interaction.editReply({ content: "❌ เกิดข้อผิดพลาดในขั้นตอนไม่มีรูป" });
        } catch {}
      }
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "auction_form") {
  await interaction.deferReply({ ephemeral: true });

  try {
    // ===== เตรียมคอลเลกเตอร์รับ "เฉพาะ" ข้อความ/ไฟล์จากผู้ส่งแบบฟอร์มนี้ =====
    const filter = (m) => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({
      filter,
      time: 30 * 60 * 1000, // 30 นาที
    });

    // เคลียร์สตอร์เรจชั่วคราวของห้อง (ถ้าใช้เก็บสถานะอื่น ๆ)
    await deleteAuctionData(interaction.channel.id);

    // ===== อ่านค่าแบบฟอร์ม =====
    const startPriceRaw = interaction.fields.getTextInputValue("start_price").trim();
    const bidStep       = interaction.fields.getTextInputValue("bid_step").trim();
    const targetPrice   = interaction.fields.getTextInputValue("target_price").trim();
    const prize         = interaction.fields.getTextInputValue("prize").trim();
    const rules         = interaction.fields.getTextInputValue("rules").trim();

    // ===== ตรวจสอบรูปแบบ: ยอดเริ่มต้นต้องเป็น "ตัวเลขล้วน" และ "≥ 50" =====
    if (!/^\d+$/.test(startPriceRaw)) {
      return interaction.editReply({
        content: "❌ **ยอดเริ่มต้น** ต้องกรอกเป็นตัวเลขเท่านั้น (ห้ามมีตัวอักษร/จุดทศนิยม)",
      });
    }
    const startPrice = parseInt(startPriceRaw, 10);
    if (!Number.isFinite(startPrice) || startPrice < 50) {
      return interaction.editReply({
        content: "❌ **ยอดเริ่มต้น** ต้องไม่ต่ำกว่า **50 บาท**",
      });
    }

    // (ถ้าต้องการบังคับเป็นตัวเลขล้วนสำหรับ bidStep/targetPrice ให้ปลดคอมเมนต์สองบรรทัดล่าง)
    // if (!/^\d+$/.test(bidStep))     return interaction.editReply({ content: "❌ **บิดครั้งละ** ต้องเป็นตัวเลขเท่านั้น" });
    // if (!/^\d+$/.test(targetPrice)) return interaction.editReply({ content: "❌ **ยอดที่ตั้งไว้** ต้องเป็นตัวเลขเท่านั้น" });

    // ===== สร้างสรุปตัวอย่าง (ที่มีบรรทัดคาดการณ์) =====
    const channelName = interaction.channel.name;
    const title = `# ${channelName.replace(/-/g, " ")}`;

    const statsNow = await getQueueStatsOnce();
    const estDate  = estimateDateByQueueSize(
      statsNow.pendingCount,
      PER_DAY_CAPACITY,
      { cutoffHour: 19 } // เปิดรอบจริง 19:00
    );
    const estThai  = formatThaiDate(estDate);

    const fullSummary = `${title}

## เริ่มต้นที่ราคา : ${startPrice} บาท
## บิดครั้งละ : ${bidStep} บาท
## ยอดที่ตั้งไว้ : ${targetPrice} บาท
## สิ่งที่จะได้ : ${prize}
## กฎ : ${rules}
## ปิดเวลา 19:00 น.
## วันที่ : รอคิวก่อน
## ลงประมูลประมาณวันที่ ${estThai}
## ล่าสุดที่ลง : ครั้งที่-${statsNow.latestPostedCount || 0}
||@everyone||`;

    // เก็บสรุปล่าสุดไว้ในหน่วยความจำ (ต่อห้อง) เผื่อใช้ fallback/no_image
    if (!globalThis.lastFullSummary) globalThis.lastFullSummary = {};
    globalThis.lastFullSummary[interaction.channel.id] = fullSummary;

    // ===== แจ้งให้ผู้ใช้ส่งรูป / หรือกด "ไม่มีรูป" =====
    const imagePrompt = new EmbedBuilder()
      .setTitle("📷 กรุณาส่งรูปภาพ")
      .setDescription("🔽 ส่ง **รูปภาพสินค้า** ด้านล่าง หรือกดปุ่มด้านล่างถ้าไม่มีรูป")
      .setColor(0x3498db);

    const noImageRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("no_image")
        .setLabel("📷 ไม่มีรูปภาพ")
        .setStyle(ButtonStyle.Secondary),
    );

    // โชว์สรุป (มีบรรทัดคาดการณ์) ให้ลูกค้าเห็นในห้องนี้ทันที
    await interaction.channel.send({
      content: `<@${interaction.user.id}>\n\n${fullSummary}`,
      embeds: [imagePrompt],
      components: [noImageRow],
    });

    await interaction.editReply({
      content: "✅ ข้อมูลได้รับแล้ว! แสดงผลในห้องเรียบร้อย กรุณาส่งรูปภาพถ้ามี",
    });

    // ===== เก็บรูปภาพจากผู้ใช้ =====
    collector.on("collect", async (msg) => {
      // รับเฉพาะไฟล์ "รูปภาพ"
      const isImage =
        msg.attachments.size > 0 &&
        [...msg.attachments.values()].every((file) =>
          file.contentType?.startsWith("image/")
        );

      if (!isImage) {
        try {
          await msg.delete();
          await msg.channel.send({
            content: `❌ <@${msg.author.id}> โปรดส่ง **เฉพาะรูปภาพ** เท่านั้น`,
          });
        } catch (err) {
          console.warn("ลบข้อความไม่ได้:", err.message);
        }
        return;
      }

      // ลบภาพเก่าที่เก็บไว้ (ถ้ามี) เพื่อให้คงล่าสุดเสมอ
      if (imageCollectorState.has(msg.author.id)) {
        const oldMsg = imageCollectorState.get(msg.author.id);
        try {
          await oldMsg.delete();
        } catch (err) {
          console.warn("ลบภาพเก่าไม่สำเร็จ");
        }
      }
      imageCollectorState.set(msg.author.id, msg);

      // ลบข้อความบอทที่ไม่ใช่ embed หลัก "📋 กรอกข้อมูลได้เลยย" เพื่อลดความรก
      const messages = await msg.channel.messages.fetch({ limit: 100 });
      const botMessages = messages.filter(
        (m) =>
          m.author.id === client.user.id &&
          !m.embeds.some((e) => e.title === "📋 กรอกข้อมูลได้เลยย")
      );
      for (const m of botMessages.values()) {
        try {
          await m.delete();
        } catch (err) {}
      }

      // ส่ง "พรีวิวสรุป + รูป" ในห้องปัจจุบัน (ยังคงมีบรรทัดคาดการณ์ให้ลูกค้าเห็น)
      await msg.channel.send({
        content: fullSummary,
        files: [...msg.attachments.values()].map((a) => a.url),
      });

      try {
        await msg.react("✅");
        await msg.delete();
      } catch (err) {}

      // ===== ส่งภาพไปห้องถาวร (perma) เพื่อสร้าง permaLink =====
      const permaChannel = await client.channels.fetch(PERMA_CHANNEL_ID);

      const permaMsg = await permaChannel.send({
        content: `<#${msg.channel.id}>`,
        files: [...msg.attachments.values()].map((a) => a.url),
      });

      const currentName = interaction.channel.name;
      const baseName = currentName.split("-").slice(0, 2).join("-");
      const permaLink = `https://discord.com/channels/${PERMA_GUILD_ID}/${PERMA_CHANNEL_ID}/${permaMsg.id}`;
      const timestamp = admin.firestore.Timestamp.now();
      const weekday = timestamp.toDate().toLocaleDateString("en-US", {
        weekday: "long",
      });

      // ===== บันทึก Firestore: ล้าง "บรรทัดคาดการณ์" ออกก่อนเซฟ =====
      const summaryToSave = stripEstimatedDate(fullSummary);

      await admin
        .firestore()
        .collection("auction_records")
        .doc(msg.channel.id)
        .set(
          {
            permaLink,
            summary: summaryToSave,
            date: timestamp,
            weekday,
            roomName: baseName,
            ownerId: interaction.user.id,
            publicChannelId: null, // ยังไม่เปิด public จนกด "ส่งข้อมูล"
          },
          { merge: true }
        );

      // อัปเดตแผงจอง (คิวเพิ่ม)
      try {
        const stats = await getQueueStatsOnce();
        await updateAllBookingPanels(stats);
      } catch (e) {}

      // ปิดคอลเลกเตอร์หลังได้รูปแล้ว
      collector.stop();
    });

    // เมื่อหมดเวลา หรือไม่มีการส่งรูป → โยนสรุป fallback (แต่ยังไม่บันทึกคิวจนกว่าจะกด "ไม่มีรูป")
    collector.on("end", async () => {
      if (!imageCollectorState.has(interaction.user.id)) {
        await sendFallbackSummary(
          interaction.channel,
          fullSummary,
          interaction.user.id
        );
        // หมายเหตุ: ถ้าผู้ใช้จะบันทึกแบบไม่มีรูป ให้กดปุ่ม "ไม่มีรูป" (no_image)
      }
    });
  } catch (err) {
    console.error("auction_form handler error:", err);
    try {
      await interaction.editReply({
        content: "❌ เกิดข้อผิดพลาดขณะประมวลผลฟอร์ม",
      });
    } catch {}
  }
}
});
client.login(process.env.token);

