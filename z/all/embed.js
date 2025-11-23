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
  const BTN_FIX = "btn_fix_ticket";
  const BTN_CLOSE = "btn_close_ticket";
  const BTN_FIXED_DONE = "btn_fixed_done";

  const ALLOWED_ROLE_IDS = ["1438731622194085939", "1438731808039632967"];
  const STRIP_PREFIX_RE =
    /^(?:\u{1F525}|\u{23F3}[\uFE0E\uFE0F]?)+(?:[\p{Zs}]*(?:[\p{Pd}])+)?[\p{Zs}]*/u;
  const normalizeEmojiLeading = (s) => s.replace(/^[\uFE0E\uFE0F]+/, "");

  const CATEGORY_NORMAL = "1442202522029785118";
  const CATEGORY_FIXING = "1442202615520952473";

  const FIX_DESC =
    "**เขียนข้อมูลในส่งที่จะแก้ได้เลยนะคับ เดี๋ยวทางแอดมินจะมาตอบในไม่ช้า**";
  const CREDIT_FIRST_LINE =
    "# ฝากให้เครดิตที่ <#1439124956901277787>  ด้วยน้าาา";

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
          default_member_permissions: ADMIN,
        },
        {
          name: CMD_S,
          description: "ลบคำนำหน้าแล้วส่งเครดิตพร้อมปุ่ม",
          dm_permission: false,
          default_member_permissions: ADMIN,
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

  const moveChannelToCategory = async (channel, categoryId, reason) => {
    if (!channel || typeof channel.setParent !== "function") return;
    try {
      await channel.setParent(categoryId, { lockPermissions: false, reason });
    } catch (e) {
      console.error("moveChannelToCategory error:", e);
    }
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

  const buildCreditEmbed = () =>
    new EmbedBuilder()
      .setColor(0x9b59b6)
      .setDescription(
        [
          "# ฝากให้เครดิตที่ <#1439124956901277787>  ด้วยน้าาา",
          "## หากแอดออนมีปัญหาให้กด **แก้ไขงาน**",
          "### ตรวจสอบให้แน่ใจว่าแอดออนโอเคแล้ว ให้กดปิดตั๋ว หากให้แก้หลังปิดห้องจะมีค่าแก้ละน้า",
          "### หมายเหตุ : หากมีปัญหาโดยที่แอดมินไม่ได้ผิด ต้องเสียค่าแก้คับ",
          "## หากจะสั่งเพิ่มต้องเปิดตั๋วใหม่น้าา",
        ].join("\n")
      )
      .setFooter({ text: "Make by Purple Shop" })
      .setTimestamp();

  const CREDIT_ROW = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN_FIX).setLabel("แก้ไขงาน").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BTN_CLOSE).setLabel("ปิดตั๋ว").setStyle(ButtonStyle.Danger)
    );

  const deleteOldFlowMessages = async (channel) => {
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const toDelete = [];
      for (const m of messages.values()) {
        if (!m.embeds || !m.embeds.length) continue;
        const desc = m.embeds[0].description || "";
        if (!desc) continue;
        if (desc.includes(FIX_DESC) || desc.startsWith(CREDIT_FIRST_LINE)) {
          toDelete.push(m);
        }
      }
      for (const m of toDelete) {
        try {
          await m.delete().catch(() => {});
        } catch {}
      }
    } catch (e) {
      console.error("deleteOldFlowMessages error:", e);
    }
  };

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
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
          await moveChannelToCategory(channel, CATEGORY_FIXING, "/fix → move to fixing category");
          await interaction.editReply("✅ แก้คำนำหน้าเรียบร้อย และย้ายไปหมวดแก้งานแล้ว");
        } catch (e) {
          console.error("setName(/fix) error:", e);
          await interaction.editReply("❌ เปลี่ยนชื่อห้องไม่สำเร็จ");
        }
        return;
      }

      if (interaction.isChatInputCommand() && interaction.commandName === CMD_S) {
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
        if (canManageChannel(interaction.guild, channel)) {
          await moveChannelToCategory(channel, CATEGORY_NORMAL, "/s → move back to normal category");
        }
        const allowPing = canMentionEveryone(interaction.guild, channel);
        const creditEmbed = buildCreditEmbed();
        const row = CREDIT_ROW();
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

      if (interaction.isButton() && interaction.customId === BTN_FIX) {
        try {
          const channel = interaction.channel;
          if (!channel) return;

          const before = channel.name || "";
          const norm = normalizeEmojiLeading(before);
          const hasHourglass = /^\u{23F3}/u.test(norm);
          const inFixCategory = channel.parentId === CATEGORY_FIXING;

          if (hasHourglass && inFixCategory) {
            await safeReply(interaction, { content: "กดซ้ำไม", flags: 1 << 6 });
            return;
          }

          await interaction.deferUpdate().catch(() => {});

          if (canManageChannel(interaction.guild, channel)) {
            await doFixRename(channel).catch(() => {});
            await moveChannelToCategory(
              channel,
              CATEGORY_FIXING,
              "BTN_FIX → move to fixing category"
            );
          }

          const ROLE_TO_PING = "1438723520740724786";
          const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setDescription(FIX_DESC)
            .setFooter({ text: "Make by Purple Shop" })
            .setTimestamp();
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(BTN_FIXED_DONE)
              .setLabel("แก้ละะะ")
              .setStyle(ButtonStyle.Danger)
          );
          await channel.send({
            content: `<@&${ROLE_TO_PING}>`,
            allowedMentions: { roles: [ROLE_TO_PING] },
            embeds: [embed],
            components: [row],
          });
        } catch (e) {
          console.error("BTN_FIX error:", e);
        }
        return;
      }

      if (interaction.isButton() && interaction.customId === BTN_FIXED_DONE) {
        try {
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return safeReply(interaction, {
              content: "❌ ปุ่มนี้กดได้เฉพาะแอดมินนะ",
              flags: 1 << 6,
            });
          }

          await interaction.deferUpdate().catch(() => {});
          const channel = interaction.channel;
          if (channel && canManageChannel(interaction.guild, channel)) {
            await moveChannelToCategory(
              channel,
              CATEGORY_NORMAL,
              "BTN_FIXED_DONE → move back to normal"
            );

            const before = channel.name || "";
            const after = before.replace(STRIP_PREFIX_RE, "");
            if (after !== before && typeof channel.setName === "function") {
              try {
                await channel.setName(after, "BTN_FIXED_DONE remove prefix");
              } catch {}
            }
          }

          if (channel) {
            await deleteOldFlowMessages(channel);
            const allowPing = canMentionEveryone(interaction.guild, channel);
            const creditEmbed = buildCreditEmbed();
            const row = CREDIT_ROW();
            await channel.send({
              content: "@everyone",
              allowedMentions: allowPing ? { parse: ["everyone"] } : { parse: [] },
              embeds: [creditEmbed],
              components: [row],
            });
          }

          await safeReply(interaction, {
            content: "✅ ลบข้อความแก้งานเก่า รีเซ็ตชื่อห้อง และส่งเครดิตใหม่แล้ว",
            flags: 1 << 6,
          });
        } catch (e) {
          console.error("BTN_FIXED_DONE error:", e);
        }
        return;
      }

      if (interaction.isButton() && interaction.customId === BTN_CLOSE) {
        try {
          await interaction.deferUpdate().catch(() => {});
          const channel = interaction.channel;
          if (channel && canManageChannel(interaction.guild, channel)) {
            await channel.delete("Close ticket by button (anyone)").catch(() => {});
          }
        } catch (e) {
          console.error("BTN_CLOSE error:", e);
        }
        return;
      }

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
        await safeReply(interaction, {
          content: "❌ มีข้อผิดพลาด ลองใหม่อีกครั้ง",
          flags: 1 << 6,
        });
      }
    }
  });
};
