const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionsBitField,
  MessageFlags, // ✅ ใช้ flags แทน ephemeral
} = require("discord.js");
const express = require("express");
const { db } = require("./firebase");

module.exports = function (client) {
  const PREFIX = "!";
  const STAFF_ROLE_ID = "1374387525040214016";
  const CATEGORY_ID = "1374396536951406683";
  const FORM_CHANNEL_ID = "1374427289948786759";

  const OWNER_IDS = {
    skin_hi: "1134464935448023152",
    skin_sky: "1260765032413659159",
    skin_muy: "1010202066720936048",
    skin_kim: "1294133075801931870",
    skin_nj: "1092393537238204497",
  };

  const LABELS = {
    skin_hi: "ลายเส้นฮิเคริ",
    skin_sky: "ลายเส้นสกาย",
    skin_muy: "ลายเส้นมุย",
    skin_kim: "ลายเส้นขิม",
    skin_nj: "ลายเส้น NJ",
  };

  const argToCustomId = (raw) => {
    if (!raw) return null;
    const key = String(raw).toLowerCase();
    if (key === "hi") return "skin_hi";
    if (key === "sky") return "skin_sky";
    if (key === "muy") return "skin_muy";
    if (key === "kim") return "skin_kim";
    if (key === "nj") return "skin_nj";
    return null;
  };

  const isAdminOrStaff = (member) =>
    member?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member?.roles?.cache?.has(STAFF_ROLE_ID);

  // ===== Commands =====
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // โพสต์เมนูปุ่มเลือกช่างวาด
    if (command === "skin") {
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("skin_hi").setLabel(LABELS.skin_hi).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("skin_sky").setLabel(LABELS.skin_sky).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("skin_muy").setLabel(LABELS.skin_muy).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("skin_kim").setLabel(LABELS.skin_kim).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("skin_nj").setLabel(LABELS.skin_nj).setStyle(ButtonStyle.Primary)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      await message.delete().catch(() => {});
    }

    // ปิดปุ่มบางคน: !closeskin <hi|sky|muy|kim|nj>
    if (command === "closeskin") {
      if (!isAdminOrStaff(message.member)) {
        await message.delete().catch(() => {});
        return;
      }
      const customIdToRemove = argToCustomId(args[0]);
      if (!customIdToRemove) {
        await message.delete().catch(() => {});
        return;
      }

      const recentMessages = await message.channel.messages.fetch({ limit: 20 });
      const botMessage = recentMessages.find(
        (msg) => msg.author.id === client.user.id && msg.components.length > 0
      );

      if (botMessage) {
        const currentRow = botMessage.components[0];
        const newButtons = currentRow.components.filter((btn) => btn.customId !== customIdToRemove);
        if (newButtons.length > 0) {
          const newRow = new ActionRowBuilder().addComponents(newButtons);
          await botMessage.edit({ components: [newRow] });
        } else {
          await botMessage.edit({ components: [] });
        }
      }
      await message.delete().catch(() => {});
    }

    // เปิดปุ่มด้วยชื่อย่อ: !openskin <hi|sky|muy|kim|nj>
    if (command === "openskin") {
      if (!isAdminOrStaff(message.member)) {
        await message.delete().catch(() => {});
        return;
      }
      const customIdToAdd = argToCustomId(args[0]);
      if (!customIdToAdd) {
        await message.delete().catch(() => {});
        return;
      }

      const recentMessages = await message.channel.messages.fetch({ limit: 20 });
      const botMessage = recentMessages.find(
        (msg) => msg.author.id === client.user.id && msg.components.length > 0
      );

      if (botMessage) {
        const currentRow = botMessage.components[0];
        const exists = currentRow.components.some((btn) => btn.customId === customIdToAdd);

        if (!exists) {
          if (currentRow.components.length < 5) {
            const newButton = new ButtonBuilder()
              .setCustomId(customIdToAdd)
              .setLabel(LABELS[customIdToAdd] || "ลายเส้น")
              .setStyle(ButtonStyle.Primary);

            const newRow = new ActionRowBuilder().addComponents([...currentRow.components, newButton]);
            await botMessage.edit({ components: [newRow] });
          }
        }
      }
      await message.delete().catch(() => {});
    }
  });

  // ===== Interaction Buttons =====
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { guild, user, member } = interaction;

    // เปิดตั๋วสกิน
    if (
      interaction.customId === "skin_hi" ||
      interaction.customId === "skin_sky" ||
      interaction.customId === "skin_muy" ||
      interaction.customId === "skin_kim" ||
      interaction.customId === "skin_nj"
    ) {
      // ✅ ACK ไว้ก่อน กัน 10062
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let skinName = "";
      let channelName = "";
      let pingUserId = "";

      switch (interaction.customId) {
        case "skin_hi":
          skinName = "ลายเส้นคุณฮิเคริ";
          channelName = `สกินคุณฮิเคริ`;
          pingUserId = OWNER_IDS.skin_hi;
          break;
        case "skin_sky":
          skinName = "ลายเส้นคุณสกาย";
          channelName = `สกินคุณสกาย`;
          pingUserId = OWNER_IDS.skin_sky;
          break;
        case "skin_muy":
          skinName = "ลายเส้นคุณมุย";
          channelName = `สกินมุยคุง`;
          pingUserId = OWNER_IDS.skin_muy;
          break;
        case "skin_kim":
          skinName = "ลายเส้นคุณขิม";
          channelName = `สกินคุณขิม`;
          pingUserId = OWNER_IDS.skin_kim;
          break;
        case "skin_nj":
          skinName = "ลายเส้นคุณ NJ";
          channelName = `สกินคุณ NJ`;
          pingUserId = OWNER_IDS.skin_nj;
          break;
      }

      // จำกัดไม่เกิน 3 ห้อง/คน/ลายเส้น
      const userChannels = guild.channels.cache.filter(
        (ch) =>
          ch.parentId === CATEGORY_ID &&
          ch.name === channelName &&
          ch.permissionsFor(user.id)?.has(PermissionsBitField.Flags.ViewChannel)
      );

      if (userChannels.size >= 3) {
        await interaction.editReply({
          content: `❗ คุณสามารถเปิดตั๋วลายเส้น ${skinName} ได้สูงสุด 3 ห้องเท่านั้น (ตอนนี้เปิดอยู่ ${userChannels.size} ห้อง)`,
        });
        return;
      }

      // สร้างห้อง
      const channel = await guild.channels.create({
        name: channelName,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
      });

      const embed = new EmbedBuilder().setTitle(`${skinName}`).setColor(0x9b59b6);
      const formUrl = `https://seamuwwww.vercel.app?channelId=${channel.id}`;

      const deleteBtn = new ButtonBuilder()
        .setCustomId("delete_ticket")
        .setLabel("ลบตั๋ว")
        .setStyle(ButtonStyle.Danger);

      const formBtn = new ButtonBuilder().setLabel("กรอกแบบฟอร์ม").setStyle(ButtonStyle.Link).setURL(formUrl);

      const row = new ActionRowBuilder().addComponents(deleteBtn, formBtn);

      await channel.send({
        content: `<@${user.id}>\n<@${pingUserId}>`,
        embeds: [embed],
        components: [row],
      });

      await interaction.editReply({
        content: `✅ เปิดตั๋วสกินลายเส้น ${skinName} แล้ว: ${channel}`,
      });
      return;
    }

    // ลบตั๋ว
    if (interaction.customId === "delete_ticket") {
      if (!isAdminOrStaff(member)) {
        return interaction.reply({
          content: "❌ คุณไม่มีสิทธิ์ลบตั๋วนี้ (เฉพาะแอดมินหรือสตาฟเท่านั้น)",
          flags: MessageFlags.Ephemeral, // ✅ ใช้ flags
        });
      }

      // ✅ ตอบก่อน แล้วค่อยลบห้องกัน 10062
      await interaction.reply({
        content: "🗑️ กำลังลบตั๋ว...",
        flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.channel?.delete().catch(console.error);
      }, 250);

      return;
    }
  });
};
