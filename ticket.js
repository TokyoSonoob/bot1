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
  MessageFlags,
} = require("discord.js");
const { db } = require("./firebase");

const MODEL_ROLE_ID = "1413865323337093300";
const MODEL_CATEGORY_ID = "1413875836687486998";

const summaryMessages = new Map();
const formMessages = new Map();
const userTotals = new Map();
const userDetails = new Map();
const ticketModes = new Map();
const userSelections = new Map();
const dynamicState = new Map();
const postSelectNudge = new Map();

const PAY_CHANNEL_ID = "1371395778727383040";
const PAY_IMAGE_URL = "https://drive.google.com/uc?export=download&id=1DDmlbAXdnKIvnDW5vz-JJpT8a4Bw9BNV";

const ADDON_BASE_PRICE = 30;

const labels = {
  hair_move: "ผมขยับ",
  long_hair_move: "ผมขยับยาว",
  eye_blink: "ตากระพริบ",
  boobs: "หน้าอก",
  bangs: "ปอยผม",
  bangs_move: "ปอยผมขยับ",
  head_smooth: "หัวสมูท",
  glow_eye: "ตาเรืองแสง",
  eye_move: "ตาขยับ",
  buff: "เอฟเฟก/บัฟ",
  face_change: "เปลี่ยนสีหน้า",
};
const prices = {
  hair_move: 30,
  long_hair_move: 70,
  eye_blink: 35,
  boobs: 25,
  head_smooth: 30,
  glow_eye: 35,
  eye_move: 100,
  face_change: 100,
};

const PER_PIECE = 10;
const BRING_OWN_FLAT = 10;
const BUFF_PER = 5;

async function ensureDeferred(interaction, ephemeral = true) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  } catch (_) {}
}
async function safeReply(interaction, payload = {}, ephemeral = true) {
  if (!interaction.deferred && !interaction.replied) {
    return interaction.reply({
      ...payload,
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  }
  return interaction.followUp({
    ...payload,
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  });
}

function createFormButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("open_form").setLabel("กรอกข้อมูลเพิ่ม!! กดตรงนี้ กดดดดดดดด").setStyle(ButtonStyle.Success)
  );
}
function keyOf(userId, channelId) {
  return `${userId}-${channelId}`;
}
function ensureDyn(k) {
  if (!dynamicState.get(k)) {
    dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });
  }
  return dynamicState.get(k);
}
function initState(userId, channelId, mode) {
  const k = keyOf(userId, channelId);
  userTotals.set(k, 0);
  userDetails.set(k, []);
  ticketModes.set(k, mode);
  userSelections.set(k, new Set());
  dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });
  postSelectNudge.delete(k);
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
    if (key === "bangs_move") desc = `จุดละ ${PER_PIECE}`;
    if (key === "buff") desc = `บัฟละ ${BUFF_PER}`;
    opts.push({ label: labels[key], value: key, description: desc });
  }
  return opts;
}
function computeTotal(k) {
  const selections = userSelections.get(k) || new Set();
  const dyn = ensureDyn(k);
  const mode = ticketModes.get(k) || "standard";
  if (mode !== "standard") {
    return userTotals.get(k) || 0;
  }
  let subtotal = 0;
  for (const v of selections) {
    if (v === "bangs" || v === "bangs_move" || v === "buff") continue;
    subtotal += prices[v] || 0;
  }
  if (selections.has("bangs")) {
    if (dyn.bangsBringOwn) subtotal += BRING_OWN_FLAT;
    else if (Number.isFinite(dyn.bangsQty)) subtotal += dyn.bangsQty * PER_PIECE;
  }
  if (selections.has("bangs_move")) {
    if (Number.isFinite(dyn.bangsMoveQty)) subtotal += dyn.bangsMoveQty * PER_PIECE;
  }
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
  if (details.length) lines.push(...details);
  if (selections.has("bangs")) {
    if (dyn.bangsBringOwn) {
      lines.push(`**• ${labels.bangs} : นำมาเอง ${BRING_OWN_FLAT} บาท**`);
    } else if (Number.isFinite(dyn.bangsQty)) {
      const add = dyn.bangsQty * PER_PIECE;
      lines.push(`**• ${labels.bangs} : ${dyn.bangsQty} × ${PER_PIECE} = ${add} บาท**`);
    }
  }
  if (selections.has("bangs_move") && Number.isFinite(dyn.bangsMoveQty)) {
    const add = dyn.bangsMoveQty * PER_PIECE;
    lines.push(`**• ${labels.bangs_move} : ${dyn.bangsMoveQty} × ${PER_PIECE} = ${add} บาท**`);
  }
  if (selections.has("buff") && Number.isFinite(dyn.buffQty)) {
    const add = dyn.buffQty * BUFF_PER;
    lines.push(`**• ${labels.buff} : ${dyn.buffQty} × ${BUFF_PER} = ${add} บาท**`);
    if (dyn.buffNotes) lines.push(`**รายละเอียดบัฟ**\n${dyn.buffNotes}`);
  }
  if (mode === "standard") lines.push(`**• ค่าแอดออน: ${ADDON_BASE_PRICE} บาท**`);
  const total = computeTotal(k);
  lines.push(`\n**รวมราคา: ${total} บาท**`);
  lines.push(`## โอนเงินได้ที่`);
  const old = summaryMessages.get(k);
  if (old && old.deletable) {
    await old.delete().catch(() => {});
  }
  const components = mode === "standard" ? [createFormButton()] : [];
  const payEmbed = new EmbedBuilder().setImage(PAY_IMAGE_URL).setColor(0x9b59b6);
  const msg = await interaction.channel.send({
    content: `<@${interaction.user.id}>\n` + lines.join("\n"),
    embeds: [payEmbed],
    components,
  });
  summaryMessages.set(k, msg);
}

