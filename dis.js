// tickets-dis.js
const {
  Events,
  PermissionsBitField,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = function (client) {
  const CATEGORY_ID = "1412444521748234351";
  const STAFF_ROLE_ID = "1412438788612948028";
  const PRICE_CHANNELS = "1412441581746782359";
  const TAG_MARKUS = "1260596435314020355";
  const TAG_MIKA = "1281587649513259087";

  const BTN_MARKUS = "dis_create_markus";
  const BTN_MIKA = "dis_create_mika";
  const BTN_CLOSE = "dis_close_room";
  const BTN_OPEN_FORM = "dis_open_form";
  const MODAL_ID = "dis_modal";
  const FIELD_NAME = "dis_name";
  const FIELD_THEME = "dis_theme";
  const FIELD_BOTS = "dis_bots";
  const FIELD_ROLE = "dis_role";
  const FIELD_ROOMS = "dis_addrooms";

  // ---------- helpers ----------
  async function safeReply(interaction, options) {
    try {
      if (interaction.deferred || interaction.replied) {
        return await interaction.followUp(options);
      }
      return await interaction.reply(options);
    } catch (e) {
      // fallback เล็กน้อย ป้องกัน Unknown interaction ซ้ำ
      try { return await interaction.followUp(options); } catch {}
    }
  }

  function makeStartEmbed() {
    return new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("สั่งงานดิสคอร์ส")
      .setImage("https://i.pinimg.com/originals/1e/68/4d/1e684d15ad21997f1a92adfae922cfe5.gif")
      .setDescription(`ดูเรทราคาได้ที่ <#${PRICE_CHANNELS}>`);
  }

  function makeStartRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN_MARKUS).setStyle(ButtonStyle.Primary).setLabel("ลายเส้นมาคัส"),
      new ButtonBuilder().setCustomId(BTN_MIKA).setStyle(ButtonStyle.Secondary).setLabel("ลายเส้นมิกะ")
    );
  }

  function makeRoomIntroEmbed(modeLabel) {
    return new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("ตั๋วสั่งดิสคอร์ส")
      .setDescription(`รูปแบบ **${modeLabel}**\nพนักงานจะมาตอบข้อความให้น้าาา กรอกข้อมูลไว้เลออออ\n`)
      .setFooter({ text: "Make by Purple Shop" })
      .setTimestamp();
  }

  function makeCloseRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN_CLOSE).setStyle(ButtonStyle.Danger).setLabel("ปิดห้อง")
    );
  }

  function makeDetailEmbed() {
    return new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle("รายละเอียดที่ต้องการ")
      .setDescription(
        [
          "꒷︶꒷꒥꒷‧₊˚꒷︶꒷꒥꒷‧₊˚꒷︶꒷꒥꒷‧₊˚꒷︶꒷꒥꒷‧₊˚",
          "",
          "                         **꒰ สั่งงานดิส ꒱**",
          "",
          "- ชื่อเซิฟเวอร์ :",
          "- สร้างดิส /ทำบอท :",
          "- ธีม :",
          "- ชื่อยศต่างๆ (สมาชิก แอดมิน เจ้าของเซิฟเวอร์ ฯลฯ) :",
          "- บอทในเซิฟเวอร์ :",
          "",
          "***– งดคุณลูกค้าปิดทิ๊กกรุณารอแอดมินมาปิดให้เท่านั้น !! –***",
          "",
          "꒷︶꒷꒥꒷‧₊˚꒷︶꒷꒥꒷‧₊˚꒷︶꒷꒥꒷‧₊˚꒷︶꒷꒥꒷‧₊˚",
        ].join("\n")
      );
  }

  function makeOpenFormRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN_OPEN_FORM).setStyle(ButtonStyle.Success).setLabel("กรอกข้อมูลดิส")
    );
  }

  function makeFormModal() {
    return new ModalBuilder()
      .setCustomId(MODAL_ID)
      .setTitle("ฟอร์มสั่งดิสคอร์ส")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(FIELD_NAME)
            .setLabel("ชื่อเซิฟเวอร์")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(FIELD_THEME)
            .setLabel("สร้างดิส/ทำบอท")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(FIELD_BOTS)
            .setLabel("ธีม")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(FIELD_ROLE)
            .setLabel("ยศของดิส (เจ้าของ, แอดมิน, ลูกดิส)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(FIELD_ROOMS)
            .setLabel("บอทในเซิฟเวอร์")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );
  }

  // !dis
  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (msg.content.trim() === "!dis") {
      await msg.channel.send({ embeds: [makeStartEmbed()], components: [makeStartRow()] });
    }
  });

  // Interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton()) {
        // ----- Create ticket (DEFER FIRST!) -----
        if ([BTN_MARKUS, BTN_MIKA].includes(interaction.customId)) {
          await interaction.deferReply({ ephemeral: true }); // << ป้องกัน 10062

          const isMarkus = interaction.customId === BTN_MARKUS;
          const roomName = isMarkus ? "ดิสคอร์สมาคัส" : "ดิสคอร์สมิกะ";
          const tagTarget = isMarkus ? TAG_MARKUS : TAG_MIKA;

          const ch = await interaction.guild.channels.create({
            name: roomName,
            parent: CATEGORY_ID,
            type: 0, // text
            topic: `owner:${interaction.user.id}`,
            permissionOverwrites: [
              { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
              {
                id: STAFF_ROLE_ID,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.AttachFiles,
                  PermissionsBitField.Flags.EmbedLinks,
                ],
              },
              {
                id: interaction.user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.AttachFiles,
                  PermissionsBitField.Flags.EmbedLinks,
                ],
              },
              {
                id: client.user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.ManageChannels,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.AttachFiles,
                  PermissionsBitField.Flags.EmbedLinks,
                ],
              },
            ],
          });

          await ch.send({
            content: `<@${interaction.user.id}> <@${tagTarget}>`,
            embeds: [makeRoomIntroEmbed(isMarkus ? "ลายเส้นมาคัส" : "ลายเส้นมิกะ")],
            components: [makeCloseRow()],
          });

          await ch.send({ embeds: [makeDetailEmbed()], components: [makeOpenFormRow()] });

          // ตอบกลับที่ defer ไว้
          await interaction.editReply({ content: `สร้างห้อง <#${ch.id}> เรียบร้อย` });
          return;
        }

        // ----- Close room -----
        if (interaction.customId === BTN_CLOSE) {
          // ตอบเร็วๆ พอ
          const ch = interaction.channel;
          if (!ch) return;
          const isManager = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
          const isOwner = ch.topic?.includes(`owner:${interaction.user.id}`);
          if (!isManager && !isOwner) {
            return safeReply(interaction, { content: "คุณไม่มีสิทธิ์ปิดห้องนี้", ephemeral: true });
          }
          await safeReply(interaction, { content: "กำลังปิดห้อง...", ephemeral: true });
          await ch.delete().catch(() => {});
          return;
        }

        // ----- Open form (must be within 3s) -----
        if (interaction.customId === BTN_OPEN_FORM) {
          return interaction.showModal(makeFormModal());
        }
      }

      // ----- Modal submit (fast) -----
      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        const name = interaction.fields.getTextInputValue(FIELD_NAME);
        const theme = interaction.fields.getTextInputValue(FIELD_THEME);
        const bots = interaction.fields.getTextInputValue(FIELD_BOTS);
        const role = interaction.fields.getTextInputValue(FIELD_ROLE);
        const rooms = interaction.fields.getTextInputValue(FIELD_ROOMS);

        const channelName = interaction.channel?.name || "";
        const tagTarget = /มาคัส/.test(channelName) ? TAG_MARKUS : TAG_MIKA;

        const summary = new EmbedBuilder()
          .setColor(0x7f46c6)
          .setTitle("สรุปรายละเอียดการสั่งดิสคอร์ส")
          .setDescription(
            `**ชื่อเซิฟเวอร์:** ${name}\n**สร้างดิสหรือทำบอท:** ${theme}\n**ธีม:** ${bots || "-"}\n**ชื่อยศที่ต้องการ:** ${role}\n**บอทในเซิฟเวอร์:** ${rooms || "-"}`
          )
          .setFooter({ text: "Make by Purple Shop" })
          .setTimestamp();

        await interaction.reply({
          content: `<@${interaction.user.id}> <@${tagTarget}>`,
          embeds: [summary],
        });
        return;
      }
    } catch (err) {
      console.error("Interaction error:", err);
      try {
        if (interaction.isRepliable() && !(interaction.deferred || interaction.replied)) {
          await interaction.reply({ content: "เกิดข้อผิดพลาด โปรดลองอีกครั้ง", ephemeral: true });
        }
      } catch {}
    }
  });
};
