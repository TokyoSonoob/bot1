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
  MessageType,
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

const channelOwner = new Map();
const formRequired = new Map();
const formCompleted = new Map();
const formData = new Map();

const PAY_CHANNEL_ID = "1371395778727383040";
const PAY_IMAGE_URL = "https://drive.google.com/uc?export=download&id=1DDmlbAXdnKIvnDW5vz-JJpT8a4Bw9BNV";
const FIGURA_QR_URL = "https://media.discordapp.net/attachments/1413522411025862799/1425367891791970386/421-3.jpg?ex=68fe670b&is=68fd158b&hm=bb5c9eac100c8916f06bef080b6cef31cf4a236b91fbf020528557f203afe796&=&format=webp&width=1250&height=921";

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

const FIG_LABELS = {
  glow_eye: "ตาเรืองแสง",
  blink: "กระพริบตา",
  eye_follow_head: "ตาขยับตามหัว",
  head_smooth: "หัวสมูท",
  eye_toggle: "เปิดปิดตา",
  hair_move: "ผมขยับ",
  fringe_or_side: "จงอย/ผมข้าง",
  mouth_move: "ปากขยับ",
  merge_fig: "รวมฟิก",
  roulette: "ทำวงล้อ",
  fringe_physics: "ใส่ฟิสิกส์จงอย",
  fringe_anim: "อนิเมชั่นจงอย/ผมข้างขยับ",
};
const FIG_PRICES = {
  glow_eye: 30,
  blink: 30,
  eye_follow_head: 30,
  head_smooth: 50,
  eye_toggle: 40,
  hair_move: 150,
  fringe_or_side: 30,
  mouth_move: 40,
  merge_fig: 20,
  roulette: 30,
  fringe_physics: 10,
  fringe_anim: 20,
};

const figuraRights = new Map();

const PER_PIECE = 10;
const BRING_OWN_FLAT = 10;
const BUFF_PER = 5;

async function ensureDeferred(interaction, isEphemeral = true) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: !!isEphemeral });
    }
  } catch {}
}
async function safeReply(interaction, payload = {}, isEphemeral = true) {
  const opts = { ...payload };
  if (!interaction.deferred && !interaction.replied) {
    return interaction.reply({ ...opts, ephemeral: !!isEphemeral });
  }
  return interaction.followUp({ ...opts, ephemeral: !!isEphemeral });
}

function keyOf(userId, channelId) { return `${userId}-${channelId}`; }
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
  if (mode === "figura") figuraRights.set(k, "normal");
  channelOwner.set(channelId, userId);
  formRequired.set(channelId, mode === "standard");
  formCompleted.set(channelId, false);
  return k;
}
function setSubtotal(k, val) { userTotals.set(k, Math.max(0, Number(val) || 0)); }
function setDetails(k, lines) { userDetails.set(k, Array.isArray(lines) ? lines : []); }

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
function figuraOptionsAsSelectOptions() {
  return Object.keys(FIG_LABELS).map((k) => ({
    label: FIG_LABELS[k],
    value: `fig_${k}`,
    description: `ราคา ${FIG_PRICES[k]} บาท`,
  }));
}

