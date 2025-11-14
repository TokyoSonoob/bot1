const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");

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

const NS = "qqmain";
const TAG = {
  SELECT_MAIN: `${NS}:select_main`,
  NOOPT: `${NS}:noopt`,
  BANGS_MODAL: `${NS}:bangs_modal`,
  BANGS_MOVE_MODAL: `${NS}:bangs_move_modal`,
  BUFF_MODAL: `${NS}:buff_modal`,
  BOTH_BANGS_BUFF: `${NS}:both_bangs_buff`,
  BOTH_BANGS_MOVE: `${NS}:both_bangs_move`,
  BOTH_MOVE_BUFF: `${NS}:both_move_buff`,
  ALL_THREE: `${NS}:all_three`,
};

const store = new Map();
function blankState() {
  return { selections: new Set(), bangs: { own: false, qty: null }, bangs_move: { qty: null }, buff: { qty: null } };
}
function resetState(userId) {
  store.set(userId, blankState());
  return store.get(userId);
}
function ensureState(userId) {
  if (!store.has(userId)) store.set(userId, blankState());
  return store.get(userId);
}

function standardOptionsAsSelectOptions() {
  const opts = [];
  for (const key of Object.keys(labels)) {
    let desc = `ราคา ${prices[key] ?? 0} บาท`;
    if (key === "bangs") desc = `จุดละ ${PER_PIECE} / นำมาเอง ${BRING_OWN_FLAT}`;
    if (key === "bangs_move") desc = `จุดละ ${PER_PIECE}`;
    if (key === "buff") desc = `บัฟละ ${BUFF_PER}`;
    opts.push({ label: labels[key], value: key, description: desc });
  }
  return opts;
}
function normalizeSelections(arr) {
  let sel = Array.from(new Set(arr));
  if (sel.includes("face_change")) {
    if (!sel.includes("eye_move")) sel.push("eye_move");
    if (!sel.includes("eye_blink")) sel.push("eye_blink");
  }
  return Array.from(new Set(sel));
}
function computeTotal(s) {
  let subtotal = 0;
  for (const v of s.selections) {
    if (v === "bangs" || v === "bangs_move" || v === "buff") continue;
    subtotal += prices[v] || 0;
  }
  if (s.selections.has("bangs")) {
    if (s.bangs.own) subtotal += BRING_OWN_FLAT;
    else if (Number.isFinite(s.bangs.qty)) subtotal += s.bangs.qty * PER_PIECE;
  }
  if (s.selections.has("bangs_move")) {
    if (Number.isFinite(s.bangs_move.qty)) subtotal += s.bangs_move.qty * PER_PIECE;
  }
  if (s.selections.has("buff")) {
    if (Number.isFinite(s.buff.qty)) subtotal += s.buff.qty * BUFF_PER;
  }
  return subtotal + ADDON_BASE_PRICE;
}
function summaryLines(s) {
  const lines = [];
  const fixed = [...s.selections].filter(v => v !== "bangs" && v !== "bangs_move" && v !== "buff");
  for (const v of fixed) lines.push(`**• ${labels[v]}: ${prices[v] || 0} บาท**`);
  if (s.selections.has("bangs")) {
    if (s.bangs.own) lines.push(`**• ${labels.bangs}: นำมาเอง ${BRING_OWN_FLAT} บาท**`);
    else if (Number.isFinite(s.bangs.qty)) {
      const add = s.bangs.qty * PER_PIECE;
      lines.push(`**• ${labels.bangs}: ${s.bangs.qty} × ${PER_PIECE} = ${add} บาท**`);
    }
  }
  if (s.selections.has("bangs_move") && Number.isFinite(s.bangs_move.qty)) {
    const add = s.bangs_move.qty * PER_PIECE;
    lines.push(`**• ${labels.bangs_move}: ${s.bangs_move.qty} × ${PER_PIECE} = ${add} บาท**`);
  }
  if (s.selections.has("buff") && Number.isFinite(s.buff.qty)) {
    const add = s.buff.qty * BUFF_PER;
    lines.push(`**• ${labels.buff}: ${s.buff.qty} × ${BUFF_PER} = ${add} บาท**`);
  }
  lines.push(`**• ค่าแอดออน: ${ADDON_BASE_PRICE} บาท**`);
  lines.push(`\n**รวมราคา: ${computeTotal(s)} บาท**`);
  return lines;
}
function embed_Summary(s) {
  return new EmbedBuilder().setTitle("รวมราคาแอดออน (โหมดตรวจราคา)").setDescription(summaryLines(s).join("\n")).setColor(0x9b59b6);
}

function view_MainLike() {
  return { embeds: [new EmbedBuilder().setTitle("ตรวจสอบราคาก่อนสั่งจริง").setDescription("เลือกออฟชั่นที่คุณต้องการ หรือกด 'ไม่มีออฟชั่น'").setColor(0x9b59b6).setImage("https://i.pinimg.com/originals/0e/fc/37/0efc37beac56403a65a32d5ad79db7a0.gif")] };
}
function row_Select() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(TAG.SELECT_MAIN).setPlaceholder("เลือกออฟชั่น").setMinValues(1).setMaxValues(Object.keys(labels).length).addOptions(...standardOptionsAsSelectOptions())
  );
}
function row_Noopt() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(TAG.NOOPT).setLabel("ไม่มีออฟชั่น").setStyle(ButtonStyle.Secondary));
}

