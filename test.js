// test_quote_like_main_forms.js — discord.js v14
// !test → ส่ง UI เลือกออฟชั่น (public เหมือนอันหลัก)
// ถ้าเลือก “ปอยผม/บัฟ” จะเปิดฟอร์ม (Modal) ให้กรอก:
//   - เลือกทั้งคู่ → ฟอร์มรวม (ปอยผม + บัฟ) → สรุปราคาเป็น ephemeral "ข้อความเดียว"
//   - เลือกอย่างใดอย่างหนึ่ง → ฟอร์มเฉพาะ → สรุปเป็น ephemeral "ข้อความเดียว"
// ไม่มี "รายละเอียดบัฟ", เลือกใหม่จะล้างสถานะทั้งหมด

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

// ==== CONFIG (เหมือนอันหลัก) ====
const ADDON_BASE_PRICE = 30;
const labels = {
  hair_move: "ผมขยับ",
  long_hair_move: "ผมขยับยาว",
  eye_blink: "ตากระพริบ",
  eye_blink_new: "ตากระพริบใหม่",
  boobs: "หน้าอก",
  bangs: "ปอยผม",
  glow_eye: "ตาเรืองแสง",
  eye_move: "ตาขยับ",
  buff: "เอฟเฟก/บัฟ",
  face_change: "เปลี่ยนสีหน้า",
};
const prices = {
  hair_move: 30,
  long_hair_move: 70,
  eye_blink: 25,
  eye_blink_new: 35,
  boobs: 25,
  glow_eye: 35,
  eye_move: 100,
  face_change: 100,
};

const PER_PIECE = 10;      // ปอยผม/จุด
const BRING_OWN_FLAT = 10; // ปอยผมนำมาเอง
const BUFF_PER = 5;        // บัฟ/ชิ้น

// ==== Namespace/IDs ====
const NS = "qqmain";
const id = (tag, owner) => `${NS}:${tag}:${owner}`;
const TAG = {
  SELECT_MAIN: "select_main",
  NOOPT: "noopt",

  // Modals (แยก/รวม)
  BANGS_MODAL: "bangs_modal",
  BUFF_MODAL: "buff_modal",
  BOTH_MODAL: "both_modal",
};

// ==== state ต่อ user ====
const store = new Map();
function blankState() {
  return {
    selections: new Set(),
    bangs: { own: false, qty: null },
    buff: { qty: null },
  };
}
function resetState(userId) {
  store.set(userId, blankState());
  return store.get(userId);
}
function ensureState(userId) {
  if (!store.has(userId)) store.set(userId, blankState());
  return store.get(userId);
}
function denyIfNotOwner(interaction, owner) {
  if (interaction.user.id !== owner) {
    interaction.reply({ content: "เมนูนี้ไม่ใช่ของคุณนะครับ", flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
  return false;
}

// ==== Logic (เหมือนอันหลัก) ====
function standardOptionsAsSelectOptions() {
  const opts = [];
  for (const key of Object.keys(labels)) {
    let desc = `ราคา ${prices[key] ?? 0} บาท`;
    if (key === "bangs") desc = `จุดละ ${PER_PIECE} / นำมาเอง ${BRING_OWN_FLAT}`;
    if (key === "buff")  desc = `บัฟละ ${BUFF_PER}`;
    opts.push({ label: labels[key], value: key, description: desc });
  }
  return opts;
}
function normalizeSelections(arr) {
  let sel = Array.from(new Set(arr));
  if (sel.includes("hair_move") && sel.includes("long_hair_move")) {
    sel = sel.filter(v => v !== "hair_move");
  }
  if (sel.includes("eye_blink") && sel.includes("eye_blink_new")) {
    sel = sel.filter(v => v !== "eye_blink");
  }
  if (sel.includes("face_change")) {
    if (!sel.includes("eye_move")) sel.push("eye_move");
    if (!sel.includes("eye_blink_new")) sel.push("eye_blink_new");
    sel = sel.filter(v => v !== "eye_blink");
  }
  return Array.from(new Set(sel));
}
function computeTotal(s) {
  let subtotal = 0;
  for (const v of s.selections) {
    if (v === "bangs" || v === "buff") continue;
    subtotal += prices[v] || 0;
  }
  if (s.selections.has("bangs")) {
    if (s.bangs.own) subtotal += BRING_OWN_FLAT;
    else if (Number.isFinite(s.bangs.qty)) subtotal += s.bangs.qty * PER_PIECE;
  }
  if (s.selections.has("buff")) {
    if (Number.isFinite(s.buff.qty)) subtotal += s.buff.qty * BUFF_PER;
  }
  return subtotal + ADDON_BASE_PRICE;
}
function summaryLines(s) {
  const lines = [];
  const fixed = [...s.selections].filter(v => v !== "bangs" && v !== "buff");
  for (const v of fixed) lines.push(`**• ${labels[v]}: ${prices[v] || 0} บาท**`);
  if (s.selections.has("bangs")) {
    if (s.bangs.own) lines.push(`**• ${labels.bangs}: นำมาเอง ${BRING_OWN_FLAT} บาท**`);
    else if (Number.isFinite(s.bangs.qty)) {
      const add = s.bangs.qty * PER_PIECE;
      lines.push(`**• ${labels.bangs}: ${s.bangs.qty} × ${PER_PIECE} = ${add} บาท**`);
    }
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
  return new EmbedBuilder()
    .setTitle("รวมราคาแอดออน (โหมดตรวจราคา)")
    .setDescription(summaryLines(s).join("\n"))
    .setColor(0x9b59b6);
}

// ==== Views (public main) ====
function view_MainLike() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("ตรวจสอบราคาก่อนสั่งจริง")
        .setDescription("เลือกออฟชั่นที่คุณต้องการ หรือกด 'ไม่มีออฟชั่น'")
        .setColor(0x9b59b6),
    ],
  };
}
function row_Select(owner) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id(TAG.SELECT_MAIN, owner))
      .setPlaceholder("เลือกออฟชั่น")
      .setMinValues(1)
      .setMaxValues(Object.keys(labels).length)
      .addOptions(...standardOptionsAsSelectOptions())
  );
}
function row_Noopt(owner) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id(TAG.NOOPT, owner)).setLabel("ไม่มีออฟชั่น").setStyle(ButtonStyle.Secondary)
  );
}

