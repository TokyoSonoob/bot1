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

const imageCollectorState = new Map();
const restrictedChannels = new Set();
const LOG_CHANNEL_ID = "YOUR_LOG_CHANNEL_ID"; // 🔧 เปลี่ยนตรงนี้เป็น ID ห้อง log

client.once("ready", () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
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
      const parentId = "1387466735619412030"; // ใส่ Parent ID จริง

      // 🔥 1. ดึงตัวเลขล่าสุดจาก Firebase
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

      // 🏗️ สร้างห้องใหม่
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

      // ✅ บันทึก baseName หลังสร้างห้อง
      await admin.firestore().collection("auctions_meta").doc(channel.id).set({
        baseName: baseName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // ✅ ส่ง Embed + ปุ่ม
      const embed = new EmbedBuilder()
        .setTitle("📋 กรอกข้อมูลได้เลยย")
        .setDescription("<@everyone> กรุณากรอกข้อมูลให้ครบถ้วนตามที่ระบบกำหนด")
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

    if (interaction.customId === "submit_info") {
      await interaction.deferReply();

      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.editReply({
          content: "❌ คุณไม่มีสิทธิ์ส่งข้อมูลนี้",
        });
      }

      const storedData = await getAuctionData(interaction.channel.id);
      const fallbackSummary =
        globalThis.lastFullSummary?.[interaction.channel.id] || "⚠️ ไม่มีสรุป";

      if (!storedData && !fallbackSummary) {
        return interaction.editReply({ content: "⚠️ ไม่พบข้อมูลในระบบ" });
      }

      const summary = storedData?.summary || fallbackSummary;

      // 🔁 แทนวันที่ "รอคิวก่อน" ด้วยวันพรุ่งนี้
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

      // 🖼️ โหลดไฟล์ภาพ (ถ้ามี)
      const imageFiles = [];
      if (storedData?.imageUrls?.length > 0) {
        for (const url of storedData.imageUrls) {
          try {
            const res = await fetch(url);
            const buffer = await res.buffer();
            const fileName = path.basename(url).split("?")[0];
            imageFiles.push({ attachment: buffer, name: fileName });
          } catch (err) {
            console.warn("⚠️ โหลดรูปไม่สำเร็จ:", err.message);
          }
        }
      }

      // ✅ สร้างห้องสาธารณะใหม่
      const parentId = "1375026841114509332"; // <== ใส่ Parent ID ที่ถูกต้อง
      const currentName = interaction.channel.name;
      const baseName = currentName.split("-").slice(0, 2).join("-"); // เช่น 'ครั้งที่-11'
      const channelName = baseName;

      const publicChannel = await guild.channels.create({
        name: channelName,
        type: 0, // GUILD_TEXT
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

      restrictedChannels.add(publicChannel.id);

      // ✅ ส่งข้อมูลเข้าในห้อง
      await publicChannel.send({
        content: finalSummary,
        files: imageFiles.length > 0 ? imageFiles : undefined,
      });

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

      // ✅ แจ้งผลกลับไปที่ interaction
      await interaction.editReply({
        content: `✅ ข้อมูลถูกแชร์ไปยังห้อง ${publicChannel}`,
      });
    }

    if (interaction.customId === "no_image") {
      const userId = interaction.user.id;
      const channelId = interaction.channel.id;

      // 🔁 ดึง summary ล่าสุดจาก modal หรือ fallback
      const summary = globalThis.lastFullSummary?.[channelId] || "⚠️ ไม่มีสรุป";

      // ✅ เซฟ summary ลง Firestore โดยไม่ต้องมี image
      await saveAuctionData(channelId, { summary });

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

      if (isImage) {
        const urls = [...msg.attachments.values()].map((a) => a.url);
        for (const url of urls) {
          await saveAuctionData(msg.channel.id, { imageUrls: [url] });
        }
      } else if (msg.content) {
        await saveAuctionData(msg.channel.id, {
          textEntries: admin.firestore.FieldValue.arrayUnion(msg.content),
        });
      }

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