function buildDetailsModal(includeBangs, includeBangsMove, includeBuff) {
  const modal = new ModalBuilder().setCustomId("details_modal").setTitle("กรอกรายละเอียดแอดออน");
  if (includeBangs) {
    const t = new TextInputBuilder()
      .setCustomId("bangs_qty_or_own")
      .setLabel("ปอยผม: จำนวนจุด หรือพิมพ์ own = นำมาเอง")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("เช่น 3 หรือ own");
    modal.addComponents(new ActionRowBuilder().addComponents(t));
  }
  if (includeBangsMove) {
    const t = new TextInputBuilder()
      .setCustomId("bangs_move_qty")
      .setLabel("ปอยผมขยับ: จำนวนจุด (ตัวเลข)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("เช่น 2");
    modal.addComponents(new ActionRowBuilder().addComponents(t));
  }
  if (includeBuff) {
    const q = new TextInputBuilder()
      .setCustomId("buff_qty")
      .setLabel("เอฟเฟก/บัฟ: จำนวน (ตัวเลข)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("เช่น 2");
    const n = new TextInputBuilder()
      .setCustomId("buff_notes")
      .setLabel("รายละเอียดบัฟ (ถ้ามี)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder("พิมพ์ได้หลายบรรทัด");
    modal.addComponents(new ActionRowBuilder().addComponents(q));
    modal.addComponents(new ActionRowBuilder().addComponents(n));
  }
  return modal;
}

async function fetchValidCategory(guild, categoryId) {
  if (!/^\d{17,20}$/.test(String(categoryId || ""))) return { ok: false, reason: "รูปแบบหมวดหมู่ไม่ถูกต้อง" };
  let cat = guild.channels.cache.get(categoryId);
  if (!cat) {
    cat = await guild.channels.fetch(categoryId).catch(() => null);
  }
  if (!cat) return { ok: false, reason: "ไม่พบหมวดหมู่ในเซิร์ฟเวอร์นี้" };
  if (cat.type !== ChannelType.GuildCategory) return { ok: false, reason: "ID ที่ระบุไม่ใช่หมวดหมู่ (Category)" };
  return { ok: true, cat };
}

module.exports = function (client) {
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content.startsWith("!ticket")) return;
      const args = message.content.trim().split(/\s+/);
      const categoryId = args[1];
      if (!categoryId) {
        return message.reply("❌ กรุณาระบุรหัสหมวดหมู่ เช่น `!ticket 123456789012345678`");
      }
      const guildId = message.guild.id;
      await db.doc(`ticket_settings/${guildId}`).set({ categoryId });
      const embed = new EmbedBuilder()
        .setDescription(
          "# สั่งงานแอดออน \n# โมเดล ฟิกุร่า\n" +
            "     **✩.･*:｡≻───── ⋆♡⋆ ─────.•*:｡✩\n\n" +
            "# <a:excited_kawaii_roach:1421742948630134855> ตั๋วสั่งแอดออน <a:Catpls:1421734047381721141>\n" +
            " <a:emoji_5:1421733862601654374> [แอดออนสกินดูเรทราคาได้ที่นี่เลอ](https://discordapp.com/channels/1336555551970164839/1418840494108180602)\n" +
            " <a:emoji_5:1421733862601654374> รวมแอดออนสกิน \n        สกินละ10บาทสนใจกดตั๋วเลย\n" +
            " <a:emoji_5:1421733862601654374> จ่ายเงินครบก่อนถึงจะเริ่มงานนะคับ\n" +
            " <a:emoji_5:1421733862601654374> งานจะเสร็จภายใน 1-3 วันน้าาา\n\n" +
            "            :exclamation::exclamation:ห้ามกดตั๋วเล่น:exclamation::exclamation:\n" +
            "               ─── ･ ｡ﾟ☆: *.☽ .* :☆ﾟ. ───**"
        )
        .setColor(0x9b59b6)
        .setImage("https://giffiles.alphacoders.com/220/220120.gif")
        .setFooter({ text: "Make by Purple Shop" });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("create_ticket_standard").setLabel("ทำแอดออนสกิน").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("create_ticket_bundle").setLabel("รวมแอดออนสกิน").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("create_ticket_preset").setLabel("โมเดลสำเร็จ").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("create_ticket_sculpt").setLabel("สั่งงานปั้นโมเดล").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("create_ticket_figura").setLabel("สั่งฟิกุร่า Java").setStyle(ButtonStyle.Primary)
      );
      await message.channel.send({ embeds: [embed], components: [row] });
      await message.reply(`✅ ตั้งค่าหมวดหมู่เรียบร้อยแล้ว: \`${categoryId}\``);
    } catch (err) {
      console.error("!ticket error:", err);
    }
  });

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      const k = keyOf(message.author.id, message.channel.id);
      if (postSelectNudge.get(k)) {
        await message.reply("# กรอกข้อมูลเพิ่มเติมด้วยน้าาาา");
        postSelectNudge.set(k, false);
      }
    } catch (err) {
      console.error("postSelectNudge messageCreate error:", err);
    }
  });

  async function createTicketChannel(interaction, mode) {
    try {
      const guildId = interaction.guild.id;
      const settingsDoc = await db.doc(`ticket_settings/${guildId}`).get();
      const parentCategoryId =
        mode === "sculpt" || mode === "figura"
          ? MODEL_CATEGORY_ID
          : settingsDoc.exists && settingsDoc.data().categoryId
          ? settingsDoc.data().categoryId
          : null;
      await ensureDeferred(interaction, true);
      if (!parentCategoryId) {
        await interaction.editReply("❌ ยังไม่ได้ตั้งค่าหมวดหมู่สำหรับเซิร์ฟเวอร์นี้ (พิมพ์ `!ticket <categoryId>` เพื่อตั้งค่า)");
        return null;
      }
      const check = await fetchValidCategory(interaction.guild, parentCategoryId);
      if (!check.ok) {
        await interaction.editReply(`❌ สร้างห้องไม่สำเร็จ: ${check.reason}\nกรุณาตั้งค่าใหม่ด้วยคำสั่ง \`!ticket <categoryId ของหมวดที่มีอยู่จริง>\``);
        return null;
      }
      const parentCategory = check.cat;
      const channelName =
        mode === "sculpt"
          ? `🔥-𝕄𝕠𝕕𝕖𝕝_${interaction.user.username}`
          : mode === "figura"
          ? `🔥-𝔽𝕚𝕈𝕦𝕣𝕒_${interaction.user.username}`
          : `🔥-𝕋𝕚𝕜𝕜𝕖𝕥_${interaction.user.username}`;
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
      ];
      if (mode === "sculpt" || mode === "figura") {
        overwrites.push({ id: MODEL_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      }
      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentCategory.id,
        permissionOverwrites: overwrites,
      });
      initState(interaction.user.id, channel.id, mode);
      const openEmbed = new EmbedBuilder().setTitle("ขอบคุณที่ไว้ใจร้านเรา").setDescription("กรอก/แจ้งข้อมูลที่ด้านล่างได้เลยนะคับ").setColor(0x9b59b6);
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setLabel("ปิดตั๋ว").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("upgrade_priority").setLabel("อัปเป็นคิวเร่ง").setStyle(ButtonStyle.Primary)
      );
      const contentTag = mode === "sculpt" || mode === "figura" ? `<@${interaction.user.id}> <@&${MODEL_ROLE_ID}>` : `<@${interaction.user.id}>`;
      await channel.send({ content: contentTag, embeds: [openEmbed], components: [closeRow] });
      if (mode === "standard") {
        const optionEmbed = new EmbedBuilder().setTitle("สิ่งที่ต้องการ").setDescription("เลือกออฟชั่นที่คุณต้องการในงานนี้ หรือกด 'ไม่มีออฟชั่น'").setColor(0x9b59b6);
        const noOptionButton = new ButtonBuilder().setCustomId("no_options").setLabel("ไม่มีออฟชั่น").setStyle(ButtonStyle.Secondary);
        const ALL_FEATURE_COUNT = Object.keys(labels).length;
        const selectMenu = new StringSelectMenuBuilder().setCustomId("select_features").setPlaceholder("เลือกออฟชั่น").setMinValues(1).setMaxValues(ALL_FEATURE_COUNT).addOptions(...standardOptionsAsSelectOptions());
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        const buttonRow = new ActionRowBuilder().addComponents(noOptionButton);
        await channel.send({ embeds: [optionEmbed], components: [selectRow, buttonRow] });
      }
      if (mode === "bundle") {
        const embed = new EmbedBuilder().setTitle("รวมแอดออนสกิน").setDescription("**กดปุ่มเพื่อกรอกจำนวนแอดออนที่จะรวม ( 10 บาท / ชิ้น )**").setColor(0x9b59b6);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_bundle_modal").setLabel("กรอกจำนวนแอดออน").setStyle(ButtonStyle.Primary).setDisabled(false));
        await channel.send({ embeds: [embed], components: [row] });
      }
      if (mode === "preset") {
        const embed = new EmbedBuilder().setTitle("โมเดลสำเร็จ").setDescription("เลือกโมเดลที่ต้องการ (เลือกได้หลายอัน)").setColor(0x9b59b6);
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
      if (mode === "sculpt") {
        const embed = new EmbedBuilder().setTitle("สั่งงานปั้นโมเดล").setDescription(["หากมีรูปให้ส่งรูปที่ต้องการมาได้เลยน้าา", "รอแอดมินมาประเมินราคาและระยะเวลาให้น้าา💜"].join("\n")).setColor(0x9b59b6);
        await channel.send({ embeds: [embed] });
      }
      await interaction.editReply(`✅ เปิดตั๋วให้แล้วที่ ${channel}`);
      return channel;
    } catch (err) {
      try {
        await ensureDeferred(interaction, true);
        await interaction.editReply("❌ เกิดข้อผิดพลาดในการสร้างห้อง");
      } catch {}
      console.error("createTicketChannel error:", err);
      return null;
    }
  }

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (
          interaction.customId === "create_ticket_standard" ||
          interaction.customId === "create_ticket_bundle" ||
          interaction.customId === "create_ticket_preset" ||
          interaction.customId === "create_ticket_sculpt" ||
          interaction.customId === "create_ticket_figura"
        ) {
          await ensureDeferred(interaction, true);
          const mode =
            interaction.customId === "create_ticket_standard"
              ? "standard"
              : interaction.customId === "create_ticket_bundle"
              ? "bundle"
              : interaction.customId === "create_ticket_preset"
              ? "preset"
              : interaction.customId === "create_ticket_figura"
              ? "figura"
              : "sculpt";
          await createTicketChannel(interaction, mode);
          return;
        }
        if (interaction.customId === "close_ticket") {
          const member = interaction.guild.members.cache.get(interaction.user.id);
          if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return safeReply(interaction, { content: "❌ คุณไม่มีสิทธิ์ในการปิดตั๋วนี้" }, true);
          }
          const k = keyOf(interaction.user.id, interaction.channel.id);
          summaryMessages.delete(k);
          formMessages.delete(k);
          userTotals.delete(k);
          userDetails.delete(k);
          ticketModes.delete(k);
          userSelections.delete(k);
          dynamicState.delete(k);
          postSelectNudge.delete(k);
          await ensureDeferred(interaction, true);
          await interaction.editReply("⏳ กำลังปิดห้องนี้...");
          return interaction.channel.delete().catch(console.error);
        }
        if (interaction.customId === "upgrade_priority") {
          const member = interaction.guild.members.cache.get(interaction.user.id);
          if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return safeReply(interaction, { content: "❌ เฉพาะแอดมินเท่านั้นที่อัปเป็นคิวเร่งได้" }, true);
          }
          const oldName = interaction.channel.name || "";
          const core = oldName.replace(/^🔥+[-_ ]?/, "");
          const newName = `🔥🔥-${core}`;
          if (oldName === newName) {
            return safeReply(interaction, { content: "✅ ห้องนี้เป็นคิวเร่งอยู่แล้ว" }, true);
          }
          try {
            await interaction.channel.setName(newName);
            return safeReply(interaction, { content: `✅ อัปเป็นคิวเร่งแล้ว: \`${newName}\`` }, true);
          } catch (e) {
            console.error("upgrade_priority rename error:", e);
            return safeReply(interaction, { content: "❌ เปลี่ยนชื่อห้องไม่สำเร็จ" }, true);
          }
        }
        if (interaction.customId === "no_options") {
          await interaction.deferUpdate();
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "standard");
          setSubtotal(k, 0);
          setDetails(k, []);
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });
          if (!formMessages.has(k)) postSelectNudge.set(k, true);
          await postOrReplaceSummary(interaction);
          return;
        }
        if (interaction.customId === "open_form") {
          const modal = new ModalBuilder().setCustomId("skin_order_form").setTitle("ฟอร์มข้อมูลเพิ่มเติม");
          const xboxInput = new TextInputBuilder().setCustomId("xbox_name").setLabel("ชื่อ Xbox").setStyle(TextInputStyle.Short).setRequired(true);
          const lockInput = new TextInputBuilder().setCustomId("lock_option").setLabel("ล็อกให้ใช้ได้คนเดียวไหม (ล็อก/ไม่ล็อก)").setStyle(TextInputStyle.Short).setRequired(true);
          const slotInput = new TextInputBuilder().setCustomId("slot").setLabel("ใส่ช่องไหน (หมวก/เกราะ/กางเกง/รองเท้า)").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(xboxInput), new ActionRowBuilder().addComponents(lockInput), new ActionRowBuilder().addComponents(slotInput));
          await interaction.showModal(modal);
          return;
        }
        if (interaction.customId === "open_bundle_modal") {
          try {
            const modal = new ModalBuilder().setCustomId("bundle_modal").setTitle("รวมแอดออนสกิน");
            const qty = new TextInputBuilder().setCustomId("bundle_count").setLabel("จำนวนแอดออนที่จะรวม (ตัวเลข)").setPlaceholder("เช่น 12").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(4);
            modal.addComponents(new ActionRowBuilder().addComponents(qty));
            await interaction.showModal(modal);
          } catch (e) {
            await safeReply(interaction, { content: "❌ เปิดฟอร์มไม่สำเร็จ ลองกดปุ่มอีกครั้งนะครับ" }, true);
            console.error("open_bundle_modal showModal error:", e);
          }
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "select_features") {
          let selected = interaction.values.slice();
          if (selected.includes("face_change")) {
            if (!selected.includes("eye_move")) selected.push("eye_move");
            if (!selected.includes("eye_blink")) selected.push("eye_blink");
          }
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "standard");
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });
          const set = new Set(selected);
          userSelections.set(k, set);
          const fixedKeys = [...set].filter((v) => v !== "bangs" && v !== "buff" && v !== "bangs_move");
          const detailLines = fixedKeys.map((v) => `**• ${labels[v]}: ${prices[v] || 0} บาท**`);
          const subtotal = fixedKeys.reduce((acc, v) => acc + (prices[v] || 0), 0);
          setDetails(k, detailLines);
          setSubtotal(k, subtotal);

          const needBangs = set.has("bangs");
          const needMove = set.has("bangs_move");
          const needBuff = set.has("buff");

          if (needBangs || needMove || needBuff) {
            const modal = buildDetailsModal(needBangs, needMove, needBuff);
            await interaction.showModal(modal);
            return;
          }

          if (!formMessages.has(k)) postSelectNudge.set(k, true);
          await postOrReplaceSummary(interaction);
          return;
        }

        if (interaction.customId === "preset_select") {
          await interaction.deferUpdate();
          const table = {
            cloak6_100: { name: "ผ้าคลุม 6 สี", price: 100 },
            foxtail12_90: { name: "หู-หางจิ้งจอก 12 สี", price: 90 },
            umbrella12_90: { name: "ร่ม 12 สี", price: 90 },
          };
          const lines = [];
          let subtotal = 0;
          for (const v of interaction.values) {
            const p = table[v];
            if (p) {
              lines.push(`**• ${p.name}: ${p.price} บาท**`);
              subtotal += p.price;
            }
          }
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "preset");
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });
          setDetails(k, lines);
          setSubtotal(k, subtotal);
          await postOrReplaceSummary(interaction);
          return;
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === "bundle_modal") {
          const raw = (interaction.fields.getTextInputValue("bundle_count") || "").trim();
          if (!/^\d{1,4}$/.test(raw)) {
            return safeReply(interaction, { content: "❌ กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็ม 0-9999" }, true);
          }
          const n = parseInt(raw, 10);
          if (!Number.isFinite(n) || n < 0) {
            return safeReply(interaction, { content: "❌ กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, true);
          }
          const addPrice = n * 10;
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "bundle");
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });
          setDetails(k, [`**• รวมแอดออนสกิน: ${n} × 10 = ${addPrice} บาท**`]);
          setSubtotal(k, addPrice);
          await interaction.deferUpdate();
          await postOrReplaceSummary(interaction);
          return;
        }

        if (interaction.customId === "skin_order_form") {
          const xboxName = interaction.fields.getTextInputValue("xbox_name");
          const lockOption = interaction.fields.getTextInputValue("lock_option");
          const slot = interaction.fields.getTextInputValue("slot");
          const k = keyOf(interaction.user.id, interaction.channel.id);
          const oldMsg = formMessages.get(k);
          if (oldMsg && oldMsg.deletable) await oldMsg.delete().catch(() => {});
          const newMsg = await interaction.channel.send({
            content: `<@${interaction.user.id}>\n\n## ชื่อ Xbox : \`${xboxName}\`\n## ล็อกให้ใช้ได้คนเดียวไหม : ${lockOption}\n## ช่องที่ใส่ : ${slot}`,
          });
          formMessages.set(k, newMsg);
          postSelectNudge.set(k, false);
          await interaction.deferUpdate();
          return;
        }

        if (interaction.customId === "details_modal") {
          const k = keyOf(interaction.user.id, interaction.channel.id);
          const set = userSelections.get(k) || new Set();
          const dyn = ensureDyn(k);

          if (set.has("bangs")) {
            const raw = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
            if (!raw || raw === "own") {
              dyn.bangsBringOwn = true;
              dyn.bangsQty = null;
            } else if (/^\d+$/.test(raw)) {
              dyn.bangsBringOwn = false;
              dyn.bangsQty = parseInt(raw, 10);
            } else {
              return safeReply(interaction, { content: "❌ ปอยผม: กรอกตัวเลข หรือพิมพ์ own", }, true);
            }
          }

          if (set.has("bangs_move")) {
            const raw = (interaction.fields.getTextInputValue("bangs_move_qty") || "").trim();
            if (!/^\d+$/.test(raw)) {
              return safeReply(interaction, { content: "❌ ปอยผมขยับ: กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็ม", }, true);
            }
            dyn.bangsMoveQty = parseInt(raw, 10);
          }

          if (set.has("buff")) {
            const rawQ = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
            if (!/^\d+$/.test(rawQ)) {
              return safeReply(interaction, { content: "❌ บัฟ: กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็ม", }, true);
            }
            dyn.buffQty = parseInt(rawQ, 10);
            dyn.buffNotes = (interaction.fields.getTextInputValue("buff_notes") || "").trim();
          }

          await interaction.deferUpdate();
          await postOrReplaceSummary(interaction);
          return;
        }

        if (interaction.customId === "bangs_qty_modal" || interaction.customId === "bangs_move_qty_modal" || interaction.customId === "buff_qty_modal") {
          await interaction.reply({ content: "ฟอร์มนี้ถูกแทนที่ด้วยฟอร์มรวมแล้ว", flags: MessageFlags.Ephemeral });
          return;
        }
      }
    } catch (err) {
      console.error("interactionCreate error:", err);
    }
  });
};