function computeTotal(k) {
  const selections = userSelections.get(k) || new Set();
  const dyn = ensureDyn(k);
  const mode = ticketModes.get(k) || "standard";
  if (mode !== "standard") return userTotals.get(k) || 0;

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
function computeFiguraTotal(k) {
  const selections = userSelections.get(k) || new Set();
  let subtotal = 0;
  for (const v of selections) {
    if (!v.startsWith("fig_")) continue;
    const mk = v.slice(4);
    subtotal += FIG_PRICES[mk] || 0;
  }
  const right = figuraRights.get(k) || "normal";
  if (right === "plus50") subtotal += 50;
  if (right === "x2") subtotal = subtotal * 2;
  return subtotal;
}

function optionEmbed() {
  return new EmbedBuilder().setTitle("สิ่งที่ต้องการ").setDescription("เลือกออฟชั่นที่คุณต้องการในงานนี้ หรือกด 'ไม่มีออฟชั่น'").setColor(0x9b59b6);
}
function optionComponents() {
  const noOptionButton = new ButtonBuilder()
    .setCustomId("no_options")
    .setLabel("ไม่มีออฟชั่น")
    .setStyle(ButtonStyle.Secondary);

  const ALL_FEATURE_COUNT = Object.keys(labels).length;
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("select_features")
    .setPlaceholder("เลือกออฟชั่น")
    .setMinValues(1)
    .setMaxValues(ALL_FEATURE_COUNT)
    .addOptions(...standardOptionsAsSelectOptions());

  return [
    new ActionRowBuilder().addComponents(selectMenu),
    new ActionRowBuilder().addComponents(noOptionButton),
  ];
}

function figuraOptionEmbed() {
  return new EmbedBuilder()
    .setTitle("เลือกออฟชั่นฟิกุร่า (Figura)")
    .setDescription("เลือกได้หลายอัน แล้วกดปุ่มเลือกระดับสิทธิ์ด้านล่าง")
    .setColor(0x9b59b6);
}
function figuraOptionComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("figura_select")
    .setPlaceholder("เลือกออฟชั่นฟิกุร่า")
    .setMinValues(1)
    .setMaxValues(Object.keys(FIG_LABELS).length)
    .addOptions(...figuraOptionsAsSelectOptions());
  const rightsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fig_rights_normal").setLabel("สิทธิ์ปกติ (ไม่บวก)").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fig_rights_plus50").setLabel("ปลดเชิง +50").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fig_rights_x2").setLabel("สิทธิ์ขาด ×2").setStyle(ButtonStyle.Danger)
  );
  return [new ActionRowBuilder().addComponents(select), rightsRow];
}

