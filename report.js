// report.js
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionsBitField,
  Events
} = require("discord.js");

module.exports = (client) => {
  // ===== 1) !report -> ส่ง embed + ปุ่ม เปิดตั๋ว =====
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (message.content !== "!reportsea") return;

      const openBtn = new ButtonBuilder()
        .setCustomId("open_report_ticket")
        .setLabel("เปิดตั๋วแจ้งความ")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(openBtn);

      const embed = new EmbedBuilder()
        .setTitle("แจ้งความ")
        .setDescription("กดปุ่มด้านล่างเพื่อเปิดตั๋วแจ้งความ")
        .setColor("#b96eff")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error("Error sending report embed:", err);
    }
  });

  // ===== 2) ปุ่มเปิดตั๋ว -> สร้างห้องที่เห็นได้เฉพาะคนกด =====
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isButton()) return;

      if (interaction.customId === "open_report_ticket") {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: "❌ ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น", ephemeral: true });
        }

        const parentCategoryId = interaction.channel?.parentId ?? null;
        const everyoneRole = guild.roles.everyone;

        const safeName = interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9ก-๙_-]/gi, "")
          .slice(0, 18);
        const channelName = `report-${safeName}-${Date.now().toString().slice(-4)}`;

        // ปุ่มปิดตั๋ว
        const closeBtn = new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("ปิดตั๋ว")
          .setStyle(ButtonStyle.Danger);

        const rowClose = new ActionRowBuilder().addComponents(closeBtn);

        // สร้างห้อง: deny @everyone, allow ผู้กด + บอท
        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentCategoryId ?? undefined,
          topic: `owner:${interaction.user.id}`,
          reason: `Report ticket opened by ${interaction.user.tag}`,
          permissionOverwrites: [
            {
              id: everyoneRole.id,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
              ],
            },
            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
              ],
            },
          ],
        });

        const welcome = new EmbedBuilder()
          .setTitle("ตั๋วแจ้งความ")
          .setDescription([
            `**ผู้แจ้ง: <@${interaction.user.id}>`,
            "โปรดอธิบายปัญหาหรือแนบหลักฐานเพิ่มเติมได้เลย**"
          ].join("\n"))
          .setColor(0x22c55e)
          .setFooter({ text: "Make by Purple Shop" });

        // ส่ง embed + ปุ่มปิด (จะ @everyone หรือไม่ก็ได้ ; ถ้า @everyone คนอื่นจะไม่เห็น/ไม่แจ้งเตือนอยู่ดีเพราะไม่มีสิทธิ์ ViewChannel)
        await ticketChannel.send({
          // content: "@everyone", // ถ้าต้องการคงไว้ก็ uncomment
          embeds: [welcome],
          components: [rowClose],
          allowedMentions: { parse: ["everyone"] }
        });

        await interaction.reply({ content: `✅ สร้างตั๋วแล้ว: ${ticketChannel}`, ephemeral: true });
      }

      // ===== 3) ปิดตั๋ว: อนุญาตทั้งแอดมิน (ManageChannels) หรือ "เจ้าของตั๋ว" =====
      if (interaction.customId === "close_ticket") {
        const ownerId = interaction.channel?.topic?.match(/owner:(\d{17,20})/)?.[1] ?? null;
        const isOwner = ownerId && interaction.user.id === ownerId;
        const canManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);

        if (!isOwner && !canManage) {
          return interaction.reply({
            content: "❌ ต้องเป็น **เจ้าของตั๋ว** หรือมีสิทธิ์ **Manage Channels** ถึงจะปิดตั๋วได้",
            ephemeral: true
          });
        }

        const ch = interaction.channel;
        await interaction.reply({ content: "กำลังปิดตั๋วนี้", ephemeral: true });
        await ch.delete("Ticket closed");
      }
    } catch (err) {
      console.error("Interaction error:", err);
      if (interaction.isRepliable()) {
        try { await interaction.reply({ content: "❌ เกิดข้อผิดพลาด", ephemeral: true }); } catch {}
      }
    }
  });
};
