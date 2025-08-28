// ticket.js (discord.js v14)
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
const userDetails   = new Map();   // key: `${userId}-${channelId}` -> string[] รายการย่อย (เว้นปอยผม/บัฟถ้ายังไม่ตัดสินใจ)
const ticketModes   = new Map();   // key: `${userId}-${channelId}` -> 'standard'|'bundle'|'preset'

// selections และสถานะพิเศษ
const userSelections = new Map();  // key -> Set<string> (ค่าที่เลือกใน select_features)
const dynamicState   = new Map();  // key -> { bangsQty:null|number, bangsBringOwn:boolean, buffQty:null|number, buffNotes:string }

// ข้อความ Embed ถามเฉพาะทาง (ไว้ลบทิ้งหลังตัดสินใจ)
const bangsPromptMsg = new Map();  // key -> Message (ปอยผม)
const buffPromptMsg  = new Map();  // key -> Message (เอฟเฟก/บัฟ)

const PAY_CHANNEL_ID = "1371395778727383040";
const ADDON_BASE_PRICE = 30; // เฉพาะโหมด standard

const labels = {
  hair_move: "ผมขยับ",
  long_hair_move: "ผมขยับยาว",
  eye_blink: "ตากระพริบ",
  eye_blink_new: "ตากระพริบใหม่",
  boobs: "หน้าอก",
  bangs: "ปอยผม",          // แยก embed
  glow_eye: "ตาเรืองแสง",
  eye_move: "ตาขยับ",
  buff: "เอฟเฟก/บัฟ",      // บัฟละ 5 บาท (แยก embed)
};
const prices = {
  hair_move: 30,
  long_hair_move: 70,
  eye_blink: 25,
  eye_blink_new: 35,
  boobs: 25,
  glow_eye: 35,
  eye_move: 100,
};

const PER_PIECE = 10;      // ราคา/จุด สำหรับ "ปอยผม"
const BRING_OWN_FLAT = 10; // "ปอยผม" นำมาเอง = 10 บาท
const BUFF_PER = 5;        // ราคา/บัฟ

// ==== HELPERS ====
function createFormButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_form")
      .setLabel("กรอกข้อมูลเพิ่มเติม ใครไม่กรอกเป็นเก")
      .setStyle(ButtonStyle.Success)
  );
}

function keyOf(userId, channelId) {
  return `${userId}-${channelId}`;
}
function ensureDyn(k) {
  if (!dynamicState.get(k)) {
    dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, buffQty: null, buffNotes: "" });
  }
  return dynamicState.get(k);
}
function initState(userId, channelId, mode) {
  const k = keyOf(userId, channelId);
  userTotals.set(k, 0);
  userDetails.set(k, []);
  ticketModes.set(k, mode);
  userSelections.set(k, new Set());
  dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, buffQty: null, buffNotes: "" });
  bangsPromptMsg.delete(k);
  buffPromptMsg.delete(k);
  return k;
}
function setSubtotal(k, val) {
  userTotals.set(k, Math.max(0, Number(val) || 0));
}
function setDetails(k, lines) {
  userDetails.set(k, Array.isArray(lines) ? lines : []);
}
function standardOptionsAsSelectOptions() {
  const opts = [];
  for (const key of Object.keys(labels)) {
    let desc = `ราคา ${prices[key] ?? 0} บาท`;
    if (key === "bangs") desc = `จุดละ ${PER_PIECE} นำมาเอง ${BRING_OWN_FLAT}`;
    if (key === "buff")  desc = `บัฟละ ${BUFF_PER}`;
    opts.push({ label: labels[key], value: key, description: desc });
  }
  return opts;
}

// รวมราคาทั้งหมด (รวมปอยผม/บัฟเมื่อผู้ใช้ตัดสินใจแล้ว)
function computeTotal(k) {
  const selections = userSelections.get(k) || new Set();
  const dyn = ensureDyn(k);
  const mode = ticketModes.get(k) || "standard";

  // ✅ สำหรับ bundle/preset ใช้ subtotal ที่เราตั้งไว้โดยตรง
  if (mode !== "standard") {
    return userTotals.get(k) || 0;
  }

  // ⬇️ โหมด standard: คำนวณจาก selections + ปอยผม/บัฟ แล้วบวก base
  let subtotal = 0;

  // ออปชันปกติ (ไม่รวม bangs/buff)
  for (const v of selections) {
    if (v === "bangs" || v === "buff") continue;
    subtotal += prices[v] || 0;
  }

  // ปอยผม
  if (selections.has("bangs")) {
    if (dyn.bangsBringOwn) subtotal += BRING_OWN_FLAT;
    else if (Number.isFinite(dyn.bangsQty)) subtotal += dyn.bangsQty * PER_PIECE;
  }

  // บัฟ
  if (selections.has("buff")) {
    if (Number.isFinite(dyn.buffQty)) subtotal += dyn.buffQty * BUFF_PER;
  }

  return subtotal + ADDON_BASE_PRICE;
}


