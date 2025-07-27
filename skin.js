const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionsBitField,
} = require("discord.js");

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = function (client) {
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json()); // รองรับ JSON

app.post("/skin", async (req, res) => {
  try {
    const data = req.body;
    const channelId = data.channelId;
    if (!channelId) return res.status(400).send("Missing channelId");

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return res.status(404).send("Channel not found");

    const embed = new EmbedBuilder()
      .setTitle("🎨 ฟอร์มสั่งสกินใหม่")
      .setColor(0x9b59b6)
      .setFooter({ text: "Make by Purple Shop" })
      .setTimestamp();

    for (const [key, value] of Object.entries(data)) {
      if (key === "channelId") continue;
      embed.addFields({ name: key, value: value || "-", inline: false });
    }

    await channel.send({ content: "📥 มีการส่งฟอร์มสั่งสกินใหม่เข้ามา!", embeds: [embed] });

    res.json({ status: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
});



const PREFIX = "!";
const STAFF_ROLE_ID = "1374387525040214016";
const CATEGORY_ID = "1374396536951406683"; // หมวดหมู่ถาวร

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === `${PREFIX}skin`) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ เฉพาะแอดมินเท่านั้นที่ใช้คำสั่งนี้ได้");
    }

await message.channel.send({
  content: `# ดูลายเส้นแต่ละคนได้ที่\n## <#1374409545836925008>`,
});

    const embed = new EmbedBuilder()
      .setTitle("กดตั๋วเพื่อสั่งสกิน")
      .setDescription("ห้ามกดเล่น")
      .setColor(0x9b59b6)
      .setImage("https://media.tenor.com/S4MdyoCR3scAAAAM/oblakao.gif")
      .setFooter({ text: "Make by Purple Shop" });

    const btnHikuri = new ButtonBuilder()
      .setCustomId("skin_hikuri")
      .setLabel("ลายเส้นฮิเคริ")
      .setStyle(ButtonStyle.Primary);

    const btnSky = new ButtonBuilder()
      .setCustomId("skin_sky")
      .setLabel("ลายเส้นสกาย")
      .setStyle(ButtonStyle.Primary);

    const btnMui = new ButtonBuilder()
      .setCustomId("skin_mui")
      .setLabel("ลายเส้นมุย")
      .setStyle(ButtonStyle.Primary);

    const btnKhim = new ButtonBuilder()
      .setCustomId("skin_khim")
      .setLabel("ลายเส้นขิม")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(btnHikuri, btnSky, btnMui, btnKhim);

    await message.channel.send({ embeds: [embed], components: [row] });

    message.delete().catch(console.error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { guild, user } = interaction;

  if (
    interaction.customId === "skin_hikuri" ||
    interaction.customId === "skin_sky" ||
    interaction.customId === "skin_mui" ||
    interaction.customId === "skin_khim"
  ) {
    let skinName = "";
    let channelName = "";
    let pingUserId = "";

    switch (interaction.customId) {
      case "skin_hikuri":
        skinName = "ลายเส้นคุณฮิเคริ";
        channelName = `สกินคุณฮิเคริ`;
        pingUserId = "1134464935448023152";
        break;
      case "skin_sky":
        skinName = "ลายเส้นคุณสกาย";
        channelName = `สกินคุณสกาย`;
        pingUserId = "1260765032413659159";
        break;
      case "skin_mui":
        skinName = "ลายเส้นคุณมุย";
        channelName = `สกินมุยคุง`;
        pingUserId = "1010202066720936048";
        break;
      case "skin_khim":
        skinName = "ลายเส้นคุณขิม";
        channelName = `สกินคุณขิม`;
        pingUserId = "1294133075801931870";
        break;
    }

    const userChannels = guild.channels.cache.filter(
  (ch) =>
    ch.parentId === CATEGORY_ID &&
    ch.name === channelName &&
    ch.permissionsFor(user.id)?.has(PermissionsBitField.Flags.ViewChannel)
);

if (userChannels.size >= 3) {
  return interaction.reply({
    content: `❗ คุณสามารถเปิดตั๋วลายเส้น ${skinName} ได้สูงสุด 3 ห้องเท่านั้น (ตอนนี้เปิดอยู่ ${userChannels.size} ห้อง)`,
    ephemeral: true,
  });
}


    const channel = await guild.channels.create({
      name: channelName,
      type: 0,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        {
          id: STAFF_ROLE_ID,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
      ],
    });
    const skinOrdersRef = db.collection("skinOrders");
const querySnapshot = await skinOrdersRef.where("id", "==", channel.id).get();

let extraDescription = "";

if (!querySnapshot.empty) {
  querySnapshot.forEach((doc) => {
    const order = doc.data();

    // สมมติ order มี userId, skin, createdAt
    extraDescription += `\n- ผู้เปิดตั๋ว: <@${order.userId}>\n- ลายเส้น: ${order.skin}\n- เปิดเมื่อ: ${order.createdAt?.toDate().toLocaleString() || "-"}\n`;
  });
} else {
  extraDescription = "ไม่พบข้อมูลในฐานข้อมูล skinOrders สำหรับห้องนี้";
}

const embed = new EmbedBuilder()
  .setTitle(`${skinName}`)
  .setColor(0x9b59b6)
  .setDescription(extraDescription);

// ปุ่มลบตั๋ว
const deleteBtn = new ButtonBuilder()
  .setCustomId("delete_ticket")
  .setLabel("🗑️ ลบตั๋ว")
  .setStyle(ButtonStyle.Danger);

const row = new ActionRowBuilder().addComponents(deleteBtn);

await channel.send({
  content: `<@${user.id}>\n<@${pingUserId}>`,
  embeds: [embed],
  components: [row],
});


const formUrl = `https://seamuwwww.vercel.app?channelId=${channel.id}`;
await channel.send(`📋 กรุณากรอกฟอร์มสั่งสกินที่นี่: ${formUrl}`);




    await interaction.reply({
      content: `✅ เปิดตั๋วสกินลายเส้น${skinName} แล้ว: ${channel}`,
      ephemeral: true,
    });
  }

  if (interaction.customId === "delete_ticket") {
    await interaction.reply({
      content: "⏳ กำลังลบตั๋วใน 10 วินาที...",
      ephemeral: true,
    });
    setTimeout(() => {
      interaction.channel.delete().catch(console.error);
    }, 10000);
  }
});

    };
