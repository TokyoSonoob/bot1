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
const express = require("express");
const { db } = require("./firebase");

module.exports = function (client) {
  const PREFIX = "!";
  const STAFF_ROLE_ID = "1374387525040214016";
  const CATEGORY_ID = "1374396536951406683";
  const FORM_CHANNEL_ID = "1374427289948786759"; // ห้องแบบฟอร์ม

  const OWNER_IDS = {
    skin_hikuri: "1134464935448023152",
    skin_sky: "1260765032413659159",
    skin_mui: "1010202066720936048",
    skin_khim: "1294133075801931870",
    skin_nj: "1092393537238204497",
  };

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

      const btnNj = new ButtonBuilder()
        .setCustomId("skin_nj")
        .setLabel("ลายเส้น NJ")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(
        btnHikuri,
        btnSky,
        btnMui,
        btnKhim,
        btnNj
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      message.delete().catch(console.error);
    }

    // ✅ ฟีเจอร์ !close
    if (message.content.toLowerCase() === `${PREFIX}close`) {
      const userId = message.author.id;
      const owned = Object.entries(OWNER_IDS).find(([, uid]) => uid === userId);

      if (!owned) {
        return message.reply("❌ คุณไม่มีสิทธิ์ในการใช้คำสั่งนี้");
      }

      const customIdToRemove = owned[0]; // เช่น 'skin_nj'

      // ลบปุ่มของเจ้าตัวใน message ปัจจุบัน
      const recentMessages = await message.channel.messages.fetch({ limit: 10 });
      const botMessage = recentMessages.find(
        (msg) => msg.author.id === client.user.id && msg.components.length > 0
      );

      if (botMessage) {
        const currentRow = botMessage.components[0];
        const newButtons = currentRow.components.filter(
          (btn) => btn.customId !== customIdToRemove
        );

        const newRow = new ActionRowBuilder().addComponents(newButtons);
        await botMessage.edit({ components: [newRow] });
      }

      // ลบข้อความที่แท็กเขาในห้องแบบฟอร์ม
      try {
        const formChannel = await client.channels.fetch(FORM_CHANNEL_ID);
        if (formChannel && formChannel.isTextBased()) {
          const formMessages = await formChannel.messages.fetch({ limit: 50 });
          const userMessages = formMessages.filter(
            (msg) =>
              msg.author.id === client.user.id &&
              msg.content.includes(`<@${userId}>`)
          );

          for (const msg of userMessages.values()) {
            await msg.delete().catch(() => {});
          }
        }
      } catch (err) {
        console.error("ลบข้อความห้องแบบฟอร์มผิดพลาด:", err);
      }

      return message.reply("✅ ลบปุ่มของคุณและข้อความในห้องแบบฟอร์มเรียบร้อยแล้ว");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { guild, user } = interaction;

    if (
      interaction.customId === "skin_hikuri" ||
      interaction.customId === "skin_sky" ||
      interaction.customId === "skin_mui" ||
      interaction.customId === "skin_khim" ||
      interaction.customId === "skin_nj"
    ) {
      let skinName = "";
      let channelName = "";
      let pingUserId = "";

      switch (interaction.customId) {
        case "skin_hikuri":
          skinName = "ลายเส้นคุณฮิเคริ";
          channelName = `สกินคุณฮิเคริ`;
          pingUserId = OWNER_IDS.skin_hikuri;
          break;
        case "skin_sky":
          skinName = "ลายเส้นคุณสกาย";
          channelName = `สกินคุณสกาย`;
          pingUserId = OWNER_IDS.skin_sky;
          break;
        case "skin_mui":
          skinName = "ลายเส้นคุณมุย";
          channelName = `สกินมุยคุง`;
          pingUserId = OWNER_IDS.skin_mui;
          break;
        case "skin_khim":
          skinName = "ลายเส้นคุณขิม";
          channelName = `สกินคุณขิม`;
          pingUserId = OWNER_IDS.skin_khim;
          break;
        case "skin_nj":
          skinName = "ลายเส้นคุณ NJ";
          channelName = `สกินคุณ NJ`;
          pingUserId = OWNER_IDS.skin_nj;
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

      const embed = new EmbedBuilder()
        .setTitle(`${skinName}`)
        .setColor(0x9b59b6);

      const formUrl = `https://seamuwwww.vercel.app?channelId=${channel.id}`;

      const deleteBtn = new ButtonBuilder()
        .setCustomId("delete_ticket")
        .setLabel("🗑️ ลบตั๋ว")
        .setStyle(ButtonStyle.Danger);

      const formBtn = new ButtonBuilder()
        .setLabel("กรอกแบบฟอร์ม")
        .setStyle(ButtonStyle.Link)
        .setURL(formUrl);

      const row = new ActionRowBuilder().addComponents(deleteBtn, formBtn);

      await channel.send({
        content: `<@${user.id}>\n<@${pingUserId}>`,
        embeds: [embed],
        components: [row],
      });

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