async function postOrReplaceSummary(interaction) {
  const k = keyOf(interaction.user.id, interaction.channel.id);
  const mode = ticketModes.get(k) || "standard";
  const selections = userSelections.get(k) || new Set();
  const dyn = ensureDyn(k);
  const details = userDetails.get(k) || [];
  const needForm = formRequired.get(interaction.channel.id) === true;
  const doneForm = formCompleted.get(interaction.channel.id) === true;

  const components = (!needForm || doneForm)
    ? []
    : [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("open_skin_form")
            .setLabel("กรอกข้อมูลเพิ่มเติม")
            .setStyle(ButtonStyle.Primary)
        )
      ];

  if (mode === "figura") {
    const lines = [];
    lines.push("# รวมราคา (Figura)");
    for (const v of selections) {
      if (!v.startsWith("fig_")) continue;
      const mk = v.slice(4);
      lines.push(`**• ${FIG_LABELS[mk]}: ${FIG_PRICES[mk]} บาท**`);
    }
    const right = figuraRights.get(k) || "normal";
    if (right === "plus50") lines.push("**• สิทธิ์: ปลดเชิง +50 บาท**");
    else if (right === "x2") lines.push("**• สิทธิ์: สิทธิ์ขาด ×2**");
    else lines.push("**• สิทธิ์: ปกติ (ไม่บวก)**");
    const total = computeFiguraTotal(k);
    lines.push(`\n**รวมราคา: ${total} บาท**`, "## โอนเงินได้ที่");

    const old = summaryMessages.get(k);
    if (old && old.deletable) await old.delete().catch(() => {});
    const payEmbed = new EmbedBuilder().setImage(FIGURA_QR_URL).setColor(0x9b59b6);
    const msg = await interaction.channel.send({
      content: `<@${interaction.user.id}>\n` + lines.join("\n"),
      embeds: [payEmbed],
      components,
    });
    summaryMessages.set(k, msg);
    return;
  }

  const lines = [];
  lines.push("# รวมราคาแอดออน");
  if (details.length) lines.push(...details);
  if (selections.has("bangs")) {
    if (dyn.bangsBringOwn) lines.push(`**• ${labels.bangs} : นำมาเอง ${BRING_OWN_FLAT} บาท**`);
    else if (Number.isFinite(dyn.bangsQty)) {
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
  lines.push(`\n**รวมราคา: ${total} บาท**`, "## โอนเงินได้ที่");

  const old = summaryMessages.get(k);
  if (old && old.deletable) await old.delete().catch(() => {});
  const payEmbed = new EmbedBuilder().setImage(PAY_IMAGE_URL).setColor(0x9b59b6);
  const msg = await interaction.channel.send({
    content: `<@${interaction.user.id}>\n` + lines.join("\n"),
    embeds: [payEmbed],
    components,
  });
  summaryMessages.set(k, msg);
}

async function fetchValidCategory(guild, categoryId) {
  if (!/^\d{17,20}$/.test(String(categoryId || ""))) return { ok: false, reason: "รูปแบบหมวดหมู่ไม่ถูกต้อง" };
  let cat = guild.channels.cache.get(categoryId);
  if (!cat) cat = await guild.channels.fetch(categoryId).catch(() => null);
  if (!cat) return { ok: false, reason: "ไม่พบหมวดหมู่ในเซิร์ฟเวอร์นี้" };
  if (cat.type !== ChannelType.GuildCategory) return { ok: false, reason: "ID ที่ระบุไม่ใช่หมวดหมู่ (Category)" };
  return { ok: true, cat };
}
async function deleteThreadCreatedSystemMessage(parentChannel, threadId) {
  try {
    const msgs = await parentChannel.messages.fetch({ limit: 20 });
    for (const msg of msgs.values()) {
      if (msg.type === MessageType.ThreadCreated && msg.thread && msg.thread.id === threadId && msg.deletable) {
        await msg.delete().catch(() => {});
      }
    }
  } catch (e) {
    console.error("deleteThreadCreatedSystemMessage error:", e);
  }
}
async function tryAddMemberToThread(thread, userId) {
  try {
    await thread.members.add(userId).catch(() => {});
  } catch {}
}

module.exports = function (client) {
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content.startsWith("!ticket")) return;

      const args = message.content.trim().split(/\s+/);
      const categoryId = args[1];
      if (!categoryId) return message.reply("❌ กรุณาระบุรหัสหมวดหมู่ เช่น `!ticket 123456789012345678`");

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

  async function createTicketChannel(interaction, mode) {
    try {
      const guildId = interaction.guild.id;
      const settingsDoc = await db.doc(`ticket_settings/${guildId}`).get();
      const parentCategoryId =
        (mode === "sculpt" || mode === "figura") ? MODEL_CATEGORY_ID :
        (settingsDoc.exists && settingsDoc.data().categoryId) ? settingsDoc.data().categoryId : null;

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
        mode === "sculpt" ? `🔥-𝕄𝕠𝕕𝕖𝕝_${interaction.user.username}` :
        mode === "figura" ? `🔥-𝔽𝕚𝕈𝕦𝕣𝕒_${interaction.user.username}` :
                            `🔥-𝕋𝕚𝕜𝕜𝕖𝕥_${interaction.user.username}`;

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

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setLabel("ปิดตั๋ว").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("upgrade_priority").setLabel("อัปเป็นคิวเร่ง").setStyle(ButtonStyle.Danger)
      );
      const contentTag = (mode === "sculpt" || mode === "figura") ? `<@${interaction.user.id}> <@&${MODEL_ROLE_ID}>` : `<@${interaction.user.id}>`;
      const openEmbed = new EmbedBuilder().setTitle("ขอบคุณที่ไว้ใจร้านเรา").setDescription("กรอก/แจ้งข้อมูลที่ด้านล่างได้เลยนะคับ").setColor(0x9b59b6);
      await channel.send({ content: contentTag, embeds: [openEmbed], components: [controlRow] });

      if (mode === "bundle") {
        const embed = new EmbedBuilder().setTitle("รวมแอดออนสกิน").setDescription("**กดปุ่มเพื่อกรอกจำนวนแอดออนที่จะรวม ( 10 บาท / ชิ้น )**").setColor(0x9b59b6);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_bundle_modal").setLabel("กรอกจำนวนแอดออน").setStyle(ButtonStyle.Primary));
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
      if (mode === "figura") {
        await channel.send({ embeds: [figuraOptionEmbed()], components: figuraOptionComponents() });
      }

      await interaction.editReply(`✅ เปิดตั๋วให้แล้ว : ${channel}`);
      return channel;
    } catch (err) {
      try { await ensureDeferred(interaction, true); await interaction.editReply("❌ เกิดข้อผิดพลาดในการสร้างห้อง"); } catch {}
      console.error("createTicketChannel error:", err);
      return null;
    }
  }

  async function postStandardUIInChannel(channel) {
    await channel.send({ embeds: [optionEmbed()], components: optionComponents() });
  }

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (interaction.customId === "create_ticket_standard") {
          const modal = new ModalBuilder().setCustomId("order_qty_modal_standard").setTitle("จำนวนชิ้นที่จะสั่ง (แอดออนสกิน)");
          const qty = new TextInputBuilder()
            .setCustomId("order_qty")
            .setLabel("จำนวนแอดออนที่จะสั่ง (1ถึง20)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("เช่น 1, 2, 3 ...")
            .setMinLength(1)
            .setMaxLength(3);
          modal.addComponents(new ActionRowBuilder().addComponents(qty));
          await interaction.showModal(modal);
          return;
        }

        if (
          interaction.customId === "create_ticket_bundle" ||
          interaction.customId === "create_ticket_preset" ||
          interaction.customId === "create_ticket_sculpt" ||
          interaction.customId === "create_ticket_figura"
        ) {
          await ensureDeferred(interaction, true);
          const mode =
            interaction.customId === "create_ticket_bundle" ? "bundle" :
            interaction.customId === "create_ticket_preset" ? "preset" :
            interaction.customId === "create_ticket_figura" ? "figura" : "sculpt";
          await createTicketChannel(interaction, mode);
          return;
        }

        if (interaction.customId === "close_ticket") {
          const member = interaction.guild.members.cache.get(interaction.user.id);
          if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return safeReply(interaction, { content: "❌ คุณไม่มีสิทธิ์ในการปิดตั๋วนี้" }, true);
          }
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
            return safeReply(interaction, { content: "✅ อัปเป็นคิวเร่งแล้ว" }, true);
          } catch {
            return safeReply(interaction, { content: "❌ เปลี่ยนชื่อห้องไม่สำเร็จ" }, true);
          }
        }

        if (interaction.customId === "open_bundle_modal") {
          const modal = new ModalBuilder().setCustomId("bundle_modal").setTitle("รวมแอดออนสกิน");
          const qty = new TextInputBuilder().setCustomId("bundle_count").setLabel("จำนวนแอดออนที่จะรวม (ตัวเลข)").setPlaceholder("เช่น 12").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(4);
          modal.addComponents(new ActionRowBuilder().addComponents(qty));
          await interaction.showModal(modal);
          return;
        }

        if (interaction.customId === "open_skin_form") {
          const modal = new ModalBuilder()
            .setCustomId("skin_order_form")
            .setTitle("กรอกข้อมูลเพิ่มเติม");

          const xbox = new TextInputBuilder()
            .setCustomId("xbox_name")
            .setLabel("ชื่อXbox (ถูกต้อง100%)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("เช่น Seamuww");

          const lock = new TextInputBuilder()
            .setCustomId("lock_option")
            .setLabel("ล็อกให้ใช้ได้คนเดียวไหม")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("เช่น ล็อก / ไม่ล็อก");

          const slot = new TextInputBuilder()
            .setCustomId("slot")
            .setLabel("ช่องที่ใส่ (หมวก,เกราะ,กางเกง,รองเท้า)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("เช่น หมวก");

          modal.addComponents(
            new ActionRowBuilder().addComponents(xbox),
            new ActionRowBuilder().addComponents(lock),
            new ActionRowBuilder().addComponents(slot)
          );

          await interaction.showModal(modal);
          return;
        }
        if (interaction.customId === "edit_skin_form") {
  const k = keyOf(interaction.user.id, interaction.channel.id);
  const last = formData.get(k) || { xboxName: "", lockOption: "", slot: "" };

  const modal = new ModalBuilder()
    .setCustomId("skin_order_form")
    .setTitle("แก้ไขข้อมูลเพิ่มเติม");

  const xbox = new TextInputBuilder()
    .setCustomId("xbox_name")
    .setLabel("ชื่อXbox (ถูกต้อง100%)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("ถ้าแบบ Seamuww#3749 ให้ลบ#ออก")
    .setValue(last.xboxName || "");

  const lock = new TextInputBuilder()
    .setCustomId("lock_option")
    .setLabel("ล็อกให้ใช้ได้คนเดียวไหม")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("เช่น ล็อก / ไม่ล็อก")
    .setValue(last.lockOption || "");

  const slot = new TextInputBuilder()
    .setCustomId("slot")
    .setLabel("ช่องที่ใส่ (หมวก,เกราะ,กางเกง,รองเท้า)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("เช่น หมวก")
    .setValue(last.slot || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(xbox),
    new ActionRowBuilder().addComponents(lock),
    new ActionRowBuilder().addComponents(slot)
  );

  await interaction.showModal(modal);
  return;
}


        if (interaction.customId === "fig_rights_normal" || interaction.customId === "fig_rights_plus50" || interaction.customId === "fig_rights_x2") {
          const k = keyOf(interaction.user.id, interaction.channel.id);
          if ((ticketModes.get(k) || "") !== "figura") return safeReply(interaction, { content: "โปรดเลือกสิ่งที่ต้องการก่อน" }, true);
          figuraRights.set(k, interaction.customId === "fig_rights_plus50" ? "plus50" : interaction.customId === "fig_rights_x2" ? "x2" : "normal");
          await postOrReplaceSummary(interaction);
          try { await interaction.deferUpdate(); } catch {}
          return;
        }

        if (interaction.customId === "no_options") {
          const uid = interaction.user.id;
          const cid = interaction.channel.id;
          const k = keyOf(uid, cid);
          if (!ticketModes.has(k)) initState(uid, cid, "standard");
          else ticketModes.set(k, "standard");

          setSubtotal(k, 0);
          setDetails(k, []);
          userSelections.set(k, new Set());
          dynamicState.set(k, { bangsQty: null, bangsBringOwn: false, bangsMoveQty: null, buffQty: null, buffNotes: "" });

          await postOrReplaceSummary(interaction);
          try { await interaction.deferUpdate(); } catch {}
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === "order_qty_modal_standard") {
          const raw = (interaction.fields.getTextInputValue("order_qty") || "").trim();
          if (!/^\d{1,3}$/.test(raw)) return safeReply(interaction, { content: "❌ กรุณากรอกจำนวนเป็นเลข 1-999" }, true);
          const qty = Math.max(1, parseInt(raw, 10));

          await ensureDeferred(interaction, true);
          const chan = await createTicketChannel(interaction, "standard");
          if (!chan) return;

          channelOwner.set(chan.id, interaction.user.id);
          formRequired.set(chan.id, true);
          formCompleted.set(chan.id, false);

          if (qty === 1) {
            await postStandardUIInChannel(chan);
            await interaction.editReply(`✅ เปิดตั๋วให้แล้ว : ${chan}`);
            return;
          }

          const threadLinks = [];
          for (let i = 1; i <= qty; i++) {
            const thread = await chan.threads.create({
              name: `ตัวที่ ${i}`,
              autoArchiveDuration: 10080,
              type: ChannelType.PublicThread,
            });
            channelOwner.set(thread.id, interaction.user.id);
            formRequired.set(thread.id, true);
            formCompleted.set(thread.id, false);

            await tryAddMemberToThread(thread, interaction.user.id);
            await thread.send({
              content: `<@${interaction.user.id}>`,
              embeds: [optionEmbed()],
              components: optionComponents(),
            });
            await deleteThreadCreatedSystemMessage(chan, thread.id);
            const url = `https://discord.com/channels/${chan.guild.id}/${thread.id}`;
            threadLinks.push(`**[ตัวที่ ${i}](${url})**`);
          }
          const listEmbed = new EmbedBuilder()
            .setTitle("เปิดรายการตามจำนวนที่สั่งแล้ว")
            .setDescription(threadLinks.map((t, idx) => `**${idx + 1}.** **${t}**`).join("\n"))
            .setColor(0x9b59b6);
          await chan.send({ embeds: [listEmbed] });
          await interaction.editReply(`✅ เปิดตั๋วให้แล้ว : ${chan}`);
          return;
        }

        if (interaction.customId === "bundle_modal") {
          const raw = (interaction.fields.getTextInputValue("bundle_count") || "").trim();
          if (!/^\d{1,4}$/.test(raw)) return safeReply(interaction, { content: "❌ กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็ม 0-9999" }, true);
          const n = parseInt(raw, 10);
          if (!Number.isFinite(n) || n < 0) return safeReply(interaction, { content: "❌ กรุณากรอกจำนวนเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, true);
          const addPrice = n * 10;
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "bundle");
          userSelections.set(k, new Set());
          setDetails(k, [`**• รวมแอดออนสกิน: ${n} × 10 = ${addPrice} บาท**`]);
          setSubtotal(k, addPrice);
          await ensureDeferred(interaction, true);
          await postOrReplaceSummary(interaction);
          await interaction.editReply("✅ บันทึกรวมแอดออนแล้ว");
          return;
        }

        if (interaction.customId === "skin_order_form") {
  const xboxName  = interaction.fields.getTextInputValue("xbox_name")  || "";
  const lockOption = interaction.fields.getTextInputValue("lock_option") || "";
  const slot      = interaction.fields.getTextInputValue("slot")       || "";

  const k = keyOf(interaction.user.id, interaction.channel.id);
  formData.set(k, { xboxName, lockOption, slot });

  const oldMsg = formMessages.get(k);
  if (oldMsg && oldMsg.deletable) await oldMsg.delete().catch(() => {});
  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("edit_skin_form")
      .setLabel("แก้ไข")
      .setStyle(ButtonStyle.Secondary)
  );

  const newMsg = await interaction.channel.send({
    content:
      `<@${interaction.user.id}>\n\n` +
      `## ชื่อ Xbox : \`${xboxName}\`\n` +
      `## ล็อกให้ใช้ได้คนเดียวไหม : ${lockOption}\n` +
      `## ช่องที่ใส่ : ${slot}`,
    components: [editRow],
  });
  formMessages.set(k, newMsg);

  formCompleted.set(interaction.channel.id, true);
  await postOrReplaceSummary(interaction);
  try { await interaction.deferUpdate(); } catch {}
  return;
}


        if (interaction.customId === "details_modal") {
          const k = keyOf(interaction.user.id, interaction.channel.id);
          const set = userSelections.get(k) || new Set();
          const dyn = ensureDyn(k);

          if (set.has("bangs")) {
            const raw = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
            if (!raw || raw === "own") { dyn.bangsBringOwn = true; dyn.bangsQty = null; }
            else if (/^\d+$/.test(raw)) { dyn.bangsBringOwn = false; dyn.bangsQty = parseInt(raw, 10); }
            else return safeReply(interaction, { content: "❌ ปอยผม: กรอกตัวเลข หรือพิมพ์ own" }, true);
          }
          if (set.has("bangs_move")) {
            const raw = (interaction.fields.getTextInputValue("bangs_move_qty") || "").trim();
            if (!/^\d+$/.test(raw)) return safeReply(interaction, { content: "❌ ปอยผมขยับ: กรุณากรอกจำนวนเป็นเลขจำนวนเต็ม" }, true);
            ensureDyn(k).bangsMoveQty = parseInt(raw, 10);
          }
          if (set.has("buff")) {
            const rawQ = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
            if (!/^\d+$/.test(rawQ)) return safeReply(interaction, { content: "❌ บัฟ: กรุณากรอกจำนวนเป็นเลขจำนวนเต็ม" }, true);
            ensureDyn(k).buffQty = parseInt(rawQ, 10);
            ensureDyn(k).buffNotes = (interaction.fields.getTextInputValue("buff_notes") || "").trim();
          }
          await postOrReplaceSummary(interaction);
          try { await interaction.deferUpdate(); } catch {}
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
            const modal = new ModalBuilder().setCustomId("details_modal").setTitle("กรอกรายละเอียดแอดออน");
            if (needBangs) {
              modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("bangs_qty_or_own").setLabel("ปอยผม: จำนวนจุด หรือพิมพ์ own = นำมาเอง").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("เช่น 3 หรือ own")
              ));
            }
            if (needMove) {
              modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("bangs_move_qty").setLabel("ปอยผมขยับ: จำนวนจุด (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2")
              ));
            }
            if (needBuff) {
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("buff_qty").setLabel("เอฟเฟก/บัฟ: จำนวน (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("buff_notes").setLabel("รายละเอียดบัฟ (ถ้ามี)").setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder("พิมพ์ได้หลายบรรทัด"))
              );
            }
            await interaction.showModal(modal);
            return;
          }
          await interaction.deferUpdate();
          await postOrReplaceSummary(interaction);
          return;
        }

        if (interaction.customId === "figura_select") {
          const k = keyOf(interaction.user.id, interaction.channel.id);
          ticketModes.set(k, "figura");
          const set = new Set(interaction.values || []);
          userSelections.set(k, set);

          const lines = [];
          for (const v of set) {
            if (!v.startsWith("fig_")) continue;
            const mk = v.slice(4);
            lines.push(`**• ${FIG_LABELS[mk]}: ${FIG_PRICES[mk]} บาท**`);
          }
          setDetails(k, lines);
          setSubtotal(k, computeFiguraTotal(k));
          await interaction.deferUpdate();
          await postOrReplaceSummary(interaction);
          return;
        }

        if (interaction.customId === "preset_select") {
          const table = {
            cloak6_100: { name: "ผ้าคลุม 6 สี", price: 100 },
            foxtail12_90: { name: "หู-หางจิ้งจอก 12 สี", price: 90 },
            umbrella12_90: { name: "ร่ม 12 สี", price: 90 },
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
          setDetails(k, lines);
          setSubtotal(k, subtotal);
          await postOrReplaceSummary(interaction);
          try { await interaction.deferUpdate(); } catch {}
          return;
        }
      }
    } catch (err) {
      console.error("interactionCreate error:", err);
      try {
        if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ มีข้อผิดพลาด", flags: MessageFlags.Ephemeral });
        }
      } catch {}
    }
  });

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const ownerId = channelOwner.get(message.channel.id);
      const needForm = formRequired.get(message.channel.id);
      const doneForm = formCompleted.get(message.channel.id);

      if (!ownerId || !needForm) return;
      if (doneForm) return;
      if (message.author.id !== ownerId) return;

      if (!message.content.startsWith("!ticket")) {
        await message.reply("# กรอกข้อมูลด้วยน้าา");
      }
    } catch (e) {
      console.error("messageCreate reminder error:", e);
    }
  });
};