function modal_Bangs() {
  const m = new ModalBuilder().setCustomId(TAG.BANGS_MODAL).setTitle("กำหนดปอยผม");
  const i = new TextInputBuilder().setCustomId("bangs_qty_or_own").setLabel("จำนวนปอยผม (เว้นว่างหรือพิมพ์ own = นำมาเอง)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("เช่น 3 หรือ own");
  m.addComponents(new ActionRowBuilder().addComponents(i));
  return m;
}
function modal_BangsMove() {
  const m = new ModalBuilder().setCustomId(TAG.BANGS_MOVE_MODAL).setTitle("กำหนดปอยผมขยับ");
  const i = new TextInputBuilder().setCustomId("bangs_move_qty").setLabel("จำนวนจุดขยับ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  m.addComponents(new ActionRowBuilder().addComponents(i));
  return m;
}
function modal_Buff() {
  const m = new ModalBuilder().setCustomId(TAG.BUFF_MODAL).setTitle("กำหนดจำนวนบัฟ");
  const i = new TextInputBuilder().setCustomId("buff_qty").setLabel("จำนวนบัฟ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  m.addComponents(new ActionRowBuilder().addComponents(i));
  return m;
}
function modal_Both_Bangs_Buff() {
  const m = new ModalBuilder().setCustomId(TAG.BOTH_BANGS_BUFF).setTitle("กำหนดปอยผม + บัฟ");
  const a = new TextInputBuilder().setCustomId("bangs_qty_or_own").setLabel("จำนวนปอยผม (เว้นว่างหรือพิมพ์ own = นำมาเอง)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("เช่น 3 หรือ own");
  const b = new TextInputBuilder().setCustomId("buff_qty").setLabel("จำนวนบัฟ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  m.addComponents(new ActionRowBuilder().addComponents(a), new ActionRowBuilder().addComponents(b));
  return m;
}
function modal_Both_BangsMove() {
  const m = new ModalBuilder().setCustomId(TAG.BOTH_BANGS_MOVE).setTitle("กำหนดปอยผม + ปอยผมขยับ");
  const a = new TextInputBuilder().setCustomId("bangs_qty_or_own").setLabel("จำนวนปอยผม (เว้นว่างหรือพิมพ์ own = นำมาเอง)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("เช่น 3 หรือ own");
  const b = new TextInputBuilder().setCustomId("bangs_move_qty").setLabel("จำนวนจุดขยับ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  m.addComponents(new ActionRowBuilder().addComponents(a), new ActionRowBuilder().addComponents(b));
  return m;
}
function modal_Both_Move_Buff() {
  const m = new ModalBuilder().setCustomId(TAG.BOTH_MOVE_BUFF).setTitle("กำหนดปอยผมขยับ + บัฟ");
  const a = new TextInputBuilder().setCustomId("bangs_move_qty").setLabel("จำนวนจุดขยับ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  const b = new TextInputBuilder().setCustomId("buff_qty").setLabel("จำนวนบัฟ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  m.addComponents(new ActionRowBuilder().addComponents(a), new ActionRowBuilder().addComponents(b));
  return m;
}
function modal_AllThree() {
  const m = new ModalBuilder().setCustomId(TAG.ALL_THREE).setTitle("กำหนดปอยผม + ปอยผมขยับ + บัฟ");
  const a = new TextInputBuilder().setCustomId("bangs_qty_or_own").setLabel("จำนวนปอยผม (เว้นว่างหรือพิมพ์ own = นำมาเอง)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("เช่น 3 หรือ own");
  const b = new TextInputBuilder().setCustomId("bangs_move_qty").setLabel("จำนวนจุดขยับ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  const c = new TextInputBuilder().setCustomId("buff_qty").setLabel("จำนวนบัฟ (ตัวเลข)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("เช่น 2");
  m.addComponents(new ActionRowBuilder().addComponents(a), new ActionRowBuilder().addComponents(b), new ActionRowBuilder().addComponents(c));
  return m;
}

const replyEphemeral = (embeds, components = []) => ({ embeds: Array.isArray(embeds) ? embeds : [embeds], components, flags: MessageFlags.Ephemeral });

module.exports = function (client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.content.trim() !== "!t") return;
    await message.channel.send({ ...view_MainLike(), components: [row_Select(), row_Noopt()] });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isStringSelectMenu() && interaction.customId === TAG.SELECT_MAIN) {
        const userId = interaction.user.id;
        const s = resetState(userId);
        s.selections = new Set(normalizeSelections(interaction.values || []));
        const needBangs = s.selections.has("bangs");
        const needMove = s.selections.has("bangs_move");
        const needBuff = s.selections.has("buff");
        if (needBangs && needMove && needBuff) {
          await interaction.showModal(modal_AllThree());
          return;
        }
        if (needBangs && needMove) {
          await interaction.showModal(modal_Both_BangsMove());
          return;
        }
        if (needMove && needBuff) {
          await interaction.showModal(modal_Both_Move_Buff());
          return;
        }
        if (needBangs && needBuff) {
          await interaction.showModal(modal_Both_Bangs_Buff());
          return;
        }
        if (needBangs) {
          await interaction.showModal(modal_Bangs());
          return;
        }
        if (needMove) {
          await interaction.showModal(modal_BangsMove());
          return;
        }
        if (needBuff) {
          await interaction.showModal(modal_Buff());
          return;
        }
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isButton() && interaction.customId === TAG.NOOPT) {
        const s = resetState(interaction.user.id);
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.BANGS_MODAL) {
        const s = ensureState(interaction.user.id);
        const raw = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
        if (!raw || raw === "own") s.bangs = { own: true, qty: null };
        else if (/^\d+$/.test(raw)) s.bangs = { own: false, qty: parseInt(raw, 10) };
        else return interaction.reply({ content: "❌ รูปแบบปอยผมไม่ถูกต้อง (กรอกตัวเลข, เว้นว่าง หรือพิมพ์ own)", flags: MessageFlags.Ephemeral });
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.BANGS_MOVE_MODAL) {
        const s = ensureState(interaction.user.id);
        const raw = (interaction.fields.getTextInputValue("bangs_move_qty") || "").trim();
        if (!/^\d+$/.test(raw)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนจุดขยับเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.bangs_move = { qty: parseInt(raw, 10) };
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.BUFF_MODAL) {
        const s = ensureState(interaction.user.id);
        const raw = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
        if (!/^\d+$/.test(raw)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.buff = { qty: parseInt(raw, 10) };
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.BOTH_BANGS_BUFF) {
        const s = ensureState(interaction.user.id);
        const rawBangs = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
        if (!rawBangs || rawBangs === "own") s.bangs = { own: true, qty: null };
        else if (/^\d+$/.test(rawBangs)) s.bangs = { own: false, qty: parseInt(rawBangs, 10) };
        else return interaction.reply({ content: "❌ รูปแบบปอยผมไม่ถูกต้อง (กรอกตัวเลข, เว้นว่าง หรือพิมพ์ own)", flags: MessageFlags.Ephemeral });
        const rawBuff = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
        if (!/^\d+$/.test(rawBuff)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.buff = { qty: parseInt(rawBuff, 10) };
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.BOTH_BANGS_MOVE) {
        const s = ensureState(interaction.user.id);
        const rawBangs = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
        if (!rawBangs || rawBangs === "own") s.bangs = { own: true, qty: null };
        else if (/^\d+$/.test(rawBangs)) s.bangs = { own: false, qty: parseInt(rawBangs, 10) };
        else return interaction.reply({ content: "❌ รูปแบบปอยผมไม่ถูกต้อง (กรอกตัวเลข, เว้นว่าง หรือพิมพ์ own)", flags: MessageFlags.Ephemeral });
        const rawMove = (interaction.fields.getTextInputValue("bangs_move_qty") || "").trim();
        if (!/^\d+$/.test(rawMove)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนจุดขยับเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.bangs_move = { qty: parseInt(rawMove, 10) };
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.BOTH_MOVE_BUFF) {
        const s = ensureState(interaction.user.id);
        const rawMove = (interaction.fields.getTextInputValue("bangs_move_qty") || "").trim();
        if (!/^\d+$/.test(rawMove)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนจุดขยับเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.bangs_move = { qty: parseInt(rawMove, 10) };
        const rawBuff = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
        if (!/^\d+$/.test(rawBuff)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.buff = { qty: parseInt(rawBuff, 10) };
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === TAG.ALL_THREE) {
        const s = ensureState(interaction.user.id);
        const rawBangs = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
        if (!rawBangs || rawBangs === "own") s.bangs = { own: true, qty: null };
        else if (/^\d+$/.test(rawBangs)) s.bangs = { own: false, qty: parseInt(rawBangs, 10) };
        else return interaction.reply({ content: "❌ รูปแบบปอยผมไม่ถูกต้อง (กรอกตัวเลข, เว้นว่าง หรือพิมพ์ own)", flags: MessageFlags.Ephemeral });
        const rawMove = (interaction.fields.getTextInputValue("bangs_move_qty") || "").trim();
        if (!/^\d+$/.test(rawMove)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนจุดขยับเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.bangs_move = { qty: parseInt(rawMove, 10) };
        const rawBuff = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
        if (!/^\d+$/.test(rawBuff)) return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        s.buff = { qty: parseInt(rawBuff, 10) };
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }
    } catch (e) {
      console.error("qqmain error:", e);
      try {
        if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ มีข้อผิดพลาด", flags: MessageFlags.Ephemeral });
        }
      } catch {}
    }
  });
};
