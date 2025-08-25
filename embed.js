// embed.js
module.exports = (client) => {
  const {
    REST,
    Routes,
    Events,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");

  const CMD_EMBED = "embed";
  const CMD_BOTTON = "botton"; // ตามที่ขอ
  const MODAL_EMBED = "embed_form_modal";
  const MODAL_BOTTON_PREFIX = "btn_form:"; // ต่อท้าย messageId

  // ลงทะเบียน Slash Commands เมื่อบอทพร้อม
  client.once(Events.ClientReady, async () => {
    try {
      const rest = new REST({ version: "10" }).setToken(TOKEN);
      const appId = client.application?.id ?? client.user.id;

      const commands = [
        {
          name: CMD_EMBED,
          description: "เปิดฟอร์มเพื่อส่ง Embed",
          dm_permission: false,
        },
        {
          name: CMD_BOTTON,
          description: "เพิ่มปุ่มลิงก์ให้ข้อความ embed ของบอท (ระบุ IDembed)",
          dm_permission: false,
          options: [
            {
              type: 3, // STRING
              name: "idembed",
              description: "Message ID ของข้อความบอท (ในห้องนี้)",
              required: true,
            },
          ],
        },
      ];

      for (const [guildId] of client.guilds.cache) {
        await rest.put(Routes.applicationGuildCommands(appId, guildId), {
          body: commands,
        });
        console.log(`✅ Registered /${CMD_EMBED} & /${CMD_BOTTON} in ${guildId}`);
      }
    } catch (err) {
      console.error("❌ Command registration error:", err);
    }
  });

  const safeReply = async (interaction, payload) => {
    try {
      if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
      return await interaction.reply(payload);
    } catch {}
  };

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // /embed -> เปิดฟอร์ม
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_EMBED) {
        const modal = new ModalBuilder().setCustomId(MODAL_EMBED).setTitle("สร้าง Embed");

        const titleInput = new TextInputBuilder()
          .setCustomId("title").setLabel("หัวข้อ")
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256);

        const descInput = new TextInputBuilder()
          .setCustomId("message").setLabel("ข้อความ")
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000); // เพดาน Modal

        const imageInput = new TextInputBuilder()
          .setCustomId("image").setLabel("ลิงก์รูปภาพ (ไม่บังคับ)")
          .setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // /botton idembed -> เปิดฟอร์มตั้งค่าปุ่ม (ไม่มีสี)
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_BOTTON) {
        const messageId = interaction.options.getString("idembed", true);

        const modal = new ModalBuilder()
          .setCustomId(`${MODAL_BOTTON_PREFIX}${messageId}`)
          .setTitle("ตั้งค่าปุ่มลิงก์");

        const labelInput = new TextInputBuilder()
          .setCustomId("label").setLabel("ชื่อปุ่ม")
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80);

        const urlInput = new TextInputBuilder()
          .setCustomId("url").setLabel("ลิงก์ (http:// หรือ https://)")
          .setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(labelInput),
          new ActionRowBuilder().addComponents(urlInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // Submit: /embed
      if (interaction.isModalSubmit() && interaction.customId === MODAL_EMBED) {
        const title = interaction.fields.getTextInputValue("title").trim();
        const message = interaction.fields.getTextInputValue("message").trim();
        const image = (interaction.fields.getTextInputValue("image") || "").trim();

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(message.slice(0, 4096)) // Embed รองรับ 4096
          .setColor(0x9b59b6)
          .setTimestamp()
          // ✅ Footer คงที่เสมอ
          .setFooter({ text: "Make by Purple Shop" });

        let warn = "";
        if (image) {
          const isUrl = /^https?:\/\/\S{3,}/i.test(image);
          if (isUrl) embed.setImage(image);
          else warn = "⚠️ ลิงก์รูปภาพไม่ถูกต้อง จึงไม่ได้แนบรูปภาพ";
        }

        if (!interaction.channel?.send) {
          await safeReply(interaction, { content: "❌ ไม่สามารถส่งในห้องนี้ได้", flags: 1 << 6 });
          return;
        }

        await interaction.channel.send({ embeds: [embed] });
        await safeReply(interaction, { content: `✅ ส่ง Embed แล้ว${warn ? `\n${warn}` : ""}`, flags: 1 << 6 });
        return;
      }

      // Submit: /botton (เพิ่มปุ่มลิงก์)
      if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_BOTTON_PREFIX)) {
        const messageId = interaction.customId.slice(MODAL_BOTTON_PREFIX.length);

        const label = interaction.fields.getTextInputValue("label").trim();
        const url = interaction.fields.getTextInputValue("url").trim();

        // ตรวจ URL
        const isUrl = /^https?:\/\/\S{3,}/i.test(url);
        if (!isUrl) {
          await safeReply(interaction, { content: "❌ ลิงก์ไม่ถูกต้อง ต้องขึ้นต้นด้วย http:// หรือ https://", flags: 1 << 6 });
          return;
        }

        // ดึงข้อความเป้าหมาย (ในห้องเดียวกัน)
        let targetMsg = null;
        try {
          targetMsg = await interaction.channel.messages.fetch(messageId);
        } catch {
          await safeReply(interaction, { content: "❌ หา Message ID นี้ไม่เจอในห้องนี้", flags: 1 << 6 });
          return;
        }

        // ต้องเป็นข้อความของบอทตัวเองเท่านั้นถึงจะแก้ไขได้
        if (targetMsg.author.id !== client.user.id) {
          await safeReply(interaction, { content: "❌ ข้อความนี้ไม่ใช่ของบอท จึงใส่ปุ่มให้ไม่ได้", flags: 1 << 6 });
          return;
        }

        const linkButton = new ButtonBuilder()
          .setLabel(label)
          .setStyle(ButtonStyle.Link)
          .setURL(url);

        const existRows = targetMsg.components ?? [];
        if (existRows.length >= 5) {
          await safeReply(interaction, { content: "⚠️ ข้อความนี้มี Action Row ครบ 5 แถวแล้ว ไม่สามารถเพิ่มได้", flags: 1 << 6 });
          return;
        }

        const newRows = [...existRows, new ActionRowBuilder().addComponents(linkButton)];

        await targetMsg.edit({
          content: targetMsg.content ?? undefined,
          embeds: targetMsg.embeds ?? undefined,
          components: newRows,
        });

        await safeReply(interaction, { content: "✅ ใส่ปุ่มลิงก์สำเร็จ!", flags: 1 << 6 });
        return;
      }
    } catch (err) {
      console.error("Error in handlers:", err);
      await safeReply(interaction, { content: "❌ มีข้อผิดพลาด ลองใหม่อีกครั้ง", flags: 1 << 6 });
    }
  });
};
