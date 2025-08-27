// embed_fix_s.js
// รวม /embed /fix /s ไว้ในโมดูลเดียว (discord.js v14)
// ต้องมี process.env.TOKEN (โหลด .env ใน index.js ก่อน require โมดูลนี้)

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
    PermissionsBitField,
  } = require("discord.js");

  // =====[ Const ]=====
  const CMD_EMBED = "embed";
  const CMD_FIX = "fix";
  const CMD_S = "s";

  const MODAL_EMBED = "embed_form_modal";
  const CREDIT_MSG = '@everyone \n# ฝากให้เครดิตที่ <#1371394966265270323>  ด้วยน้าาา';

  // 🔥 U+1F525 , ⏳ U+23F3 (+ optional FE0E/FE0F)
  // ตัดคำนำหน้าที่เป็น 🔥 หรือ ⏳/⏳️ + ขีดทุกชนิด + ช่องว่างยูนิโค้ดออกจาก "หน้าสุด"
  const STRIP_PREFIX_RE =
    /^(?:\u{1F525}|\u{23F3}[\uFE0E\uFE0F]?)+(?:[\p{Zs}]*(?:[\p{Pd}])+)?[\p{Zs}]*/u;

  // helper: ลบ variation selectors เพื่อเช็คขึ้นต้นแบบนิ่ง ๆ
  const normalizeEmojiLeading = (s) => s.replace(/^[\uFE0E\uFE0F]+/, "");

  // =====[ Register Slash Commands (per guild) ]=====
  client.once(Events.ClientReady, async () => {
    try {
      const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
      const appId = client.application?.id ?? client.user.id;

      const commands = [
        { name: CMD_EMBED, description: "เปิดฟอร์มเพื่อส่ง Embed", dm_permission: false },
        { name: CMD_FIX, description: "แก้คำนำหน้า 🔥/⏳️ ของชื่อห้อง", dm_permission: false },
        { name: CMD_S, description: "ลบคำนำหน้าแล้วส่งเครดิตพร้อม @everyone", dm_permission: false },
      ];

      for (const [guildId] of client.guilds.cache) {
        await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
        console.log(`✅ Registered /${CMD_EMBED}, /${CMD_FIX}, /${CMD_S} in ${guildId}`);
      }
    } catch (err) {
      console.error("❌ Command registration error:", err);
    }
  });

  // =====[ Utils ]=====
  const safeReply = async (interaction, payload) => {
    try {
      if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
      return await interaction.reply(payload);
    } catch {}
  };

  const canManageChannel = (guild, channel) => {
    const me = guild?.members?.me;
    if (!me) return false;
    return (
      me.permissionsIn(channel)?.has(PermissionsBitField.Flags.ManageChannels) ||
      me.permissions?.has(PermissionsBitField.Flags.ManageChannels)
    );
  };

  const canMentionEveryone = (guild, channel) => {
    const me = guild?.members?.me;
    if (!me) return false;
    return (
      me.permissionsIn(channel)?.has(PermissionsBitField.Flags.MentionEveryone) ||
      me.permissions?.has(PermissionsBitField.Flags.MentionEveryone)
    );
  };

  // =====[ Single Interaction Handler ]=====
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ---------- /embed ----------
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_EMBED) {
        const modal = new ModalBuilder().setCustomId(MODAL_EMBED).setTitle("สร้าง Embed");

        const titleInput = new TextInputBuilder()
          .setCustomId("title").setLabel("หัวข้อ")
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256);

        const descInput = new TextInputBuilder()
          .setCustomId("message").setLabel("ข้อความ")
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000);

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

      // ---------- /fix ----------
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_FIX) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 1 << 6 }); // EPHEMERAL
        }

        if (!interaction.guild || !interaction.channel) {
          await interaction.editReply("❌ ใช้ในเซิร์ฟเวอร์เท่านั้น");
          return;
        }

        const channel = interaction.channel;
        if (typeof channel.setName !== "function") {
          await interaction.editReply("❌ ห้องนี้เปลี่ยนชื่อไม่ได้ (เช่น Thread/Forum)");
          return;
        }

        const before = channel.name || "";
        const norm = normalizeEmojiLeading(before);

        const startsFire = /^\u{1F525}/u.test(norm);
        const startsHourglass = /^\u{23F3}/u.test(norm); // normalize แล้ว ไม่ต้องสน VS

        let after = before;
        if (startsFire) {
          // 🔥... -> ⏳️...
          after = before.replace(/^\u{1F525}[\uFE0E\uFE0F]?/u, "⏳️").replace(/^\u{1F525}+/u, "⏳️");
        } else if (!startsHourglass) {
          // ไม่ขึ้นด้วย 🔥 หรือ ⏳ → เติม ⏳️-
          after = `⏳️-${before}`;
        }

        if (after === before) {
          await interaction.editReply("ℹ️ ไม่มีการเปลี่ยนแปลงชื่อห้อง");
          return;
        }

        if (!canManageChannel(interaction.guild, channel)) {
          await interaction.editReply("❌ บอทไม่มีสิทธิ์ Manage Channels จึงเปลี่ยนชื่อห้องไม่ได้");
          return;
        }

        try {
          await channel.setName(after, "fix prefix 🔥 → ⏳️ หรือเติม ⏳️-");
          await interaction.editReply(`✅ เปลี่ยนชื่อห้องแล้ว\nก่อน: \`${before}\`\nหลัง:  \`${after}\``);
        } catch (e) {
          console.error("setName(/fix) error:", e);
          await interaction.editReply("❌ เปลี่ยนชื่อห้องไม่สำเร็จ");
        }
        return;
      }

      // ---------- /s ----------
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_S) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 1 << 6 }); // EPHEMERAL
        }

        if (!interaction.guild || !interaction.channel) {
          await interaction.editReply("❌ ใช้ในเซิร์ฟเวอร์เท่านั้น");
          return;
        }

        const channel = interaction.channel;
        const before = channel.name || "";
        const after = before.replace(STRIP_PREFIX_RE, ""); // ตัดได้ทั้ง 🔥 และ ⏳/⏳️ (+ขีด/ช่องว่าง)

        if (after !== before && typeof channel.setName === "function") {
          if (!canManageChannel(interaction.guild, channel)) {
            await interaction.editReply("⚠️ บอทไม่มีสิทธิ์ Manage Channels เลยเปลี่ยนชื่อห้องไม่ได้ แต่จะส่งข้อความให้แทน");
          } else {
            try {
              await channel.setName(after, "remove leading 🔥/⏳ by /s");
            } catch (e) {
              console.error("setName(/s) error:", e);
              await interaction.editReply("⚠️ เปลี่ยนชื่อห้องไม่สำเร็จ แต่จะส่งข้อความแทน");
            }
          }
        }

        // ส่งเครดิต + @everyone (ถ้ามีสิทธิ์ MentionEveryone)
        const allowPing = canMentionEveryone(interaction.guild, channel);
        try {
          await channel.send({
            content: CREDIT_MSG,
            allowedMentions: allowPing ? { parse: ["everyone"] } : { parse: [] },
          });

          const msg =
            after === before
              ? "✅ ส่งข้อความแล้ว (ไม่พบคำนำหน้า 🔥/⏳ ให้ลบ)"
              : `✅ เปลี่ยนชื่อห้อง: \`${before}\` → \`${after}\`\nและส่งข้อความแล้ว`;

          await interaction.editReply(
            allowPing ? msg : `${msg}\nℹ️ แต่บอทไม่มีสิทธิ์ Mention @everyone ในห้องนี้ จึงไม่พิงก์`
          );
        } catch (e) {
          console.error("channel.send error:", e);
          await interaction.editReply("❌ ส่งข้อความไม่สำเร็จ");
        }
        return;
      }

      // ---------- Modal Submit: /embed ----------
      if (interaction.isModalSubmit() && interaction.customId === MODAL_EMBED) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 1 << 6 });
        }

        const title = interaction.fields.getTextInputValue("title").trim();
        const message = interaction.fields.getTextInputValue("message").trim();
        const image = (interaction.fields.getTextInputValue("image") || "").trim();

        const embed = new EmbedBuilder()
          .setTitle(title)
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
          await interaction.editReply("❌ ไม่สามารถส่งในห้องนี้ได้");
          return;
        }

        await interaction.channel.send({ embeds: [embed] });
        await interaction.editReply(`✅ ส่ง Embed แล้ว${warn ? `\n${warn}` : ""}`);
        return;
      }
    } catch (err) {
      console.error("❌ Error in handlers:", err);
      if (interaction.deferred) {
        await interaction.editReply("❌ มีข้อผิดพลาด ลองใหม่อีกครั้ง");
      } else {
        await safeReply(interaction, { content: "❌ มีข้อผิดพลาด ลองใหม่อีกครั้ง", flags: 1 << 6 });
      }
    }
  });
};