async function postOrReplaceSummary(interaction) {
  const k = keyOf(interaction.user.id, interaction.channel.id);
  const mode = ticketModes.get(k) || "standard";
  const selections = userSelections.get(k) || new Set();
  const dyn = ensureDyn(k);
  const details = userDetails.get(k) || [];

  const lines = [];
  lines.push("# รวมราคาแอดออน");

  // ✅ แสดงรายการจาก userDetails เสมอ (ครอบคลุมทั้ง standard/bundle/preset)
  if (details.length) {
    lines.push(...details);
  }

  // ⬇️ เฉพาะ standard: ต่อท้ายบรรทัดพิเศษปอยผม/บัฟ (เพราะไม่ได้อยู่ใน details)
  if (selections.has("bangs")) {
    if (dyn.bangsBringOwn) {
      lines.push(`**• ${labels.bangs} : นำมาเอง ${BRING_OWN_FLAT} บาท**`);
    } else if (Number.isFinite(dyn.bangsQty)) {
      const add = dyn.bangsQty * PER_PIECE;
      lines.push(`**• ${labels.bangs} : ${dyn.bangsQty} × ${PER_PIECE} = ${add} บาท**`);
    }
  }

  if (selections.has("buff")) {
    if (Number.isFinite(dyn.buffQty)) {
      const add = dyn.buffQty * BUFF_PER;
      lines.push(`**• ${labels.buff} : ${dyn.buffQty} × ${BUFF_PER} = ${add} บาท**`);
      if (dyn.buffNotes) {
        lines.push(`**รายละเอียดบัฟ**\n${dyn.buffNotes}`);
      }
    }
  }

  // base ของ standard ถูกบวกใน computeTotal แล้ว ไม่ต้องพิมพ์ซ้ำตรงนี้ก็ได้
  // ถ้าต้องการแสดงบรรทัด base ก็ปล่อยบรรทัดนี้ไว้:
  if (mode === "standard") lines.push(`**• ค่าแอดออน: ${ADDON_BASE_PRICE} บาท**`);

  const total = computeTotal(k);
  lines.push(`\n**รวมราคา: ${total} บาท**`);
  lines.push(`## โอนเงินได้ที่\n# <#${PAY_CHANNEL_ID}>`);

  const old = summaryMessages.get(k);
  if (old && old.deletable) {
    await old.delete().catch(() => {});
  }

  const components = mode === "standard" ? [createFormButton()] : [];
  const msg = await interaction.channel.send({
    content: `<@${interaction.user.id}>\n` + lines.join("\n"),
    components,
  });
  summaryMessages.set(k, msg);
}


// ===== Embeds ถามเฉพาะทาง (ไม่มีการแสดงราคาใน embed) =====

// ปอยผม — ปุ่ม: กรอกจำนวน / นำมาเอง (ตัด "ยกเลิก" ออก)
async function sendBangsPrompt(interaction) {
  const k = keyOf(interaction.user.id, interaction.channel.id);
  const old = bangsPromptMsg.get(k);
  if (old && old.deletable) {
    await old.delete().catch(() => {});
  }
  const embed = new EmbedBuilder()
    .setTitle("ปอยผม")
    .setDescription(["โปรดเลือกหนึ่งตัวเลือก:", "• กรอกจำนวนปอยผม", "• นำมาเอง"].join("\n"))
    .setColor(0x9b59b6);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("set_bangs_qty").setLabel("กรอกปอยผม").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bangs_bring_own").setLabel("นำมาเอง").setStyle(ButtonStyle.Secondary),
  );
  const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
  bangsPromptMsg.set(k, msg);
}
async function deleteBangsPrompt(k) {
  const old = bangsPromptMsg.get(k);
  if (old && old.deletable) await old.delete().catch(() => {});
  bangsPromptMsg.delete(k);
}

