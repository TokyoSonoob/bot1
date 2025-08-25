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

// ==== STATE ====
const summaryMessages = new Map(); // key: `${userId}-${channelId}` -> last summary message
const formMessages = new Map();    // key: `${userId}-${channelId}` -> last form message
const userTotals    = new Map();   // key: `${userId}-${channelId}` -> number (subtotal ยังไม่รวม base)
const userDetails   = new Map();   // key: `${userId}-${channelId}` -> string[] รายการย่อย
const ticketModes   = new Map();   // key: `${userId}-${channelId}` -> 'standard'|'bundle'|'preset'

const PAY_CHANNEL_ID = "1371395778727383040";
const ADDON_BASE_PRICE = 30; // นับเฉพาะโหมด standard

const labels = {
  hair_move: "ผมขยับ",
  long_hair_move: "ผมขยับยาว",
  eye_blink: "ตากระพริบ",
  eye_blink_new: "ตากระพริบใหม่",
  boobs: "หน้าอก",
  bangs: "ปอยผม",
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

function keyOf(userId, channelId) {
  return `${userId}-${channelId}`;
}
function initState(userId, channelId, mode) {
  const k = keyOf(userId, channelId);
  userTotals.set(k, 0);
  userDetails.set(k, []);
  ticketModes.set(k, mode);
  return k;
}
function setSubtotal(k, val) {
  userTotals.set(k, Math.max(0, Number(val) || 0));
}
function setDetails(k, lines) {
  userDetails.set(k, Array.isArray(lines) ? lines : []);
}
function createFormButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_form")
      .setLabel("กรอกข้อมูลเพิ่มเติม ใครไม่กรอกเป็นเก")
      .setStyle(ButtonStyle.Success)
  );
}
async function postOrReplaceSummary(interaction, title = null) {
  const k = keyOf(interaction.user.id, interaction.channel.id);
  const mode = ticketModes.get(k) || "standard";
  const details = userDetails.get(k) || [];
  let total = userTotals.get(k) || 0;

  const lines = [];
  if (title) lines.push(`# ${title}`);
  else lines.push("# สรุปรายการ");

  // บวกค่าแอดออนพื้นฐานเฉพาะโหมด standard
  if (mode === "standard") {
    lines.push(`**• ค่าแอดออน: ${ADDON_BASE_PRICE} บาท**`);
    total += ADDON_BASE_PRICE;
  }

  if (details.length) lines.push(...details);
  lines.push(`\n**รวมราคา: ${total} บาท**`);
  lines.push(`## โอนเงินได้ที่`);
  lines.push(`## <#${PAY_CHANNEL_ID}>`);

  // 🔸 แสดงปุ่มฟอร์มเฉพาะโหมด standard เท่านั้น
  const components = mode === "standard" ? [createFormButton()] : [];

  const old = summaryMessages.get(k);
  if (old && old.deletable) {
    await old.delete().catch(() => {});
  }
  const msg = await interaction.channel.send({
    content: `<@${interaction.user.id}>\n` + lines.join("\n"),
    components,
  });
  summaryMessages.set(k, msg);
}


