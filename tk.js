// tk.js
module.exports = (client) => {
  const {
    Events,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    PermissionsBitField,
    ChannelType,
    MessageFlags,
  } = require("discord.js");

  // ===== Config =====
  const CMD_TRIGGER = "!tk";
  const CATEGORY_ID = "1410033198397653152";

  const BTN_MODEL_ID = "apply_model";
  const BTN_DISCORD_ID = "apply_discord";
  const BTN_CLOSE_ID = "close_ticket";

  // ===== Helpers =====
  const buildApplyEmbed = () =>
    new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("สมัครพนักงาน")
      .setDescription("กดด้านล่างเพื่อสมัครเป็นพนักงาน")
      .setFooter({ text: "Make by Purple Shop" })
      .setTimestamp();

  const buildButtons = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN_MODEL_ID).setLabel("โมเดล").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BTN_DISCORD_ID).setLabel("ดิสคอร์ส").setStyle(ButtonStyle.Secondary)
    );

  // ส่ง embed เมื่อพิมพ์ !tk แล้วลบข้อความคำสั่งทิ้ง
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;
      if (!msg.content.trim().toLowerCase().startsWith(CMD_TRIGGER)) return;

      const member = await msg.guild.members.fetch(msg.author.id);
      if (
        !member.permissions.has(PermissionsBitField.Flags.ManageChannels) &&
        !member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return msg.reply("❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ (ต้องมี ManageChannels)").catch(() => {});
      }

      await msg.channel.send({ embeds: [buildApplyEmbed()], components: [buildButtons()] });
      msg.delete().catch(() => {});
    } catch (err) {
      console.error("!tk error:", err);
      msg.reply("❌ เกิดข้อผิดพลาดขณะส่งแบบสมัคร").catch(() => {});
    }
  });

  // ปุ่มต่าง ๆ
  client.on(Events.InteractionCreate, async (itx) => {
    try {
      if (!itx.isButton() || !itx.guild) return;

      // ========== เปิดตั๋ว ==========
      if ([BTN_MODEL_ID, BTN_DISCORD_ID].includes(itx.customId)) {
        // ตอบทันทีเพื่อกัน Timeout/Unknown interaction
        await itx.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        // ตรวจ category
        const category =
          itx.guild.channels.cache.get(CATEGORY_ID) ||
          (await itx.guild.channels.fetch(CATEGORY_ID).catch(() => null));

        if (!category || category.type !== ChannelType.GuildCategory) {
          return itx.editReply({ content: "❌ ไม่พบหมวดหมู่ปลายทาง หรือ ID ไม่ใช่ Category" }).catch(() => {});
        }

        const tag = itx.customId === BTN_MODEL_ID ? "โมเดล" : "ดิสคอร์ส";
        const suffix = (Date.now() % 10000).toString().padStart(4, "0");
        const safeUser =
          (itx.user.username || "user")
            .toLowerCase()
            .replace(/[^a-z0-9ก-๙_-]/gi, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "user";
        const baseName = `สมัคร-${tag}-${safeUser}-${suffix}`;

        // สร้างห้องให้เห็นเฉพาะผู้กด + บอท
        const channel = await itx.guild.channels
          .create({
            name: baseName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            topic: `owner:${itx.user.id} / สมัครงานประเภท: ${tag}`,
            permissionOverwrites: [
              { id: itx.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
              {
                id: itx.user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.AttachFiles,
                  PermissionsBitField.Flags.EmbedLinks,
                ],
              },
              {
                id: itx.client.user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.ManageChannels,
                  PermissionsBitField.Flags.EmbedLinks,
                  PermissionsBitField.Flags.AttachFiles,
                ],
              },
            ],
          })
          .catch((e) => {
            console.error("create channel error:", e);
            return null;
          });

        if (!channel) {
          return itx.editReply({ content: "❌ สร้างห้องไม่สำเร็จ กรุณาลองใหม่" }).catch(() => {});
        }

        // ส่งต้อนรับ + ปุ่มปิดตั๋ว
        const welcome = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle(`ตั๋วสมัครพนักงาน (${tag})`)
          .setDescription(
            `สวัสดี <@${itx.user.id}>!\n\nโปรดพิมพ์รายละเอียดการสมัครของคุณในห้องนี้ เช่น:\n` +
              `• ประสบการณ์ที่เกี่ยวข้อง\n` +
              `• ผลงาน/ตัวอย่างงาน (แนบภาพ/ลิงก์ได้)\n` +
              `• ช่วงเวลาที่สะดวกทำงาน\n\nทีมงานจะเข้ามาตอบกลับโดยเร็ว ✨`
          )
          .setFooter({ text: "Make by Purple Shop" })
          .setTimestamp();

        const closeBtn = new ButtonBuilder().setCustomId(BTN_CLOSE_ID).setLabel("ปิดตั๋ว").setStyle(ButtonStyle.Danger);

        await channel
          .send({
            content: `<@${itx.user.id}>`,
            embeds: [welcome],
            components: [new ActionRowBuilder().addComponents(closeBtn)],
          })
          .catch((e) => console.error("send welcome error:", e));

        // แจ้งผลแบบลับ (ใช้ flags แทน ephemeral)
        await itx
          .editReply({ content: `✅ สร้างห้องสำหรับสมัครงานแล้ว: <#${channel.id}>` })
          .catch(() => {});
        return;
      }

      // ========== ปิดตั๋ว ==========
      if (itx.customId === BTN_CLOSE_ID) {
        // ตอบทันทีเพื่อกัน Timeout
        await itx.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const ownerId = itx.channel?.topic?.match(/owner:(\d+)/)?.[1];
        const member = await itx.guild.members.fetch(itx.user.id).catch(() => null);
        const canManage = member?.permissions.has(PermissionsBitField.Flags.ManageChannels);

        if (itx.user.id !== ownerId && !canManage) {
          return itx.editReply({ content: "❌ คุณไม่สามารถปิดตั๋วนี้ได้" }).catch(() => {});
        }

        await itx.editReply({ content: "🛑 กำลังปิดตั๋ว..." }).catch(() => {});
        setTimeout(() => itx.channel?.delete().catch(() => {}), 1200);
        return;
      }
    } catch (err) {
      console.error("button error:", err);
      // อย่าหยุดสคริปต์
      try {
        if (itx?.isRepliable && itx.isRepliable()) {
          // ถ้ายังไม่ตอบ ลองตอบแบบ flags; ถ้าตอบไปแล้วจะเงียบ ๆ
          await (itx.deferred || itx.replied
            ? itx.editReply({ content: "❌ เกิดข้อผิดพลาดในการทำงาน" })
            : itx.reply({ content: "❌ เกิดข้อผิดพลาดในการทำงาน", flags: MessageFlags.Ephemeral })
          );
        }
      } catch (_) {}
    }
  });
};
