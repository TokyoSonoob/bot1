// report.js
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionsBitField,
  Events,
  MessageFlags
} = require("discord.js");

module.exports = (client) => {
  // กัน require ซ้ำแล้วผูก handler ซ้ำ
  if (client._reportModuleLoaded) return;
  client._reportModuleLoaded = true;

  // เนมสเปซ ID กันชนกับไฟล์อื่น
  const OPEN_ID  = "report:open";
  const CLOSE_ID = "report:close";

  // ===== helpers: acknowledge & safe reply (ephemeral ด้วย flags) =====
  async function ack(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
  }
  async function say(interaction, payload) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return interaction.editReply(payload);
    }
    try {
      return await interaction.editReply(payload);
    } catch {
      return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
    }
  }

  // ===== 1) !reportsea -> ส่ง embed + ปุ่ม เปิดตั๋ว =====
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (message.content !== "!reportsea") return;

      const openBtn = new ButtonBuilder()
        .setCustomId(OPEN_ID)
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

  // ===== 2) ปุ่มเปิด/ปิดตั๋ว =====
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isButton()) return;

      // ---------- เปิดตั๋ว ----------
      if (interaction.customId === OPEN_ID) {
        await ack(interaction); // กันหมดเวลา 3 วิ

        const guild = interaction.guild;
        if (!guild) return say(interaction, { content: "❌ ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น" });

        const parentCategoryId = interaction.channel?.parentId ?? null;
        const everyoneRole = guild.roles.everyone;

        const safeName = interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9ก-๙_-]/gi, "")
          .slice(0, 18);
        const channelName = `𝐑𝐞𝐩𝐨𝐫𝐭_${safeName}`;

        // ปุ่มปิดตั๋ว (ID เฉพาะโมดูลนี้)
        const closeBtn = new ButtonBuilder()
          .setCustomId(CLOSE_ID)
          .setLabel("ปิดตั๋ว")
          .setStyle(ButtonStyle.Danger);
        const rowClose = new ActionRowBuilder().addComponents(closeBtn);

        // ห้องเห็นเฉพาะผู้กด + บอท
        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentCategoryId ?? undefined,
          topic: `owner:${interaction.user.id}`,
          reason: `Report ticket opened by ${interaction.user.tag}`,
          permissionOverwrites: [
            { id: everyoneRole.id, deny: [PermissionsBitField.Flags.ViewChannel] },
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
            `**ผู้แจ้ง: <@${interaction.user.id}>**`,
            "โปรดอธิบายปัญหาหรือแนบหลักฐานเพิ่มเติมได้เลย",
          ].join("\n"))
          .setColor(0x22c55e)
          .setFooter({ text: "Make by Purple Shop" });

        await ticketChannel.send({ embeds: [welcome], components: [rowClose] });
        await say(interaction, { content: `✅ สร้างตั๋วแล้ว: ${ticketChannel}` });
        return; // กัน fall-through
      }

      // ---------- ปิดตั๋ว ----------
      if (interaction.customId === CLOSE_ID) {
        await ack(interaction); // กันหมดเวลา 3 วิ

        const ownerId = interaction.channel?.topic?.match(/owner:(\d{17,20})/)?.[1] ?? null;
        const isOwner = ownerId && interaction.user.id === ownerId;
        const canManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);

        if (!isOwner && !canManage) {
          return say(interaction, {
            content: "❌ ต้องเป็น **เจ้าของตั๋ว** หรือมีสิทธิ์ **Manage Channels** ถึงจะปิดตั๋วได้",
          });
        }

        await say(interaction, { content: "⏳ กำลังปิดตั๋วนี้..." });
        const ch = interaction.channel;
        setTimeout(async () => {
          try { await ch?.delete("Ticket closed"); } catch (e) { console.error("Delete channel failed:", e); }
        }, 1000);
        return; // กัน fall-through
      }
    } catch (err) {
      console.error("Interaction error:", err);
      try {
        if (interaction?.isRepliable?.()) {
          await say(interaction, { content: "❌ เกิดข้อผิดพลาด" });
        }
      } catch {}
    }
  });
};
