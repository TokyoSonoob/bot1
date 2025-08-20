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

module.exports = function (client) {
  const PREFIX = "!";
  const STAFF_ROLE_ID = "1374387525040214016";
  const CATEGORY_ID = "1375932586374729848"; // หมวดหมู่คอมมิชชั่น

  // เหลือเฉพาะ nj, muy และ ne (เนจิ)
  const OWNER_IDS = {
    com_muy: "1010202066720936048", // มุย
    com_nj:  "1092393537238204497", // NJ
    com_ne:  "765887179741200394",  // เนจิ
  };

  const LABELS = {
    com_muy: "ลายเส้นมุย",
    com_nj:  "ลายเส้นNJ",
    com_ne:  "ลายเส้นเนจิ",
  };

  // arg -> customId (muy | nj | ne)
  const argToCustomId = (raw) => {
    if (!raw) return null;
    const key = String(raw).toLowerCase();
    if (key === "muy") return "com_muy";
    if (key === "nj")  return "com_nj";
    if (key === "ne")  return "com_ne";
    return null;
  };

  const isAdminOrStaff = (member) =>
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.roles.cache.has(STAFF_ROLE_ID);

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // โพสต์เมนูปุ่ม "คอมมิชชั่น"
    if (command === "com") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("❌ เฉพาะแอดมินเท่านั้นที่ใช้คำสั่งนี้ได้");
      }

      const embed = new EmbedBuilder()
        .setTitle("กดตั๋วเพื่อสั่งคอมมิชชั่น")
        .setDescription("ห้ามกดเล่น")
        .setColor(0x9b59b6)
        .setImage("https://media.tenor.com/S4MdyoCR3scAAAAM/oblakao.gif")
        .setFooter({ text: "Make by Purple Shop" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("com_muy").setLabel(LABELS.com_muy).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("com_nj").setLabel(LABELS.com_nj).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("com_ne").setLabel(LABELS.com_ne).setStyle(ButtonStyle.Primary),
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      await message.delete().catch(() => {});
    }

    // ปิดปุ่ม: !closecom <muy|nj|ne>
    if (command === "closecom") {
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

    // เปิดปุ่ม: !opencom <muy|nj|ne>
    if (command === "opencom") {
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
          if (currentRow.components.length >= 5) {
            // เต็มแล้ว ไม่เพิ่ม
          } else {
            const newButton = new ButtonBuilder()
              .setCustomId(customIdToAdd)
              .setLabel(LABELS[customIdToAdd] || "คอมมิชชั่น")
              .setStyle(ButtonStyle.Primary);

            const newRow = new ActionRowBuilder().addComponents([...currentRow.components, newButton]);
            await botMessage.edit({ components: [newRow] });
          }
        }
      }
      await message.delete().catch(() => {});
    }
  });

  // ========= ปุ่มกดเปิดตั๋ว / ลบตั๋ว =========
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { guild, user } = interaction;

    if (
      interaction.customId === "com_muy" ||
      interaction.customId === "com_nj"  ||
      interaction.customId === "com_ne"
    ) {
      let titleName = "";   // ใช้แสดงผล
      let channelName = ""; // ชื่อห้อง
      let pingUserId = "";

      switch (interaction.customId) {
        case "com_muy":
          titleName = "มุย";
          channelName = `คอมมิชชั่นมุย`;
          pingUserId = OWNER_IDS.com_muy;
          break;
        case "com_nj":
          titleName = "NJ";
          channelName = `คอมมิชชั่น NJ`;
          pingUserId = OWNER_IDS.com_nj;
          break;
        case "com_ne":
          titleName = "เนจิ";
          channelName = `คอมมิชชั่นเนจิ`;
          pingUserId = OWNER_IDS.com_ne;
          break;
      }

      // จำกัดเปิดได้ไม่เกิน 3 ห้อง/คน/ช่าง (อิงจากชื่อห้อง + การมองเห็น)
      const userChannels = guild.channels.cache.filter(
        (ch) =>
          ch.parentId === CATEGORY_ID &&
          ch.name === channelName &&
          ch.permissionsFor(user.id)?.has(PermissionsBitField.Flags.ViewChannel)
      );

      if (userChannels.size >= 3) {
        return interaction.reply({
          content: `❗ คุณสามารถเปิดตั๋วคอมมิชชั่นของ ${titleName} ได้สูงสุด 3 ห้องเท่านั้น (ตอนนี้เปิดอยู่ ${userChannels.size} ห้อง)`,
          ephemeral: true,
        });
      }

      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // GuildText
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle(`ตั๋วคอมมิชชั่น (${titleName})`)
        .setColor(0x9b59b6)
        .setFooter({ text: "Make by Purple Shop" });

      // เหลือเฉพาะปุ่มลบตั๋ว
      const deleteBtn = new ButtonBuilder()
        .setCustomId("delete_ticket")
        .setLabel("ลบตั๋ว")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(deleteBtn);

      await channel.send({
        content: `<@${user.id}>\n<@${pingUserId}>`,
        embeds: [embed],
        components: [row],
      });

      await interaction.reply({
        content: `✅ เปิดตั๋วคอมมิชชั่นของ ${titleName} แล้ว: ${channel}`,
        ephemeral: true,
      });
    }

    if (interaction.customId === "delete_ticket") {
      try {
        await interaction.deferUpdate(); // ตอบรับแบบเงียบ
        await interaction.channel.delete().catch(console.error);
      } catch (err) {
        console.error(err);
      }
    }
  });
};