// ==== Modals ====
// ปอยผม: กรอก “จำนวนปอยผม” หรือเว้นว่าง/พิมพ์ own = นำมาเอง
function modal_Bangs(owner) {
  const modal = new ModalBuilder().setCustomId(id(TAG.BANGS_MODAL, owner)).setTitle("กำหนดปอยผม");
  const qty = new TextInputBuilder()
    .setCustomId("bangs_qty_or_own")
    .setLabel("จำนวนปอยผม (เว้นว่างหรือพิมพ์ own = นำมาเอง)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("เช่น 3 หรือ own");
  modal.addComponents(new ActionRowBuilder().addComponents(qty));
  return modal;
}
// บัฟ: จำนวนบัฟ (ตัวเลข)
function modal_Buff(owner) {
  const modal = new ModalBuilder().setCustomId(id(TAG.BUFF_MODAL, owner)).setTitle("กำหนดจำนวนบัฟ");
  const qty = new TextInputBuilder()
    .setCustomId("buff_qty")
    .setLabel("จำนวนบัฟ (ตัวเลข)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("เช่น 2");
  modal.addComponents(new ActionRowBuilder().addComponents(qty));
  return modal;
}
// รวม (ปอยผม + บัฟ)
function modal_Both(owner) {
  const modal = new ModalBuilder().setCustomId(id(TAG.BOTH_MODAL, owner)).setTitle("กำหนดปอยผม + บัฟ");
  const bangs = new TextInputBuilder()
    .setCustomId("bangs_qty_or_own")
    .setLabel("จำนวนปอยผม (เว้นว่างหรือพิมพ์ own = นำมาเอง)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("เช่น 3 หรือ own");
  const buff = new TextInputBuilder()
    .setCustomId("buff_qty")
    .setLabel("จำนวนบัฟ (ตัวเลข)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("เช่น 2");
  modal.addComponents(
    new ActionRowBuilder().addComponents(bangs),
    new ActionRowBuilder().addComponents(buff),
  );
  return modal;
}

// ==== helpers ====
const replyEphemeral = (embeds, components=[]) =>
  ({ embeds: Array.isArray(embeds) ? embeds : [embeds], components, flags: MessageFlags.Ephemeral });

// ==== EXPORT ====
module.exports = function (client) {
  // !test → ส่ง UI สาธารณะ
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.content.trim() !== "!test") return;

    const owner = message.author.id;
    await message.channel.send({
      ...view_MainLike(),
      components: [row_Select(owner), row_Noopt(owner)],
    });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ===== เลือกออฟชั่น (public select)
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${NS}:${TAG.SELECT_MAIN}:`)) {
        const owner = interaction.customId.split(":").pop();
        if (denyIfNotOwner(interaction, owner)) return;

        // ล้างสถานะทุกครั้งที่เลือกใหม่
        const s = resetState(owner);
        s.selections = new Set(normalizeSelections(interaction.values || []));

        const needBangs = s.selections.has("bangs");
        const needBuff  = s.selections.has("buff");

        // ถ้าต้องกรอก → เปิด modal โดยตรง (จะไม่มีข้อความ ephemeral คั่นกลาง)
        if (needBangs && needBuff) {
          await interaction.showModal(modal_Both(owner));
          return;
        }
        if (needBangs) {
          await interaction.showModal(modal_Bangs(owner));
          return;
        }
        if (needBuff) {
          await interaction.showModal(modal_Buff(owner));
          return;
        }

        // ไม่ต้องกรอกอะไร → ส่งสรุปราคาเลย (ephemeral ข้อความเดียว)
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      // ===== ไม่มีออฟชั่น → สรุปราคา base อย่างเดียว
      if (interaction.isButton() && interaction.customId.startsWith(`${NS}:${TAG.NOOPT}:`)) {
        const owner = interaction.customId.split(":").pop();
        if (denyIfNotOwner(interaction, owner)) return;
        const s = resetState(owner);
        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      // ===== Modal Submit: Bangs
      if (interaction.isModalSubmit() && interaction.customId.startsWith(`${NS}:${TAG.BANGS_MODAL}:`)) {
        const owner = interaction.customId.split(":").pop();
        if (interaction.user.id !== owner) {
          await interaction.reply({ content: "เมนูนี้ไม่ใช่ของคุณนะครับ", flags: MessageFlags.Ephemeral });
          return;
        }
        const s = ensureState(owner);

        const raw = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
        if (!raw || raw === "own") {
          s.bangs = { own: true, qty: null };
        } else if (/^\d+$/.test(raw)) {
          s.bangs = { own: false, qty: parseInt(raw, 10) };
        } else {
          return interaction.reply({ content: "❌ รูปแบบปอยผมไม่ถูกต้อง (กรอกตัวเลข, เว้นว่าง หรือพิมพ์ own)", flags: MessageFlags.Ephemeral });
        }

        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      // ===== Modal Submit: Buff
      if (interaction.isModalSubmit() && interaction.customId.startsWith(`${NS}:${TAG.BUFF_MODAL}:`)) {
        const owner = interaction.customId.split(":").pop();
        if (interaction.user.id !== owner) {
          await interaction.reply({ content: "เมนูนี้ไม่ใช่ของคุณนะครับ", flags: MessageFlags.Ephemeral });
          return;
        }
        const s = ensureState(owner);

        const raw = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
        if (!/^\d+$/.test(raw)) {
          return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        }
        s.buff = { qty: parseInt(raw, 10) };

        await interaction.reply(replyEphemeral(embed_Summary(s)));
        return;
      }

      // ===== Modal Submit: Both (Bangs + Buff)
      if (interaction.isModalSubmit() && interaction.customId.startsWith(`${NS}:${TAG.BOTH_MODAL}:`)) {
        const owner = interaction.customId.split(":").pop();
        if (interaction.user.id !== owner) {
          await interaction.reply({ content: "เมนูนี้ไม่ใช่ของคุณนะครับ", flags: MessageFlags.Ephemeral });
          return;
        }
        const s = ensureState(owner);

        const rawBangs = (interaction.fields.getTextInputValue("bangs_qty_or_own") || "").trim().toLowerCase();
        if (!rawBangs || rawBangs === "own") {
          s.bangs = { own: true, qty: null };
        } else if (/^\d+$/.test(rawBangs)) {
          s.bangs = { own: false, qty: parseInt(rawBangs, 10) };
        } else {
          return interaction.reply({ content: "❌ รูปแบบปอยผมไม่ถูกต้อง (กรอกตัวเลข, เว้นว่าง หรือพิมพ์ own)", flags: MessageFlags.Ephemeral });
        }

        const rawBuff = (interaction.fields.getTextInputValue("buff_qty") || "0").trim();
        if (!/^\d+$/.test(rawBuff)) {
          return interaction.reply({ content: "❌ กรุณากรอกจำนวนบัฟเป็นตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป", flags: MessageFlags.Ephemeral });
        }
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