// บัฟ — ปุ่ม: กรอกจำนวน (ตัด "ยกเลิก" ออก)
async function sendBuffPrompt(interaction) {
  const k = keyOf(interaction.user.id, interaction.channel.id);
  const old = buffPromptMsg.get(k);
  if (old && old.deletable) {
    await old.delete().catch(() => {});
  }
  const embed = new EmbedBuilder()
    .setTitle("เอฟเฟก/บัฟ")
    .setDescription(["โปรดเลือกหนึ่งตัวเลือก:", "• กรอกจำนวนบัฟ"].join("\n"))
    .setColor(0x9b59b6);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("set_buff_qty").setLabel("กรอกจำนวนบัฟ").setStyle(ButtonStyle.Primary),
  );
  const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
  buffPromptMsg.set(k, msg);
}
async function deleteBuffPrompt(k) {
  const old = buffPromptMsg.get(k);
  if (old && old.deletable) await old.delete().catch(() => {});
  buffPromptMsg.delete(k);
}

// ==== MAIN MODULE ====
module.exports = function (client) {
  // ตั้งค่า !ticket
  client.on("messageCreate", async (message) => {
    try {
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("create_ticket_standard").setLabel("ทำแอดออนสกิน").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("create_ticket_bundle").setLabel("รวมแอดออนสกิน").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("create_ticket_preset").setLabel("โมเดลสำเร็จ").setStyle(ButtonStyle.Primary),
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      await message.reply(`✅ ตั้งค่าหมวดหมู่เรียบร้อยแล้ว: \`${categoryId}\``);
    } catch (err) {
      console.error("!ticket error:", err);
    }
  });

  // สร้างห้อง
  async function createTicketChannel(interaction, mode) {
    try {
      const guildId = interaction.guild.id;
      const doc = await db.doc(`ticket_settings/${guildId}`).get();
      if (!doc.exists || !doc.data().categoryId) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true });
        }
        await interaction.editReply("❌ ยังไม่ได้ตั้งค่าหมวดหมู่สำหรับเซิร์ฟเวอร์นี้");
        return null;
      }
      const categoryId = doc.data().categoryId;
      if (!/^\d{17,20}$/.test(categoryId)) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true });
        }
        await interaction.editReply("❌ หมวดหมู่ที่ตั้งไว้ไม่ถูกต้อง (ไม่ใช่ Snowflake)");
        return null;
      }

      const channel = await interaction.guild.channels.create({
        name: `🔥-𝕋𝕚𝕔𝕜𝕕𝕥_${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
        ],
      });

      // init state
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
          .setMaxValues(9)
          .addOptions(...standardOptionsAsSelectOptions());

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        const buttonRow = new ActionRowBuilder().addComponents(noOptionButton);
        await channel.send({ embeds: [optionEmbed], components: [selectRow, buttonRow] });
      }

      if (mode === "bundle") {
        const embed = new EmbedBuilder()
          .setTitle("รวมแอดออนสกิน")
          .setDescription("**กดปุ่มเพื่อกรอกจำนวนแอดออนที่จะรวม ( 10 บาท / ชิ้น )**")
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
            { label: "ผ้าคลุม 6 สี", value: "cloak6_100", description: "ราคา 100 บาท" },
            { label: "หู-หางจิ้งจอก 12 สี", value: "foxtail12_90", description: "ราคา 90 บาท" },
            { label: "ร่ม 12 สี", value: "umbrella12_90", description: "ราคา 90 บาท" }
          );

        const row = new ActionRowBuilder().addComponents(presetSelect);
        await channel.send({ embeds: [embed], components: [row] });
      }

      await interaction.editReply(`✅ เปิดตั๋วให้แล้วที่ ${channel}`);
      return channel;
    } catch (err) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true });
        }
        await interaction.editReply("❌ เกิดข้อผิดพลาดในการสร้างห้อง");
      } catch {}
      console.error("createTicketChannel error:", err);
      return null;
    }
  }

  client.on("interactionCreate", async (interaction) => {
    try {
      // === ปุ่มหน้าตั้งค่า ===
      if (interaction.isButton()) {
        if (
          interaction.customId === "create_ticket_standard" ||
          interaction.customId === "create_ticket_bundle" ||
          interaction.customId === "create_ticket_preset"
        ) {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
          }
          const mode =
            interaction.customId === "create_ticket_standard" ? "standard" :
            interaction.customId === "create_ticket_bundle"   ? "bundle"   :
                                                                 "preset";
          await createTicketChannel(interaction, mode);
          return;
        }

        // ปิดตั๋ว
        if (interaction.customId === "close_ticket") {
          const member = interaction.guild.members.cache.get(interaction.user.id);
          if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ในการปิดตั๋วนี้", ephemeral: true });
          }
          const k = keyOf(interaction.user.id, interaction.channel.id);
          await deleteBangsPrompt(k);
          await deleteBuffPrompt(k);
          summaryMessages.delete(k);
          formMessages.delete(k);
          userTotals.delete(k);
          userDetails.delete(k);
          ticketModes.delete(k);
          userSelections.delete(k);
          dynamicState.delete(k);

          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
          }
          await interaction.editReply("⏳ กำลังปิดห้องนี้...");
          return interaction.channel.delete().catch(console.error);
        }

        // ไม่มีออฟชั่น
        if (interaction.customId === "no_options") {
          await interaction.deferUpdate();
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "standard");
          setSubtotal(k, 0);
          setDetails(k, []);
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, buffQty: null, buffNotes: "" });
          await deleteBangsPrompt(k);
          await deleteBuffPrompt(k);
          await postOrReplaceSummary(interaction);
          return;
        }

        // bundle modal
        if (interaction.customId === "open_bundle_modal") {
          const modal = new ModalBuilder().setCustomId("bundle_modal").setTitle("รวมแอดออนสกิน");
          const qty = new TextInputBuilder().setCustomId("bundle_count").setLabel("จำนวนแอดออนที่จะรวม").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(qty));
          await interaction.showModal(modal);
          return;
        }

        // ===== ปอยผม =====
        if (interaction.customId === "set_bangs_qty") {
          const modal = new ModalBuilder().setCustomId("bangs_qty_modal").setTitle("กำหนดจำนวนปอยผม");
          const input = new TextInputBuilder().setCustomId("bangs_qty").setLabel("จำนวนปอยผม").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
          return;
        }
        if (interaction.customId === "bangs_bring_own") {
          await interaction.deferUpdate();
          const k = keyOf(interaction.user.id, interaction.channel.id);
          const dyn = ensureDyn(k);
          dyn.bangsBringOwn = true;
          dyn.bangsQty = null;
          await deleteBangsPrompt(k);
          // ถ้ามี buff ที่ยังไม่ตั้งค่า → ไปถามบัฟต่อ แทนที่จะสรุปเลย
          const set = userSelections.get(k) || new Set();
          const needBuff = set.has("buff") && !Number.isFinite(ensureDyn(k).buffQty);
          if (needBuff) {
            await sendBuffPrompt(interaction);
            return;
          }
          await postOrReplaceSummary(interaction);
          return;
        }

        // ===== บัฟ =====
        if (interaction.customId === "set_buff_qty") {
          const modal = new ModalBuilder().setCustomId("buff_qty_modal").setTitle("กำหนดจำนวนบัฟ");
          const qty = new TextInputBuilder()
            .setCustomId("buff_qty")
            .setLabel("จำนวนบัฟ")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          const notes = new TextInputBuilder()
            .setCustomId("buff_notes")
            .setLabel("บัฟที่ต้องการ")
            .setPlaceholder("พิมพ์ได้หลายบรรทัด")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

          modal.addComponents(
            new ActionRowBuilder().addComponents(qty),
            new ActionRowBuilder().addComponents(notes),
          );
          await interaction.showModal(modal);
          return;
        }

        // ฟอร์มผู้สั่ง
        if (interaction.customId === "open_form") {
          const modal = new ModalBuilder().setCustomId("skin_order_form").setTitle("ฟอร์มข้อมูลเพิ่มเติม");
          const xboxInput = new TextInputBuilder().setCustomId("xbox_name").setLabel("ชื่อ Xbox").setStyle(TextInputStyle.Short).setRequired(true);
          const lockInput = new TextInputBuilder().setCustomId("lock_option").setLabel("ล็อกให้ใช้ได้คนเดียวไหม (ล็อก/ไม่ล็อก)").setStyle(TextInputStyle.Short).setRequired(true);
          const slotInput = new TextInputBuilder().setCustomId("slot").setLabel("ใส่ช่องไหน (หมวก/เกราะ/กางเกง/รองเท้า)").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(
            new ActionRowBuilder().addComponents(xboxInput),
            new ActionRowBuilder().addComponents(lockInput),
            new ActionRowBuilder().addComponents(slotInput)
          );
          await interaction.showModal(modal);
          return;
        }
      }

      // === Select Menu ===
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "select_features") {
          // ทุกครั้งที่เลือกออฟชันใหม่: ลบ embed ที่ค้างอยู่ และล้างข้อมูลเก่าเสมอ
          await deleteBangsPrompt(keyOf(interaction.user.id, interaction.channel.id));
          await deleteBuffPrompt(keyOf(interaction.user.id, interaction.channel.id));

          let selected = interaction.values.slice();
          // กันซ้ำ
          if (selected.includes("hair_move") && selected.includes("long_hair_move")) {
            selected = selected.filter(v => v !== "hair_move");
          }
          if (selected.includes("eye_blink") && selected.includes("eye_blink_new")) {
            selected = selected.filter(v => v !== "eye_blink");
          }

          await interaction.deferUpdate();

          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "standard");

          // ล้างข้อมูลเก่าเสมอ
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, buffQty: null, buffNotes: "" });

          const set = new Set(selected);       // เขียนทับตัวเลือกเดิมเสมอ
          userSelections.set(k, set);

          // คำนวณเฉพาะออปชันปกติ (ไม่รวม bangs/buff)
          const fixedKeys = [...set].filter(v => v !== "bangs" && v !== "buff");
          const detailLines = fixedKeys.map(v => `**• ${labels[v]}: ${prices[v] || 0} บาท**`);
          const subtotal = fixedKeys.reduce((acc, v) => acc + (prices[v] || 0), 0);
          setDetails(k, detailLines);
          setSubtotal(k, subtotal);

          // ลอจิกลำดับ: ถ้าเลือกพร้อมกัน ให้ "ปอยผม" ก่อนเสมอ
          if (set.has("bangs")) {
            await sendBangsPrompt(interaction);
            return; // ยังไม่สรุป
          } else if (set.has("buff")) {
            await sendBuffPrompt(interaction);
            return; // ยังไม่สรุป
          } else {
            // ไม่มีทั้งสอง → สรุปได้เลย
            await postOrReplaceSummary(interaction);
            return;
          }
        }

        // preset
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
            if (p) { lines.push(`**• ${p.name}: ${p.price} บาท**`); subtotal += p.price; }
          }

          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "preset");
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, buffQty: null, buffNotes: "" });
          await deleteBangsPrompt(k);
          await deleteBuffPrompt(k);

          setDetails(k, lines);
          setSubtotal(k, subtotal);

          await postOrReplaceSummary(interaction);
          return;
        }
      }

      // === Modal Submit ===
      if (interaction.isModalSubmit()) {
        // bundle
        if (interaction.customId === "bundle_modal") {
          const raw = interaction.fields.getTextInputValue("bundle_count") || "0";
          const n = parseInt(raw, 10);
          if (!Number.isFinite(n) || n < 0) {
            return interaction.reply({ content: "❌ กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", ephemeral: true });
          }
          const addPrice = n * 10;

          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "bundle");
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, buffQty: null, buffNotes: "" });
          await deleteBangsPrompt(k);
          await deleteBuffPrompt(k);

          setDetails(k, [`**• รวมแอดออนสกิน: ${n} × 10 = ${addPrice} บาท**`]);
          setSubtotal(k, addPrice);

          await interaction.deferUpdate();
          await postOrReplaceSummary(interaction);
          return;
        }

        // ฟอร์มลูกค้า
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
          return;
        }

        // จำนวนปอยผม
        if (interaction.customId === "bangs_qty_modal") {
          const raw = interaction.fields.getTextInputValue("bangs_qty") || "0";
          const n = parseInt(raw, 10);
          if (!Number.isFinite(n) || n < 0) {
            return interaction.reply({ content: "❌ กรุณากรอกจำนวนปอยผมเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", ephemeral: true });
          }
          const k = keyOf(interaction.user.id, interaction.channel.id);
          const dyn = ensureDyn(k);
          dyn.bangsQty = n;
          dyn.bangsBringOwn = false;

          await interaction.deferUpdate();
          await deleteBangsPrompt(k);

          // ถ้ามี buff ที่ยังไม่ตั้งค่า → ไปถามบัฟต่อ (ตามลำดับ)
          const set = userSelections.get(k) || new Set();
          const needBuff = set.has("buff") && !Number.isFinite(ensureDyn(k).buffQty);
          if (needBuff) {
            await sendBuffPrompt(interaction);
            return;
          }

          await postOrReplaceSummary(interaction);
          return;
        }

        // จำนวนบัฟ + รายละเอียดบัฟ
        if (interaction.customId === "buff_qty_modal") {
          const raw = interaction.fields.getTextInputValue("buff_qty") || "0";
          const n = parseInt(raw, 10);
          if (!Number.isFinite(n) || n < 0) {
            return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", ephemeral: true });
          }
          const notes = (interaction.fields.getTextInputValue("buff_notes") || "").trim();

          const k = keyOf(interaction.user.id, interaction.channel.id);
          const dyn = ensureDyn(k);
          dyn.buffQty = n;
          dyn.buffNotes = notes;

          await interaction.deferUpdate();
          await deleteBuffPrompt(k);

          // หลังบัฟเสร็จ: สรุปได้เลย (เพราะบังคับปอยผมเสร็จก่อนอยู่แล้วถ้ามี)
          await postOrReplaceSummary(interaction);
          return;
        }
      }
    } catch (err) {
      console.error("interactionCreate error:", err);
    }
  });
};
