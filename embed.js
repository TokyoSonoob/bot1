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
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
  } = require("discord.js");

  const CMD_EMBED = "embed";
  const CMD_FIX = "fix";
  const CMD_S = "s";
  const MODAL_EMBED = "embed_form_modal";

  // ปุ่ม
  const BTN_FIX = "btn_fix_ticket";
  const BTN_CLOSE = "btn_close_ticket";

  // role ที่กดปุ่มได้ (ทุกคนเห็นปุ่ม แต่กดได้เฉพาะคนมีสิทธิ์)
  const ALLOWED_ROLE_IDS = ["1413865323337093300", "1413570692330426408"];

  // ตัดคำนำหน้า 🔥/⏳ (+ขีด/ช่องว่าง) ออกจากหัวชื่อห้อง
  const STRIP_PREFIX_RE =
    /^(?:\u{1F525}|\u{23F3}[\uFE0E\uFE0F]?)+(?:[\p{Zs}]*(?:[\p{Pd}])+)?[\p{Zs}]*/u;

  const normalizeEmojiLeading = (s) => s.replace(/^[\uFE0E\uFE0F]+/, "");

  client.once(Events.ClientReady, async () => {
    try {
      const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
      const appId = client.application?.id ?? client.user.id;
      const ADMIN = String(PermissionsBitField.Flags.Administrator);

      const commands = [
        { name: CMD_EMBED, description: "เปิดฟอร์มเพื่อส่ง Embed", dm_permission: false },
        {
          name: CMD_FIX,
          description: "แก้คำนำหน้า 🔥/⏳️ ของชื่อห้อง",
          dm_permission: false,
          default_member_permissions: ADMIN, // แอดมินเท่านั้น
        },
        {
          name: CMD_S,
          description: "ลบคำนำหน้าแล้วส่งเครดิตพร้อมปุ่ม",
          dm_permission: false,
          default_member_permissions: ADMIN, // แอดมินเท่านั้น
        },
      ];

      for (const [guildId] of client.guilds.cache) {
        await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
        console.log(`✅ Registered /${CMD_EMBED}, /${CMD_FIX}, /${CMD_S} in ${guildId}`);
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

  const isAllowed = (member) => {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some((r) => ALLOWED_ROLE_IDS.includes(r.id));
  };

  const doFixRename = async (channel) => {
    const before = channel.name || "";
    const norm = normalizeEmojiLeading(before);
    const startsFire = /^\u{1F525}/u.test(norm);
    const startsHourglass = /^\u{23F3}/u.test(norm);
    let after = before;
    if (startsFire) {
      after = before.replace(/^\u{1F525}[\uFE0E\uFE0F]?/u, "⏳️").replace(/^\u{1F525}+/u, "⏳️");
    } else if (!startsHourglass) {
      after = `⏳️-${before}`;
    }
    if (after !== before) {
      await channel.setName(after, "fix prefix 🔥 → ⏳️ หรือเติม ⏳️-");
    }
  };

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ===== /embed =====
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_EMBED) {
        const modal = new ModalBuilder().setCustomId(MODAL_EMBED).setTitle("สร้าง Embed");

        const titleInput = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("หัวข้อ")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256);

        const descInput = new TextInputBuilder()
          .setCustomId("message")
          .setLabel("ข้อความ")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000);

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

      // ===== /fix (admin only) =====
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_FIX) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          return safeReply(interaction, { content: "❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน", flags: 1 << 6 });
        }
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 1 << 6 });
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
        if (!canManageChannel(interaction.guild, channel)) {
          await interaction.editReply("❌ บอทไม่มีสิทธิ์ Manage Channels จึงเปลี่ยนชื่อห้องไม่ได้");
          return;
        }
        try {
          await doFixRename(channel);
          await interaction.editReply("✅ แก้คำนำหน้าเรียบร้อย");
        } catch (e) {
          console.error("setName(/fix) error:", e);
          await interaction.editReply("❌ เปลี่ยนชื่อห้องไม่สำเร็จ");
        }
        return;
      }

      // ===== /s (admin only) =====
      if (interaction.isChatInputCommand() && interaction.commandName === CMD_S) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          return safeReply(interaction, { content: "❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน", flags: 1 << 6 });
        }

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 1 << 6 }); // EPHEMERAL
        }
        if (!interaction.guild || !interaction.channel) {
          await interaction.editReply("❌ ใช้ในเซิร์ฟเวอร์เท่านั้น");
          return;
        }

        const channel = interaction.channel;
        const before = channel.name || "";
        const after = before.replace(STRIP_PREFIX_RE, "");

        if (after !== before && typeof channel.setName === "function") {
          if (canManageChannel(interaction.guild, channel)) {
            try {
              await channel.setName(after, "remove leading 🔥/⏳ by /s");
            } catch (e) {
              console.error("setName(/s) error:", e);
            }
          }
        }

        // ส่ง @everyone + embed + ปุ่ม (ทุกคนเห็น)
        const allowPing = canMentionEveryone(interaction.guild, channel);
        const creditEmbed = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setDescription(
            [
              "# ฝากให้เครดิตที่ <#1371394966265270323>  ด้วยน้าาา",
              "## หากแอดออนมีปัญหาให้กด **แก้ไขงาน**",
              "### ตรวจสอบให้แน่ใจว่าแอดออนโอเคแล้ว ให้กดปิดตั๋ว หากให้แก้หลังปิดห้องจะมีค่าแก้ละน้า",
              "### หมายเหตุ : หากมีปัญหาโดยที่แอดมินไม่ได้ผิด ต้องเสียค่าแก้คับ",
              "## หากจะสั่งเพิ่มต้องเปิดตั๋วใหม่น้าา",
            ].join("\n")
          )
          .setFooter({ text: "Make by Purple Shop" })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(BTN_FIX).setLabel("แก้ไขงาน").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(BTN_CLOSE).setLabel("ปิดตั๋ว").setStyle(ButtonStyle.Danger)
        );

        try {
          await channel.send({
            content: "@everyone",
            allowedMentions: allowPing ? { parse: ["everyone"] } : { parse: [] },
            embeds: [creditEmbed],
            components: [row],
          });
          await interaction.editReply("✅ ส่งเครดิต + ปุ่มเรียบร้อย");
        } catch (e) {
          console.error("channel.send error:", e);
          await interaction.editReply("❌ ส่งข้อความไม่สำเร็จ");
        }
        return;
      }

      // ===== ปุ่ม: แก้ไขงาน =====
      if (interaction.isButton() && interaction.customId === BTN_FIX) {
        try {
          // ให้ทุกคนเห็นปุ่ม แต่กดได้เฉพาะแอดมิน/role ที่กำหนด — ถ้าไม่ใช่ ให้เงียบ (ไม่มีข้อความตอบกลับ)
          if (!isAllowed(interaction.member)) {
            await interaction.deferUpdate().catch(() => {});
            return;
          }
          await interaction.deferUpdate().catch(() => {});
          const channel = interaction.channel;
          if (channel && canManageChannel(interaction.guild, channel)) {
            await doFixRename(channel).catch(() => {});
          }
        } catch (e) {
          console.error("BTN_FIX error:", e);
        }
        return;
      }

      // ===== ปุ่ม: ปิดตั๋ว (ลบห้อง) =====
      if (interaction.isButton() && interaction.customId === BTN_CLOSE) {
        try {
          if (!isAllowed(interaction.member)) {
            await interaction.deferUpdate().catch(() => {});
            return;
          }
          await interaction.deferUpdate().catch(() => {});
          const channel = interaction.channel;
          if (channel && canManageChannel(interaction.guild, channel)) {
            await channel.delete("Close ticket by button").catch(() => {});
          }
        } catch (e) {
          console.error("BTN_CLOSE error:", e);
        }
        return;
      }

      // ===== Modal Submit: /embed =====
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
