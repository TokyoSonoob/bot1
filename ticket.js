const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { db } = require("./firebase");

const CATEGORY_ID = "1386294803364315147";
const summaryMessages = new Map();
const formMessages = new Map();
function createFormButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_form")
      .setLabel("กรอกข้อมูลเพิ่มเติม")
      .setStyle(ButtonStyle.Success)
  );
}


module.exports = function (client) {
client.on("messageCreate", async (message) => {
  if (message.content.startsWith("!ticket")) {
    const args = message.content.split(" ");
    const categoryId = args[1];

    if (!categoryId) {
      return message.reply("❌ กรุณาระบุรหัสหมวดหมู่ เช่น `!ticket 123456789`");
    }

    const guildId = message.guild.id;

    // ✔️ เปลี่ยนเป็น path: ticket_settings/<guildId>
    await db.doc(`ticket_settings/${guildId}`).set({ categoryId });

    const embed = new EmbedBuilder()
      .setTitle("สั่งงานแอดออนสกิน")
      .setDescription("กดตั๋วเพื่อสั่งงานแอดออน")
      .setColor(0x9b59b6)
      .setImage("https://giffiles.alphacoders.com/220/220120.gif")
      .setFooter({ text: "Make by Purple Shop" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`create_ticket_`) // ปุ่มเดียว
        .setLabel("สั่งงาน")
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.reply(`✅ ตั้งค่าหมวดหมู่เรียบร้อยแล้ว: \`${categoryId}\``);
  }
});



  // ฟังการกดปุ่ม/เลือกเมนู
  client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
  if (interaction.customId.startsWith("create_ticket_")) {
    const guildId = interaction.guild.id;

    const doc = await db.doc(`ticket_settings/${guildId}`).get();

if (!doc.exists || !doc.data().categoryId) {
  return interaction.reply({
    content: "❌ ยังไม่ได้ตั้งค่าหมวดหมู่สำหรับเซิร์ฟเวอร์นี้",
    ephemeral: true,
  });
}

const categoryId = doc.data().categoryId;

// ✅ Validate อีกชั้น
if (!/^\d{17,20}$/.test(categoryId)) {
  return interaction.reply({
    content: "❌ หมวดหมู่ที่ตั้งไว้ไม่ถูกต้อง (ไม่ใช่ Snowflake)",
    ephemeral: true,
  });
}


    // ใช้ categoryId จาก Firebase
    const channel = await interaction.guild.channels.create({
      name: `🔥-𝕋𝕚𝕔𝕜𝕖𝕥_${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
          ],
        },
      ],
    });

        // ปุ่มปิดห้อง
        const closeEmbed = new EmbedBuilder()
          .setTitle("ขอบคุณที่ไว้ใจร้านเรา")
          .setDescription("กรอกข้อมูลที่ด้านล่างได้เลยนะคับ")
          .setColor(0x9b59b6)

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("ปิดตั๋ว")
            .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [closeEmbed],
          components: [closeRow],
        });

        // เมนูให้เลือกว่าจะเอาอะไรบ้าง
// เมนูให้เลือกว่าจะเอาอะไรบ้าง
const optionEmbed = new EmbedBuilder()
  .setTitle("สิ่งที่ต้องการ")
  .setDescription("เลือกออฟชั่นที่คุณต้องการในงานนี้ หรือกด 'ไม่มีออฟชั่น'")
  .setColor(0x9b59b6);

// ปุ่ม "ไม่มีออฟชั่น"
const noOptionButton = new ButtonBuilder()
  .setCustomId("no_options")
  .setLabel("ไม่มีออฟชั่น")
  .setStyle(ButtonStyle.Secondary);

// เมนูเลือกออฟชั่น
const selectMenu = new StringSelectMenuBuilder()
  .setCustomId("select_features")
  .setPlaceholder("เลือกออฟชั่น")
  .setMinValues(1)
  .setMaxValues(8)
  .addOptions(
    { label: "ผมขยับ", value: "hair_move" },
    { label: "ผมขยับยาว", value: "long_hair_move" },
    { label: "ตากระพริบ", value: "eye_blink" },
    { label: "ตากระพริบใหม่", value: "eye_blink_new" },
    { label: "หน้าอก", value: "boobs" },
    { label: "ปอยปม", value: "bangs" },
    { label: "ตาเรืองแสง", value: "glow_eye" },
    { label: "ตาขยับ", value: "eye_move" }
  );

// รวมปุ่ม + select menu ใน 2 row
const selectRow = new ActionRowBuilder().addComponents(selectMenu);
const buttonRow = new ActionRowBuilder().addComponents(noOptionButton);

await channel.send({
  embeds: [optionEmbed],
  components: [selectRow, buttonRow],
});


        await interaction.reply({
          content: `✅ เปิดตั๋วให้แล้วที่ ${channel}`,
          ephemeral: true,
        });
      }

      // ปุ่มปิดห้อง
      if (interaction.customId === "close_ticket") {
  const member = interaction.guild.members.cache.get(interaction.user.id);

  // เช็คว่าเป็นแอดมินหรือมี permission จัดการห้อง
  if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await interaction.reply({
      content: "❌ คุณไม่มีสิทธิ์ในการปิดตั๋วนี้",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "⏳ กำลังปิดห้องนี้...",
    ephemeral: true,
  });
    interaction.channel.delete().catch(console.error);
}


if (interaction.customId === "no_options") {
  const addonPrice = 30;
  await interaction.deferUpdate();
  const oldMessage = summaryMessages.get(interaction.user.id);
  if (oldMessage && oldMessage.deletable) {
    await oldMessage.delete().catch(() => {});
  }
const msg = await interaction.channel.send({
  content: `<@${interaction.user.id}>\n# เลือกไม่มีออฟชั่น\n**• ค่าแอดออน: ${addonPrice} บาท**\n## โอนเงินได้ที่ \n## <#1371395778727383040>`,
  components: [createFormButton()],  // <-- เพิ่มตรงนี้
});


  summaryMessages.set(interaction.user.id, msg);
}



    }

    // ตัวเลือกจาก Select Menu
    if (interaction.customId === "select_features") {
  const labels = {
    hair_move: "ผมขยับ",
    long_hair_move: "ผมขยับยาว",
    eye_blink: "ตากระพริบ",
    eye_blink_new: "ตากระพริบใหม่",
    boobs: "หน้าอก",
    bangs: "ปอยปม",
    glow_eye: "ตาเรืองแสง",
    eye_move: "ตาขยับ",
  };

  const prices = {
    hair_move: 30,
    long_hair_move: 70,
    eye_blink: 25,
    eye_blink_new: 35,
    boobs: 25,
    bangs: 30,
    glow_eye: 35,
    eye_move: 100,
  };

  let selected = interaction.values;

  if (selected.includes("hair_move") && selected.includes("long_hair_move")) {
    selected = selected.filter((v) => v !== "hair_move");
  }
  if (selected.includes("eye_blink") && selected.includes("eye_blink_new")) {
    selected = selected.filter((v) => v !== "eye_blink");
  }

  let totalPrice = 0;
  const detailList = selected.map((v) => {
    const price = prices[v] || 0;
    totalPrice += price;
    return `• ${labels[v]}: ${price} บาท`;
  }).join("\n");

  const addonPrice = 30;
  totalPrice += addonPrice;
  const detailListWithAddon = `• ค่าแอดออน: ${addonPrice} บาท\n` + detailList;

  await interaction.deferUpdate();

  // ลบข้อความสรุปก่อนหน้า (ถ้ามี)
  const oldMessage = summaryMessages.get(interaction.user.id);
  if (oldMessage && oldMessage.deletable) {
    await oldMessage.delete().catch(() => {});
  }

const msg = await interaction.channel.send({
  content: `<@${interaction.user.id}>\n# ออฟชั่น\n**${detailListWithAddon}\n\nรวมราคา: ${totalPrice} บาท**\n## โอนเงินได้ที่ \n## <#1371395778727383040>`,
  components: [createFormButton()],  // <-- เพิ่มตรงนี้
});


  summaryMessages.set(interaction.user.id, msg);
}

if (interaction.isButton() && interaction.customId === 'open_form') {
    const modal = new ModalBuilder()
      .setCustomId('skin_order_form')
      .setTitle('ฟอร์มข้อมูลเพิ่มเติม');

    const xboxInput = new TextInputBuilder()
      .setCustomId('xbox_name')
      .setLabel('ชื่อ Xbox')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const lockInput = new TextInputBuilder()
      .setCustomId('lock_option')
      .setLabel('ล็อกให้ใช้ได้คนเดียวไหม (ใช่/ไม่ใช่)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const slotInput = new TextInputBuilder()
      .setCustomId('slot')
      .setLabel('ใส่ช่องไหน (หมวก/เกราะ/กางเกง/รองเท้า)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(xboxInput),
      new ActionRowBuilder().addComponents(lockInput),
      new ActionRowBuilder().addComponents(slotInput)
    );

    await interaction.showModal(modal);
  }
  

    if (interaction.isModalSubmit()) {
    if (interaction.isModalSubmit()) {
  if (interaction.customId === 'skin_order_form') {
    const xboxName = interaction.fields.getTextInputValue('xbox_name');
    const lockOption = interaction.fields.getTextInputValue('lock_option');
    const slot = interaction.fields.getTextInputValue('slot');

    // สร้าง key เฉพาะ user + channel
    const key = interaction.user.id + "-" + interaction.channel.id;

    // ลบข้อความฟอร์มเก่า (ถ้ามี)
    const oldMsg = formMessages.get(key);
    if (oldMsg && oldMsg.deletable) {
      await oldMsg.delete().catch(() => {});
    }
    const newMsg = await interaction.channel.send({
      content: `<@${interaction.user.id}>\n\n## ชื่อ Xbox : ${xboxName}\n## ล็อกให้ใช้ได้คนเดียวไหม : ${lockOption}\n## ช่องที่ใส่ : ${slot}`,
    });
    formMessages.set(key, newMsg);
    await interaction.deferUpdate();
  }
}
  }


  });
};
