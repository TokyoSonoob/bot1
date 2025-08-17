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
  } = require("discord.js");
  const { TOKEN } = require("./token");

  const CMD_NAME = "embed";
  const MODAL_ID = "embed_form_modal";

  // ลงทะเบียน Slash Command เมื่อบอทพร้อมใช้งาน
  client.once(Events.ClientReady, async () => {
    try {
      const rest = new REST({ version: "10" }).setToken(TOKEN);
      const appId = client.application?.id ?? client.user.id;

      const commands = [
        {
          name: CMD_NAME,
          description: "เปิดฟอร์มเพื่อส่ง Embed",
          dm_permission: false,
        },
      ];

      // ลงทะเบียนในทุกกิลด์ที่บอทอยู่ (อัปเดตไว)
      for (const [guildId] of client.guilds.cache) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(appId, guildId),
            { body: commands }
          );
          console.log(`✅ Registered /${CMD_NAME} in guild ${guildId}`);
        } catch (e) {
          console.error(`❌ Failed to register /${CMD_NAME} in ${guildId}:`, e?.message || e);
        }
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

  // จัดการ /embed + Modal
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // /embed -> แสดงฟอร์ม
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_NAME) {
        const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle("สร้าง Embed");

        const titleInput = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("หัวข้อ")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256); // OK

        const descInput = new TextInputBuilder()
          .setCustomId("message")
          .setLabel("ข้อความ")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000); // <-- แก้จาก 4096 เป็น 4000 (เพดานของ Modal)

        const imageInput = new TextInputBuilder()
          .setCustomId("image")
          .setLabel("ลิงก์รูปภาพ (ไม่บังคับ)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // รับค่าจากฟอร์มแล้วส่ง Embed ในห้องนั้น
      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        const title = interaction.fields.getTextInputValue("title").trim();
        const message = interaction.fields.getTextInputValue("message").trim();
        const image = (interaction.fields.getTextInputValue("image") || "").trim();

        const embed = new EmbedBuilder()
          .setTitle(title)
          // Embed description เองรับได้ 4096 ตัวอักษร จึง slice(0, 4096) ได้ปกติ
          .setDescription(message.slice(0, 4096))
          .setColor(0x9b59b6)
          .setTimestamp()
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
      }
    } catch (err) {
      console.error("Error in /embed handler:", err);
      await safeReply(interaction, { content: "❌ มีข้อผิดพลาด ลองใหม่อีกครั้ง", flags: 1 << 6 });
    }
  });
};