// ==== MAIN MODULE ====
module.exports = function (client) {
  // ตั้งค่า !ticket
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith("!ticket")) return;

    const args = message.content.trim().split(/\s+/);
    const categoryId = args[1];
    if (!categoryId) {
      return message.reply("❌ กรุณาระบุรหัสหมวดหมู่ เช่น `!ticket 123456789`");
    }
    const guildId = message.guild.id;
    await db.doc(`ticket_settings/${guildId}`).set({ categoryId });

    const embed = new EmbedBuilder()
      .setTitle("สั่งงานแอดออนสกิน")
      .setDescription("**แอดออนสกินดูเรทราคาได้ที่ <#1406520839880445962>\nรวมแอดออนสกิน สกินละ10บาทสนใจกดตั๋วเลย**")
      .setColor(0x9b59b6)
      .setImage("https://giffiles.alphacoders.com/220/220120.gif")
      .setFooter({ text: "Make by Purple Shop" });

    // 3 ปุ่ม: สร้างห้องเหมือนกัน แต่ UI ในห้องต่างกัน
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("create_ticket_standard").setLabel("ทำแอดออนสกิน").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("create_ticket_bundle").setLabel("รวมแอดออนสกิน").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("create_ticket_preset").setLabel("โมเดลสำเร็จ").setStyle(ButtonStyle.Primary),
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.reply(`✅ ตั้งค่าหมวดหมู่เรียบร้อยแล้ว: \`${categoryId}\``);
  });

  // ฟังก์ชันสร้างห้อง
  async function createTicketChannel(interaction, mode) {
    const guildId = interaction.guild.id;
    const doc = await db.doc(`ticket_settings/${guildId}`).get();
    if (!doc.exists || !doc.data().categoryId) {
      await interaction.reply({ content: "❌ ยังไม่ได้ตั้งค่าหมวดหมู่สำหรับเซิร์ฟเวอร์นี้", ephemeral: true });
      return null;
    }
    const categoryId = doc.data().categoryId;
    if (!/^\d{17,20}$/.test(categoryId)) {
      await interaction.reply({ content: "❌ หมวดหมู่ที่ตั้งไว้ไม่ถูกต้อง (ไม่ใช่ Snowflake)", ephemeral: true });
      return null;
    }

    const channel = await interaction.guild.channels.create({
      name: `🔥-𝕋𝕚𝕔𝕜𝕖𝕥_${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
      ],
    });

    // init state ผูกกับห้องนี้เท่านั้น
    initState(interaction.user.id, channel.id, mode);

    const openEmbed = new EmbedBuilder()
      .setTitle("ขอบคุณที่ไว้ใจร้านเรา")
      .setDescription("กรอก/เลือกข้อมูลที่ด้านล่างได้เลยนะคับ")
      .setColor(0x9b59b6);

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setLabel("ปิดตั๋ว").setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${interaction.user.id}>`, embeds: [openEmbed], components: [closeRow] });

    // UI ตามโหมด
    if (mode === "standard") {
      const optionEmbed = new EmbedBuilder()
        .setTitle("สิ่งที่ต้องการ")
        .setDescription("เลือกออฟชั่นที่คุณต้องการในงานนี้ หรือกด 'ไม่มีออฟชั่น'")
        .setColor(0x9b59b6);

      const noOptionButton = new ButtonBuilder()
        .setCustomId("no_options")
        .setLabel("ไม่มีออฟชั่น")
        .setStyle(ButtonStyle.Secondary);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_features")
        .setPlaceholder("เลือกออฟชั่น")
        .setMinValues(1)
        .setMaxValues(8)
        .addOptions(
          { label: labels.hair_move, value: "hair_move" },
          { label: labels.long_hair_move, value: "long_hair_move" },
          { label: labels.eye_blink, value: "eye_blink" },
          { label: labels.eye_blink_new, value: "eye_blink_new" },
          { label: labels.boobs, value: "boobs" },
          { label: labels.bangs, value: "bangs" },
          { label: labels.glow_eye, value: "glow_eye" },
          { label: labels.eye_move, value: "eye_move" }
        );

      const selectRow = new ActionRowBuilder().addComponents(selectMenu);
      const buttonRow = new ActionRowBuilder().addComponents(noOptionButton);
      await channel.send({ embeds: [optionEmbed], components: [selectRow, buttonRow] });
    }

    if (mode === "bundle") {
      const embed = new EmbedBuilder()
        .setTitle("รวมแอดออนสกิน")
        .setDescription("กดปุ่มเพื่อกรอกจำนวนแอดออนที่จะรวม (คิด 10 บาท/ชิ้น)")
        .setColor(0x9b59b6);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_bundle_modal").setLabel("กรอกจำนวนแอดออน").setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [embed], components: [row] });
    }

    if (mode === "preset") {
      const embed = new EmbedBuilder()
        .setTitle("โมเดลสำเร็จ")
        .setDescription("เลือกโมเดลที่ต้องการ (เลือกได้หลายอัน)")
        .setColor(0x9b59b6);

      const presetSelect = new StringSelectMenuBuilder()
        .setCustomId("preset_select")
        .setPlaceholder("เลือกโมเดลสำเร็จ")
        .setMinValues(1)
        .setMaxValues(3)
        .addOptions(
          { label: "ผ้าคลุม 6 สี (100 บาท)", value: "cloak6_100" },
          { label: "หู-หางจิ้งจอก 12 สี (90 บาท)", value: "foxtail12_90" },
          { label: "ร่ม 12 สี (90 บาท)", value: "umbrella12_90" }
        );

      const row = new ActionRowBuilder().addComponents(presetSelect);
      await channel.send({ embeds: [embed], components: [row] });
    }

    await interaction.reply({ content: `✅ เปิดตั๋วให้แล้วที่ ${channel}`, ephemeral: true });
    return channel;
  }

  client.on("interactionCreate", async (interaction) => {
    // === ปุ่มหน้าตั้งค่า ===
    if (interaction.isButton()) {
      if (interaction.customId === "create_ticket_standard") {
        await createTicketChannel(interaction, "standard");
      }
      if (interaction.customId === "create_ticket_bundle") {
        await createTicketChannel(interaction, "bundle");
      }
      if (interaction.customId === "create_ticket_preset") {
        await createTicketChannel(interaction, "preset");
      }

      // ปิดตั๋ว
      if (interaction.customId === "close_ticket") {
        const member = interaction.guild.members.cache.get(interaction.user.id);
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          await interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ในการปิดตั๋วนี้", ephemeral: true });
          return;
        }
        // ล้าง state ของห้องนี้ก่อน
        const k = keyOf(interaction.user.id, interaction.channel.id);
        summaryMessages.delete(k);
        formMessages.delete(k);
        userTotals.delete(k);
        userDetails.delete(k);
        ticketModes.delete(k);

        await interaction.reply({ content: "⏳ กำลังปิดห้องนี้...", ephemeral: true });
        interaction.channel.delete().catch(console.error);
      }

      // ไม่มีออฟชั่น (standard) -> รีเซ็ตและสรุป (ยังคงนับ base 30)
      if (interaction.customId === "no_options") {
        await interaction.deferUpdate();
        const k = keyOf(interaction.user.id, interaction.channel.id);
        ticketModes.set(k, "standard");
        setSubtotal(k, 0);
        setDetails(k, []);
        await postOrReplaceSummary(interaction, "เลือกไม่มีออฟชั่น");
      }

      // เปิด modal (bundle)
      if (interaction.customId === "open_bundle_modal") {
        const modal = new ModalBuilder()
          .setCustomId("bundle_modal")
          .setTitle("รวมแอดออนสกิน");
        const qty = new TextInputBuilder()
          .setCustomId("bundle_count")
          .setLabel("จำนวนแอดออนที่จะรวม (ตัวเลข)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(qty));
        await interaction.showModal(modal);
      }

      // เปิด modal ฟอร์มผู้สั่ง
      if (interaction.customId === "open_form") {
        const modal = new ModalBuilder()
          .setCustomId("skin_order_form")
          .setTitle("ฟอร์มข้อมูลเพิ่มเติม");

        const xboxInput = new TextInputBuilder().setCustomId("xbox_name").setLabel("ชื่อ Xbox").setStyle(TextInputStyle.Short).setRequired(true);
        const lockInput = new TextInputBuilder().setCustomId("lock_option").setLabel("ล็อกให้ใช้ได้คนเดียวไหม (ล็อก/ไม่ล็อก)").setStyle(TextInputStyle.Short).setRequired(true);
        const slotInput = new TextInputBuilder().setCustomId("slot").setLabel("ใส่ช่องไหน (หมวก/เกราะ/กางเกง/รองเท้า)").setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(xboxInput),
          new ActionRowBuilder().addComponents(lockInput),
          new ActionRowBuilder().addComponents(slotInput)
        );
        await interaction.showModal(modal);
      }
    }

    // === Select Menu ===
    if (interaction.isStringSelectMenu()) {
      // ออฟชั่นหลัก (standard) -> รีเซ็ตทับ
      if (interaction.customId === "select_features") {
        let selected = interaction.values.slice();
        if (selected.includes("hair_move") && selected.includes("long_hair_move")) {
          selected = selected.filter(v => v !== "hair_move");
        }
        if (selected.includes("eye_blink") && selected.includes("eye_blink_new")) {
          selected = selected.filter(v => v !== "eye_blink");
        }

        await interaction.deferUpdate();

        const k = keyOf(interaction.user.id, interaction.channel.id);
        ticketModes.set(k, "standard");

        const detailLines = selected.map(v => `• ${labels[v]}: ${prices[v] || 0} บาท`);
        const subtotal = selected.reduce((acc, v) => acc + (prices[v] || 0), 0);

        setDetails(k, detailLines);     // ทับของเดิม
        setSubtotal(k, subtotal);       // ทับของเดิม
        await postOrReplaceSummary(interaction, "ออฟชั่น");
      }

      // โมเดลสำเร็จ (preset) -> รีเซ็ตทับ ไม่บวก base
      if (interaction.customId === "preset_select") {
        await interaction.deferUpdate();

        const table = {
          cloak6_100:   { name: "ผ้าคลุม 6 สี",        price: 100 },
          foxtail12_90: { name: "หู-หางจิ้งจอก 12 สี", price: 90  },
          umbrella12_90:{ name: "ร่ม 12 สี",            price: 90  },
        };

        const lines = [];
        let subtotal = 0;
        for (const v of interaction.values) {
          const p = table[v];
          if (p) {
            lines.push(`• ${p.name}: ${p.price} บาท`);
            subtotal += p.price;
          }
        }

        const k = keyOf(interaction.user.id, interaction.channel.id);
        ticketModes.set(k, "preset");
        setDetails(k, lines);     // ทับของเดิม
        setSubtotal(k, subtotal); // ทับของเดิม

        await postOrReplaceSummary(interaction, "โมเดลสำเร็จ");
      }
    }

    // === Modal Submit ===
    if (interaction.isModalSubmit()) {
      // รวมแอดออนสกิน -> รีเซ็ตทับ ไม่บวก base
      if (interaction.customId === "bundle_modal") {
        const raw = interaction.fields.getTextInputValue("bundle_count") || "0";
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0) {
          return interaction.reply({ content: "❌ กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", ephemeral: true });
        }
        const addPrice = n * 10;

        const k = keyOf(interaction.user.id, interaction.channel.id);
        ticketModes.set(k, "bundle");
        setDetails(k, [`• รวมแอดออนสกิน: ${n} × 10 = ${addPrice} บาท`]); // ทับของเดิม
        setSubtotal(k, addPrice); // ทับของเดิม

        await interaction.deferUpdate();
        await postOrReplaceSummary(interaction, "รวมแอดออนสกิน");
      }

      // ฟอร์มข้อมูลเพิ่มเติม
      if (interaction.customId === "skin_order_form") {
        const xboxName = interaction.fields.getTextInputValue("xbox_name");
        const lockOption = interaction.fields.getTextInputValue("lock_option");
        const slot = interaction.fields.getTextInputValue("slot");

        const k = keyOf(interaction.user.id, interaction.channel.id);
        const oldMsg = formMessages.get(k);
        if (oldMsg && oldMsg.deletable) {
          await oldMsg.delete().catch(() => {});
        }
        const newMsg = await interaction.channel.send({
          content: `<@${interaction.user.id}>\n\n## ชื่อ Xbox : ${xboxName}\n## ล็อกให้ใช้ได้คนเดียวไหม : ${lockOption}\n## ช่องที่ใส่ : ${slot}`,
        });
        formMessages.set(k, newMsg);
        await interaction.deferUpdate();
      }
    }
  });
};
