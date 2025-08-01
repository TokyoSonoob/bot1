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
require("./money")(client);
require("./skin")(client);
require("./send")(client);
require("./pamoon")(client);
const imageCollectorState = new Map();
const restrictedChannels = new Set();
async function getAttachmentsFromPermaLink(permaLink) {
  const match = permaLink.match(
    /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/
  );
  if (!match) return [];

  const [, , channelId, messageId] = match;

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    {
      headers: {
        Authorization: `Bot ${TOKEN}`,
      },
    }
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

  // เพิ่มวันพรุ่งนี้แทน "## วันที่ : รอคิวก่อน"
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const formattedDate = tomorrow.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const finalSummary = summary.replace(
    "## วันที่ : รอคิวก่อน",
    `## วันที่ : ${formattedDate}`,
  );

  // โหลดภาพจาก permaLink ถ้ามี
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

  // สร้างห้องใหม่ในหมวดหมู่ public
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
        id: guild.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
    ],
  });

  // ส่งข้อความสรุปพร้อมรูป (ถ้ามี)
  await publicChannel.send({
    content: finalSummary,
    files: imageFiles.length > 0 ? imageFiles : undefined,
  });

  // ส่งปุ่ม "ปิดห้อง"
  const adminRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_public_${publicChannel.id}`)
      .setLabel("🔴 ปิดห้อง")
      .setStyle(ButtonStyle.Danger),
  );

  await publicChannel.send({
    content: " ",
    components: [adminRow],
  });

  // บันทึก ID ห้องสาธารณะกลับเข้า Firestore
  await admin.firestore().collection("auction_records").doc(doc.id).update({
    publicChannelId: publicChannel.id,
  });

  console.log(`✅ ส่งข้อมูลไปยังห้อง ${channelName} และเซฟ publicChannelId แล้ว`);
}

async function sendAuctionSummariesBatch(guild, maxRooms = 5) {
  const parentId = "1375026841114509332"; // หมวดหมู่ public

  // ตรวจสอบจำนวนห้องในหมวดหมู่
  const existingChannels = guild.channels.cache.filter(
    (ch) => ch.parentId === parentId
  );
  if (existingChannels.size >= maxRooms) {
    console.log(`⚠️ มีห้องในหมวด public ถึงจำนวนสูงสุด (${maxRooms}) แล้ว`);
    return;
  }

  // ดึงข้อมูลที่ยังไม่ได้ส่ง publicChannel
  const snapshot = await admin.firestore().collection("auction_records")
    .where("publicChannelId", "==", null)
    .orderBy("date", "asc")
    .get();

  if (snapshot.empty) {
    console.log("⚠️ ไม่มีข้อมูลประมูลที่ยังไม่ได้สร้างห้อง");
    return;
  }

  const dateCount = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // แปลง Timestamp Firestore เป็น yyyy-mm-dd
    const date = data.date?.toDate?.();
    if (!date) continue;
    const dateKey = date.toISOString().split("T")[0];

    if (!dateCount[dateKey]) dateCount[dateKey] = 0;
    if (dateCount[dateKey] >= 5) continue; // ข้ามถ้าเกิน 5 คนในวันเดียวกัน

    if (
      guild.channels.cache.filter(ch => ch.parentId === parentId).size >= maxRooms
    ) {
      console.log(`⚠️ ห้องในหมวด public ถึงจำนวนสูงสุด (${maxRooms}) แล้ว`);
      break;
    }

    await sendAuctionSummary(guild, doc, parentId);
    dateCount[dateKey]++;
  }
}





const scheduleAutoPost = () => {
  setInterval(async () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const day = now.getDay();

    const isTargetDay = [1, 3, 5].includes(day);
    const isTargetTime = hours === 19 && minutes === 0;

    if (!isTargetDay || !isTargetTime) return;

    try {
      const guild = client.guilds.cache.first();
      if (!guild) {
        console.warn("❌ ไม่พบ guild ที่บอทอยู่");
        return;
      }

      const categoryId = "1375026841114509332";
      const category = await guild.channels.fetch(categoryId);
      if (!category) {
        console.warn("❌ ไม่พบหมวดหมู่ public");
        return;
      }

      const channelsInCategory = guild.channels.cache.filter(
        (c) => c.parentId === categoryId && c.type === 0
      );

      // ดึงข้อมูลที่ publicChannelId === null ทั้งหมด และเรียงจากล่าสุดไปเก่าสุด
      const snapshot = await admin.firestore().collection("auction_records")
        .where("publicChannelId", "==", null)
        .orderBy("date", "desc")
        .get();

      if (snapshot.empty) {
        console.log("✅ ไม่มีข้อมูลรอส่ง public แล้ว");
        return;
      }

      // ดึงเอกสารมาเป็น array แล้วเรียงตามตัวเลขจากชื่อ roomName เช่น "ครั้งที่-12"
      const docsSorted = snapshot.docs
        .map(doc => {
          const data = doc.data();
          const match = data.roomName?.match(/ครั้งที่-(\d+)/);
          const count = match ? parseInt(match[1]) : Infinity;
          return { doc, count };
        })
        .filter(d => d.count !== Infinity)
        .sort((a, b) => a.count - b.count);

      if (docsSorted.length === 0) {
        console.log("⚠️ ไม่มีข้อมูลที่มี roomName ถูกต้อง");
        return;
      }

      // Loop ส่งทีละรายการ โดยหยุดถ้าในหมวดหมู่เต็ม 7 ห้องแล้ว
      for (const item of docsSorted) {
  if (channelsInCategory.size >= 7) {
    console.log(`⚠️ มีห้องในหมวดหมู่ ${categoryId} เกิน 7 ห้องแล้ว งดส่งข้อมูลเพิ่ม`);
    break;
  }
        const doc = item.doc;
        const data = doc.data();

        // ส่งข้อมูลโดยใช้ sendAuctionSummary และส่ง userId เป็น ownerId หรือ fallback
        const fakeUserId = data.ownerId || client.user.id;

        // ส่ง
         await sendAuctionSummary(guild, item.doc, categoryId);

        // อัปเดต channelsInCategory ให้รู้ว่ามีห้องเพิ่มขึ้น (ต้อง fetch ใหม่ หรือจำลอง)
         channelsInCategory.set(item.doc.id, { id: item.doc.id });
      }

    } catch (err) {
      console.error("❌ ส่งข้อมูลอัตโนมัติล้มเหลว:", err);
    }
  }, 60 * 1000); // ตรวจสอบทุก 1 นาที
};



client.once("ready", () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
  scheduleAutoPost();
});

async function sendFallbackSummary(channel, summary, userId) {
  await channel.send({ content: summary });
  imageCollectorState.delete(userId);
}

const { getLastBid, setLastBid } = require("./storage");
client.on("messageCreate", async (message) => {
  if (message.content === '!room') {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return;
    }

    await message.delete().catch(console.error);

    const embed = new EmbedBuilder()
      .setTitle('・จองห้อง・')
      .setDescription('เปิดตั๋วเพื่อจองห้อง')
      .setColor(0x9b59b6)
      .setImage('https://media.tenor.com/S4MdyoCR3scAAAAM/oblakao.gif')
      .setFooter({ text: "Make by Purple Shop" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_room')
        .setLabel('🛎️ จองประมูล')
        .setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }
});


client.on(Events.InteractionCreate, async (interaction) => {
  if (
    interaction.isButton() &&
    interaction.customId.startsWith("close_public_")
  ) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: "❌ คุณไม่มีสิทธิ์ปิดห้องนี้",
        flags: 1 << 6,
      });
    }
    await interaction.reply({
      content: "🗑️ ลบห้องเรียบร้อย...",
      flags: 1 << 6,
    });
    await interaction.channel.delete();
  }

  const guild = interaction.guild;
  const user = interaction.user;

  if (interaction.isButton()) {
    if (interaction.customId === "open_room") {
      const parentId = "1387466735619412030";
      const counterRef = admin
        .firestore()
        .collection("auction_counters")
        .doc("counter");
      const counterSnap = await counterRef.get();
      let latestCount = 0;

      if (counterSnap.exists) {
        latestCount = counterSnap.data().latestCount || 0;
      }

      const nextCount = latestCount + 1;
      await counterRef.set({ latestCount: nextCount });

      // 📛 สร้างชื่อห้อง
      const baseName = `ครั้งที่-${nextCount}`;
      const channelName = `${baseName}-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-zA-Z0-9ก-๙\-]/g, "");

      await interaction.reply({
        content: `✅ สร้างห้องส่วนตัวของคุณแล้ว`,
        flags: 1 << 6,
      });
      
      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: 0,
        parent: parentId,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
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

      // ✅ ส่ง Embed + ปุ่ม
      const embed = new EmbedBuilder()
        .setTitle("📋 กรอกข้อมูลได้เลยย")
        .setDescription("กรุณากรอกข้อมูลให้ครบถ้วนตามที่ระบบกำหนด")
        .setColor(0x9b59b6);

      const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_channel")
          .setLabel("🔴 ปิดห้อง")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("fill_info")
          .setLabel("🟡 กรอกข้อมูล")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("submit_info")
          .setLabel("🟢 ส่งข้อมูล")
          .setStyle(ButtonStyle.Success),
      );

      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [embed],
        components: [adminRow],
      });
    }

    if (interaction.customId === "close_channel") {
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({
          content: "❌ คุณไม่มีสิทธิ์ปิดห้องนี้",
          flags: 1 << 6,
        });
      }
      await interaction.reply({
        content: "🗑️ ลบห้องเรียบร้อย...",
        flags: 1 << 6,
      });
      const channelId = interaction.channel.id;
      await admin.firestore().collection("auction_records").doc(channelId).delete().catch(console.warn);
      await interaction.channel.delete();
    }

    if (interaction.customId === "fill_info") {
      const modal = new ModalBuilder()
        .setCustomId("auction_form")
        .setTitle("📋 กรอกข้อมูลการประมูล");

      modal.addComponents(
        new ModalRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("start_price")
            .setLabel("💰 ยอดเริ่มต้น (บาท)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("bid_step")
            .setLabel("🔼 บิดครั้งละ (บาท)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("target_price")
            .setLabel("🎯 ยอดที่ตั้งไว้ (บาท)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("prize")
            .setLabel("🎁 สิ่งที่จะได้")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
        new ModalRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("rules")
            .setLabel("📜 กฎ")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      );

      await interaction.showModal(modal);
    }


  if (!interaction.isButton()) return;

if (interaction.customId === "submit_info") {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);

    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return await interaction.editReply({
        content: "❌ คุณไม่มีสิทธิ์ส่งข้อมูลนี้",
      });
    }

    const parentId = "1375026841114509332";

    // ดึงข้อมูล auction_records ที่ยังไม่มี publicChannelId ตัวแรก (หรือที่คุณต้องการ)
    const snapshot = await admin.firestore().collection("auction_records")
      .where("publicChannelId", "==", null)
      .orderBy("date", "asc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return await interaction.editReply({
        content: "⚠️ ไม่มีข้อมูลประมูลที่ยังไม่ได้สร้างห้อง",
      });
    }

    const doc = snapshot.docs[0];

    // เรียกฟังก์ชันส่งข้อมูลอัตโนมัติ
    await sendAuctionSummary(guild, doc, parentId);

    await interaction.editReply({
      content: `✅ ข้อมูลถูกแชร์ไปยังห้องประมูลใหม่`,
    });

  } catch (error) {
    console.error("❌ Error submit_info:", error);
    await interaction.editReply({
      content: "❌ เกิดข้อผิดพลาดขณะส่งข้อมูล โปรดลองใหม่อีกครั้ง",
    });
  }
}




    if (interaction.customId === "no_image") {
      const userId = interaction.user.id;
      const channelId = interaction.channel.id;

      // 🔁 ดึง summary ล่าสุดจาก modal หรือ fallback
      const summary = globalThis.lastFullSummary?.[channelId] || "⚠️ ไม่มีสรุป";

      // ✅ เซฟ summary ลง Firestore โดยไม่ต้องมี image
      const timestamp = admin.firestore.Timestamp.now();
const dateObj = timestamp.toDate();
const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long" }); // เช่น Monday
const currentName = interaction.channel.name;
const baseName = currentName.split("-").slice(0, 2).join("-"); // เช่น 'ครั้งที่-11'
const channelName = baseName;

await admin.firestore().collection("auction_records").doc(channelId).set({
  summary,
  date: timestamp,
  weekday,
  roomName: channelName,
  ownerId: interaction.user.id,
  publicChannelId: null,
});


      // ✅ ลบภาพเก่าที่เคยอัปโหลด
      if (imageCollectorState.has(userId)) {
        const oldMsg = imageCollectorState.get(userId);
        try {
          await oldMsg.delete();
        } catch {}
        imageCollectorState.delete(userId);
      }

      // ✅ ลบข้อความ bot เก่าที่ยังไม่ใช่ embed หลัก
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter(
        (m) =>
          m.author.id === client.user.id &&
          !m.embeds.some((e) => e.title === "📋 กรอกข้อมูลได้เลยย"),
      );
      for (const m of toDelete.values()) {
        try {
          await m.delete();
        } catch {}
      }

      // ✅ ส่ง fallback summary เพื่อแสดงข้อมูล
      if (!imageCollectorState.has(userId)) {
        try {
          const msg = await interaction.channel.send({ content: summary });
          imageCollectorState.set(userId, msg); // บันทึกไว้กันส่งซ้ำ
        } catch (err) {
          console.warn("❌ ส่ง fallback summary ไม่สำเร็จ:", err.message);
        }
      }

      // ✅ แจ้งเตือนในแบบ ephemeral (เห็นคนเดียว)
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "📷 ระบบรับทราบว่าไม่มีรูปภาพแนบ และได้บันทึกข้อมูลแล้ว",
          flags: 1 << 6, // ephemeral
        });
      } else {
        await interaction.followUp({
          content: "📷 สรุปถูกบันทึกเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "auction_form") {
  const filter = (m) => m.author.id === interaction.user.id;
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 30 * 60 * 1000,
  });

  // 👇 ลบข้อมูลเก่าก่อนบันทึกใหม่
  await deleteAuctionData(interaction.channel.id);
    const startPrice = interaction.fields.getTextInputValue("start_price");
    const bidStep = interaction.fields.getTextInputValue("bid_step");
    const targetPrice = interaction.fields.getTextInputValue("target_price");
    const prize = interaction.fields.getTextInputValue("prize");
    const rules = interaction.fields.getTextInputValue("rules");

    const channelName = interaction.channel.name;
    const title = `# ${channelName.replace(/-/g, " ")}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = tomorrow.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const fullSummary = `${title}

## เริ่มต้นที่ราคา : ${startPrice} บาท
## บิดครั้งละ : ${bidStep} บาท
## ยอดที่ตั้งไว้ : ${targetPrice} บาท
## สิ่งที่จะได้ : ${prize}
## กฎ : ${rules}
## ปิดเวลา 20:00 น.
## วันที่ : รอคิวก่อน
||@everyone||`;

    if (!globalThis.lastFullSummary) globalThis.lastFullSummary = {};
    globalThis.lastFullSummary[interaction.channel.id] = fullSummary;

    const imagePrompt = new EmbedBuilder()
      .setTitle("📷 กรุณาส่งรูปภาพ")
      .setDescription(
        "🔽 ส่ง **รูปภาพสินค้า** ด้านล่าง หรือกดปุ่มด้านล่างถ้าไม่มีรูป",
      )
      .setColor(0x3498db);

    const noImageRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("no_image")
        .setLabel("📷 ไม่มีรูปภาพ")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.channel.send({
      content: `<@${interaction.user.id}>\n\n${fullSummary}`,
      embeds: [imagePrompt],
      components: [noImageRow],
    });

    await interaction.reply({
      content: "✅ ข้อมูลได้รับแล้ว! แสดงผลในห้องเรียบร้อย กรุณาส่งรูปภาพถ้ามี",
      flags: 1 << 6,
    });

collector.on("collect", async (msg) => {
  const isImage =
    msg.attachments.size > 0 &&
    [...msg.attachments.values()].every((file) =>
      file.contentType?.startsWith("image/"),
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

  // ลบภาพเก่าถ้ามี
  if (imageCollectorState.has(msg.author.id)) {
    const oldMsg = imageCollectorState.get(msg.author.id);
    try {
      await oldMsg.delete();
    } catch (err) {
      console.warn("ลบภาพเก่าไม่สำเร็จ");
    }
  }
  imageCollectorState.set(msg.author.id, msg);

  // ลบข้อความที่ไม่ใช่ embed หลัก
  const messages = await msg.channel.messages.fetch({ limit: 100 });
  const botMessages = messages.filter(
    (m) =>
      m.author.id === client.user.id &&
      !m.embeds.some((e) => e.title === "📋 กรอกข้อมูลได้เลยย"),
  );
  for (const m of botMessages.values()) {
    try {
      await m.delete();
    } catch (err) {
      console.warn("ลบข้อความบอทบางรายการไม่ได้:", err.message);
    }
  }

  // ส่งรูป + สรุปในห้องปัจจุบัน
  await msg.channel.send({
    content: fullSummary,
    files: [...msg.attachments.values()].map((a) => a.url),
  });

  try {
    await msg.react("✅");
    await msg.delete();
  } catch (err) {
    console.warn("⚠️ ส่งข้อความ / react / ลบ ไม่สำเร็จ:", err.message);
  }

  // ส่งภาพไปยังห้องถาวร เพื่อเก็บลิงก์
  const permaChannelId = "1400551163321122836";
  const permaChannel = await client.channels.fetch(permaChannelId);

  const permaMsg = await permaChannel.send({
    content: `<#${msg.channel.id}>`,
    files: [...msg.attachments.values()].map((a) => a.url),
  });
  const currentName = interaction.channel.name;
      const baseName = currentName.split("-").slice(0, 2).join("-"); // เช่น 'ครั้งที่-11'
      const channelName = baseName;
  const permaLink = `https://discord.com/channels/${msg.guild.id}/${permaChannelId}/${permaMsg.id}`;
  const timestamp = admin.firestore.Timestamp.now();
const dateObj = timestamp.toDate();
const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long" }); // ✅ ชื่อวันแบบอังกฤษ


await admin.firestore().collection("auction_records").doc(msg.channel.id).set({
  permaLink,
  summary: fullSummary,
  date: timestamp,
  weekday: weekday,
  roomName: channelName,
  ownerId: interaction.user.id,
  publicChannelId: null,
});



  collector.stop();
});



    collector.on("end", async () => {
      if (!imageCollectorState.has(interaction.user.id)) {
        await sendFallbackSummary(
          interaction.channel,
          fullSummary,
          interaction.user.id,
        );
      }
    });
  }
});
client.login(process.env.token);
