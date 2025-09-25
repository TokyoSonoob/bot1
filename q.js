const {
  EmbedBuilder,
  MessageFlags,
  ApplicationCommandType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { db } = require("./firebase");

const CAT_QUEUE_TITLE = new Set(["1371791357525495890", "1386294803364315147"]);
const CAT_7DAYS = "1413875836687486998";
const CAT_14DAYS = "1374396536951406683";
const COMBINED_ADDON = new Set(["1371791357525495890", "1386294803364315147"]);

const ALLOWED_ROLE_IDS = new Set([
  "1374387525040214016",
  "1413865323337093300",
  "1413570692330426408",
  "1412438788612948028",
  "1374403865268453456",
  "1336564600598036501",
]);

const VIEW_CHANNEL_ID = "1420321722200231946";
const NAG_CHANNEL_ID = "1420674972388691978";
const ADDON_MENTION_ID = "571999000237178881";
const MODEL_MENTION_ID = "908160385465589791";
const SKIN_MENTION_MAP = {
  "สกินคุณฮิเคริ": "1134464935448023152",
  "สกินคุณสกาย": "1260765032413659159",
  "สกินมุยคุง": "1010202066720936048",
  "สกินคุณขิม": "1294133075801931870",
  "สกินคุณ nj": "1092393537238204497",
};
const NAG_TIMES = 10;

const TICK_MS = 1000;

function computeDurationMs(channel) {
  const catId = channel?.parentId ?? null;
  if (catId && CAT_QUEUE_TITLE.has(String(catId))) return 3 * 24 * 60 * 60 * 1000;
  if (String(catId) === CAT_7DAYS) return 7 * 24 * 60 * 60 * 1000;
  if (String(catId) === CAT_14DAYS) return 14 * 24 * 60 * 60 * 1000;
  return 3 * 24 * 60 * 60 * 1000;
}

function getSkinLineName(channel) {
  const name = (channel?.name || "").trim();
  const keys = ["สกินคุณฮิเคริ", "สกินคุณสกาย", "สกินมุยคุง", "สกินคุณขิม", "สกินคุณ nj"];
  const found = keys.find(k => name.startsWith(k));
  return found ? found : "";
}
function getSkinViewerName(channel) {
  const line = getSkinLineName(channel);
  if (!line) return "";
  let name = line.replace(/^สกิน/, "").trim();
  if (!name.startsWith("คุณ")) name = `คุณ${name}`;
  return name;
}

function computeQueueGroup(channel) {
  const catId = String(channel?.parentId || "");
  if (COMBINED_ADDON.has(catId)) return "GROUP_ADDON_COMBINED";
  if (catId === CAT_7DAYS) return "GROUP_7DAYS";
  if (catId === CAT_14DAYS) {
    const line = getSkinLineName(channel) || `LINE_${channel.id}`;
    return `GROUP_14DAYS_${line}`;
  }
  return `GROUP_CAT_${catId || channel.id}`;
}

function finishButton(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("q_finish").setLabel("จบงาน").setStyle(ButtonStyle.Success).setDisabled(disabled)
  );
}

function msToParts(ms) {
  let total = Math.floor(Math.max(0, ms) / 1000);
  const d = Math.floor(total / 86400);
  total -= d * 86400;
  const h = Math.floor(total / 3600);
  total -= h * 3600;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return { d, h, m, s };
}
function fmtRemain(deadline) {
  const remain = deadline - Date.now();
  const { d, h, m, s } = msToParts(remain);
  return `${d}วัน ${h}ชม ${m}นาที ${s}วินาที`;
}
function fmtDuration(ms) {
  const { d, h, m, s } = msToParts(ms);
  return `${d}วัน ${h}ชม ${m}นาที ${s}วินาที`;
}

function buildTitle(channel, queue) {
  const catId = String(channel?.parentId ?? "");
  const q = Number.isFinite(queue) ? queue : 1;
  if (CAT_QUEUE_TITLE.has(catId)) return `คุณอยู่คิวที่ ${q} ในคิวแอดออน`;
  if (catId === CAT_7DAYS) return `คุณอยู่คิวที่ ${q} ในคิวปั้นโมเดล`;
  if (catId === CAT_14DAYS) {
    const line = getSkinLineName(channel);
    return `คุณอยู่คิวที่ ${q} ในคิวทำสกินลายเส้น${line ? line : ""}`;
  }
  return `คุณอยู่คิวที่ ${q}`;
}

function buildEmbed(channel, deadline, state) {
  const { finished, queue = null, finishedMsg = null, titleFromDb = null, overdue = false } = state || {};
  const title = titleFromDb || buildTitle(channel, queue);
  const embed = new EmbedBuilder().setTitle(title).setTimestamp(new Date(deadline));
  if (overdue) {
    embed.setColor(0xe74c3c).setDescription(`# สถานะ : ล่าช้า`);
    return embed;
  }
  embed.setColor(0x9b59b6);
  if (finished) {
    embed
      .setDescription(finishedMsg || "⏰ หมดเวลาแล้ว")
      .setImage("https://i.pinimg.com/originals/2d/ea/4f/2dea4f6578757f8c2d2336671c22ea30.gif");
  } else {
    embed
      .setDescription(
        `## ได้กำหนดระยะเวลาแล้ว\n## [สามารถตรวจเช็คคิวได้ที่นี่เลอ](https://discordapp.com/channels/1336555551970164839/${VIEW_CHANNEL_ID}) \n# จะส่งงานภายใน\n## ${fmtRemain(deadline)}\n **หากส่งงานช้ามากกว่าที่กำหนดทางเราจะคืนเงินให้เต็มจำนวนและยกเลิกออเดอร์ให้ แต่หากลูกค้ารอได้ จะรอไม่เกิน1สัปดาห์ (หากทำส่งไม่ทันอีกทางเราจะนำคนที่ทำไปขายในตลาดมืดและนำไปซื้อถั่วลิสงครึ่งเม็ด)**`
      )
      .setImage("https://c4.wallpaperflare.com/wallpaper/818/581/188/anime-manga-anime-girls-simple-background-wallpaper-preview.jpg");
  }
  return embed;
}

function buildViewerQueueLabel(channel, q) {
  const catId = String(channel?.parentId || "");
  if (COMBINED_ADDON.has(catId)) return `คิวงานแอดออน ที่ ${q}`;
  if (catId === CAT_7DAYS) return `คิวงานโมเดล คิวที่ ${q}`;
  if (catId === CAT_14DAYS) {
    const who = getSkinViewerName(channel) || "ลูกค้า";
    return `คิวงานสกิน ${who} คิวที่ ${q}`;
  }
  return `คิวงาน คิวที่ ${q}`;
}

function buildViewerEmbed(channel, queue) {
  const q = Number.isFinite(queue) ? queue : 1;
  const queueLabel = buildViewerQueueLabel(channel, q);
  const status = q === 1 ? "กำลังทำ" : "รอคิว";
  const color = q === 1 ? 0x9b59b6 : 0xe67e22;
  return new EmbedBuilder()
    .setTitle("คิวงาน")
    .setDescription(`# ${queueLabel}\n## สถานะ : ${status}`)
    .setImage("https://images8.alphacoders.com/137/1377792.png")
    .setColor(color);
}

function buildViewerFinishedEmbed(channel, queue, usedText) {
  const q = Number.isFinite(queue) ? queue : 1;
  const queueLabel = buildViewerQueueLabel(channel, q);
  return new EmbedBuilder()
    .setTitle("คิวงาน")
    .setDescription(`# ${queueLabel}\n# สถานะ : เสร็จแล้ว\n# ใช้เวลาทำงานนี้\n## ${usedText}`)
    .setImage("https://images8.alphacoders.com/137/1377792.png")
    .setColor(0x2ecc71);
}

function shouldCreateMonitor(categoryId) {
  const id = String(categoryId || "");
  return COMBINED_ADDON.has(id) || id === CAT_7DAYS || id === CAT_14DAYS;
}

// *** เปลี่ยนให้แท็กแยกกันเป็นหลายข้อความ ***
async function sendOverdueNag(client, item) {
  try {
    const nagCh = await client.channels.fetch(NAG_CHANNEL_ID).catch(() => null);
    if (!nagCh?.isTextBased?.()) return;

    const catId = String(item.categoryId || item.channel?.parentId || "");
    let targetId = null;

    if (COMBINED_ADDON.has(catId)) {
      targetId = ADDON_MENTION_ID;
    } else if (catId === CAT_7DAYS) {
      targetId = MODEL_MENTION_ID;
    } else if (catId === CAT_14DAYS) {
      const line = getSkinLineName(item.channel);
      targetId = SKIN_MENTION_MAP[line] || null;
    }

    if (!targetId) return;

    const isRole = nagCh.guild?.roles?.cache?.has(targetId);
    const mentionToken = isRole ? `<@&${targetId}>` : `<@${targetId}>`;
    const allowed = isRole ? { roles: [targetId] } : { users: [targetId] };

    for (let i = 0; i < NAG_TIMES; i++) {
      const content = `**${mentionToken}\n<#${item.channel?.id}>\nคิวงานล่าช้าแล้วโว้ยยยยยยไปทำงาน**`;
      await nagCh.send({ content, allowedMentions: allowed }).catch(() => {});
    }
  } catch {}
}

module.exports = function (client) {
  const countdowns = new Map();
  let ticker = null;
  const refMessages = db.collection("q_messages");

  async function renumberGroup(queueGroup) {
    try {
      const snap = await refMessages.where("queueGroup", "==", queueGroup).get();
      if (snap.empty) return;
      const items = [];
      for (const doc of snap.docs) {
        const d = doc.data();
        items.push({
          id: doc.id,
          channelId: d.channelId,
          deadline: d.deadline,
          startAt: Number.isFinite(d.startAt) ? d.startAt : 0,
          categoryId: d.categoryId || null,
          monitorChannelId: d.monitorChannelId || null,
          monitorMessageId: d.monitorMessageId || null,
        });
      }
      items.sort((a, b) => {
        if ((a.startAt || 0) !== (b.startAt || 0)) return (a.startAt || 0) - (b.startAt || 0);
        return a.id.localeCompare(b.id);
      });
      let idx = 1;
      for (const it of items) {
        const ch = await client.channels.fetch(it.channelId).catch(() => null);
        if (!ch?.isTextBased?.()) { idx++; continue; }
        const title = buildTitle(ch, idx);
        const overdue = it.deadline <= Date.now();
        await refMessages.doc(it.id).set({ queue: idx, title }, { merge: true }).catch(() => {});
        try {
          const msg = await ch.messages.fetch(it.id).catch(() => null);
          if (msg) {
            const emb = buildEmbed(ch, it.deadline, { finished: false, queue: idx, titleFromDb: title, overdue });
            const components = [finishButton(false)];
            await msg.edit({ embeds: [emb], components }).catch(() => {});
          }
        } catch {}
        const cache = countdowns.get(it.id);
        if (cache) {
          cache.queue = idx;
          cache.titleFromDb = title;
          cache.overdue = overdue;
          cache.prevSec = overdue ? 0 : cache.prevSec;
          countdowns.set(it.id, cache);
        }
        idx++;
      }
    } catch {}
  }

  async function tick() {
    const now = Date.now();
    for (const [mid, item] of countdowns) {
      try {
        if (!item.msg) item.msg = await item.channel.messages.fetch(mid).catch(() => null);
        const msg = item.msg;
        if (!msg) {
          countdowns.delete(mid);
          continue;
        }
        const sec = Math.max(0, Math.floor((item.deadline - now) / 1000));

        if (sec <= 0 && !item.finished && !item.overdue) {
          const emb = buildEmbed(item.channel, item.deadline, {
            finished: false,
            queue: item.queue ?? null,
            titleFromDb: item.titleFromDb ?? null,
            overdue: true,
          });
          await msg.edit({ embeds: [emb], components: [finishButton(false)] }).catch(() => {});
          item.overdue = true;
          item.prevSec = 0;

          if (!item.overdueNagSent) {
            await sendOverdueNag(client, item);
            item.overdueNagSent = true;
            await refMessages.doc(mid).set({ overdueNotified: true }, { merge: true }).catch(() => {});
          }
          continue;
        }

        if (!item.finished && !item.overdue && item.prevSec !== sec) {
          const emb = buildEmbed(item.channel, item.deadline, {
            finished: false,
            queue: item.queue ?? null,
            titleFromDb: item.titleFromDb ?? null,
          });
          await msg.edit({ embeds: [emb], components: [finishButton(false)] }).catch(() => {});
          item.prevSec = sec;
        }
      } catch {}
    }
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(tick, TICK_MS);
  }

  client.once("ready", async () => {
    try {
      const snap = await refMessages.get();
      for (const doc of snap.docs) {
        const mid = doc.id;
        const data = doc.data() || {};
        const {
          channelId,
          deadline,
          startAt = null,
          queue = null,
          categoryId = null,
          queueGroup = null,
          title = null,
          monitorChannelId = null,
          monitorMessageId = null,
          overdueNotified = false,
        } = data;
        if (!channelId || !Number.isFinite(deadline)) {
          await refMessages.doc(mid).delete().catch(() => {});
          continue;
        }
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch?.isTextBased?.()) {
          await refMessages.doc(mid).delete().catch(() => {});
          continue;
        }
        const msg = await ch.messages.fetch(mid).catch(() => null);
        if (!msg) {
          await refMessages.doc(mid).delete().catch(() => {});
          continue;
        }

        const isOverdue = deadline <= Date.now();
        let monitorChannel = null;
        if (monitorChannelId) monitorChannel = await client.channels.fetch(monitorChannelId).catch(() => null);

        const item = {
          deadline,
          startAt: Number.isFinite(startAt) ? startAt : (msg.createdTimestamp || Date.now()),
          channel: ch,
          msg,
          prevSec: isOverdue ? 0 : null,
          finished: false,
          overdue: isOverdue,
          overdueNagSent: !!overdueNotified,
          queue: Number.isFinite(queue) ? queue : null,
          categoryId: categoryId || ch.parentId || null,
          queueGroup: queueGroup || computeQueueGroup(ch),
          titleFromDb: title || (Number.isFinite(queue) ? buildTitle(ch, queue) : buildTitle(ch, 1)),
          monitorChannel,
          monitorMessageId: monitorMessageId || null,
          monitorMsg: null,
        };
        countdowns.set(mid, item);

        const emb = buildEmbed(ch, deadline, {
          finished: false,
          queue: item.queue,
          titleFromDb: item.titleFromDb,
          overdue: isOverdue,
        });
        await msg.edit({ embeds: [emb], components: [finishButton(false)] }).catch(() => {});

        if (isOverdue && !overdueNotified) {
          await sendOverdueNag(client, item);
          item.overdueNagSent = true;
          await refMessages.doc(mid).set({ overdueNotified: true }, { merge: true }).catch(() => {});
        }
      }
      const groups = new Set(snap.docs.map(d => d.data()?.queueGroup).filter(Boolean));
      for (const g of groups) await renumberGroup(g);
    } catch {}
    startTicker();
    try {
      for (const [, g] of client.guilds.cache) {
        const cmds = await client.application.commands.fetch({ guildId: g.id }).catch(() => null);
        const exists = cmds && cmds.find(c => c.name === "q");
        if (!exists) {
          await client.application.commands.create(
            { name: "q", description: "สร้างเดตไลน์ตามหมวดหมู่ และนับถอยหลังต่อเนื่อง", type: ApplicationCommandType.ChatInput },
            g.id
          ).catch(() => {});
        }
      }
    } catch {}
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "q") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      try {
        const categoryId = interaction.channel?.parentId || null;
        const queueGroup = computeQueueGroup(interaction.channel);
        const durationMs = computeDurationMs(interaction.channel);
        const startAtLocal = Date.now();
        const deadline = startAtLocal + durationMs;

        const existing = await refMessages.where("queueGroup", "==", queueGroup).get();
        const approxQueue = (existing.size || 0) + 1;
        const tempTitle = buildTitle(interaction.channel, approxQueue);

        const embTemp = buildEmbed(interaction.channel, deadline, {
          finished: false,
          queue: approxQueue,
          titleFromDb: tempTitle,
        });

        const msg = await interaction.channel.send({
          embeds: [embTemp],
          components: [finishButton(false)],
        });

        let monitorMessageId = null;
        let monitorChannel = null;
        if (shouldCreateMonitor(categoryId)) {
          monitorChannel = await client.channels.fetch(VIEW_CHANNEL_ID).catch(() => null);
          if (monitorChannel?.isTextBased?.()) {
            const vEmb = buildViewerEmbed(interaction.channel, approxQueue);
            const vMsg = await monitorChannel.send({ embeds: [vEmb] }).catch(() => null);
            if (vMsg) monitorMessageId = vMsg.id;
          }
        }

        const startAt = msg.createdTimestamp || startAtLocal;
        await refMessages.doc(msg.id).set({
          channelId: interaction.channel.id,
          deadline,
          startAt,
          queue: null,
          categoryId,
          queueGroup,
          title: tempTitle,
          monitorChannelId: monitorMessageId ? VIEW_CHANNEL_ID : null,
          monitorMessageId: monitorMessageId || null,
          overdueNotified: false,
        }).catch(() => {});

        countdowns.set(msg.id, {
          deadline,
          startAt,
          channel: interaction.channel,
          msg,
          prevSec: null,
          finished: false,
          overdue: false,
          overdueNagSent: false,
          queue: null,
          categoryId,
          queueGroup,
          titleFromDb: tempTitle,
          monitorChannel: monitorChannel || null,
          monitorMessageId: monitorMessageId || null,
          monitorMsg: null,
        });

        await renumberGroup(queueGroup);
        await interaction.editReply({ content: `✅ ตั้งเดตไลน์แล้ว: ${msg.url}` }).catch(() => {});
      } catch {
        await interaction.editReply({ content: "❌ เกิดข้อผิดพลาด" }).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === "q_finish") {
      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({ content: "ใช้ได้เฉพาะในเซิร์ฟเวอร์", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      const ok = interaction.member?.roles?.cache?.some(r => ALLOWED_ROLE_IDS.has(r.id)) ?? false;
      if (!ok) {
        return interaction.reply({ content: "คุณไม่มีสิทธิ์กดปุ่มนี้", flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      const mid = interaction.message.id;
      const docRef = refMessages.doc(mid);
      const snap = await docRef.get().catch(() => null);

      if (!snap || !snap.exists) {
        const ch = interaction.channel;
        const categoryId = ch?.parentId || null;
        const queueGroup = computeQueueGroup(ch);
        if (countdowns.has(mid)) countdowns.delete(mid);
        await refMessages.doc(mid).delete().catch(() => {});
        const usedMs = Math.max(0, Date.now() - (interaction.message.createdTimestamp || Date.now()));
        const usedText = fmtDuration(usedMs);
        const descText = String(categoryId) === CAT_14DAYS
          ? `# ขอบคุณมากนะค้าบ\n## หวังว่าทางเราจะให้บริการท่านอีกในอนาคต\n## [กดตรงนี้ให้เครดิตด้วยน้าา](https://discordapp.com/channels/1336555551970164839/1374424481447149579)\n## บอกว่าลายลายเส้นใครด้วยน้าา\n**ตั๋วจะปิดใน 4-5วันน้า โหลดให้ทันก่อนตั๋วจะปิดหล่ะะ หากจะสั่งเพิ่มต้องเปิดตั๋วใหม่น้าา**\n**ใช้เวลารวม ${usedText} ในการทำงานคิวนี้**\n\n`
          : `# ขอบคุณมากนะค้าบ\n## หวังว่าทางเราจะให้บริการท่านอีกในอนาคต\n## [กดตรงนี้ให้เครดิตด้วยน้าา](https://discordapp.com/channels/1336555551970164839/1371394966265270323)\n**ตั๋วจะปิดใน 4-5วันน้า โหลดให้ทันก่อนตั๋วจะปิดหล่ะะ หากจะสั่งเพิ่มต้องเปิดตั๋วใหม่น้าา**\n**ใช้เวลารวม ${usedText} ในการทำงานคิวนี้**\n\n`;
        await interaction.message.delete().catch(() => {});
        const doneEmb = new EmbedBuilder()
          .setTitle("จบงานเรียบร้อย")
          .setDescription(descText)
          .setColor(0x9b59b6)
          .setImage("https://i.pinimg.com/originals/2d/ea/4f/2dea4f6578757f8c2d2336671c22ea30.gif");
        await ch.send({ embeds: [doneEmb] }).catch(() => {});
        if (queueGroup) await renumberGroup(queueGroup);
        await interaction.reply({ content: "✅ จบงานเรียบร้อย", flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }

      const data = snap.data() || {};
      const { startAt, categoryId = null, queueGroup = null, monitorChannelId = null, monitorMessageId = null, channelId, queue } = data;

      await docRef.delete().catch(() => {});
      const usedMs = Math.max(0, Date.now() - (Number.isFinite(startAt) ? startAt : interaction.message.createdTimestamp || Date.now()));
      const usedText = fmtDuration(usedMs);

      const descText = categoryId === CAT_14DAYS
        ? `# ขอบคุณมากนะค้าบ\n## หวังว่าทางเราจะให้บริการท่านอีกในอนาคต\n## [กดตรงนี้ให้เครดิตด้วยน้าา](https://discordapp.com/channels/1336555551970164839/1374424481447149579)\n## บอกว่าลายลายเส้นใครด้วยน้าา\n**ตั๋วจะปิดใน 4-5วันน้า โหลดให้ทันก่อนตั๋วจะปิดหล่ะะ หากจะสั่งเพิ่มต้องเปิดตั๋วใหม่น้าา**\n**ใช้เวลารวม ${usedText} ในการทำงานคิวนี้**\n\n`
        : `# ขอบคุณมากนะค้าบ\n## หวังว่าทางเราจะให้บริการท่านอีกในอนาคต\n## [กดตรงนี้ให้เครดิตด้วยน้าา](https://discordapp.com/channels/1336555551970164839/1371394966265270323)\n**ตั๋วจะปิดใน 4-5วันน้า โหลดให้ทันก่อนตั๋วจะปิดหล่ะะ หากจะสั่งเพิ่มต้องเปิดตั๋วใหม่น้าา**\n**ใช้เวลารวม ${usedText} ในการทำงานคิวนี้**\n\n`;

      const editedMain = new EmbedBuilder()
        .setTitle("จบงานเรียบร้อย")
        .setDescription(descText)
        .setColor(0x9b59b6)
        .setImage("https://i.pinimg.com/originals/2d/ea/4f/2dea4f6578757f8c2d2336671c22ea30.gif");

      await interaction.message.edit({ embeds: [editedMain], components: [finishButton(true)] }).catch(() => {});
      if (countdowns.has(mid)) countdowns.delete(mid);

      try {
        let vch = null;
        if (monitorChannelId) vch = await client.channels.fetch(monitorChannelId).catch(() => null);
        let qNum = Number.isFinite(queue) ? queue : null;
        if (!qNum && countdowns.get(mid)?.queue) qNum = countdowns.get(mid).queue;
        if (vch?.isTextBased?.() && monitorMessageId) {
          const vmsg = await vch.messages.fetch(monitorMessageId).catch(() => null);
          if (vmsg) {
            const workCh = channelId ? await client.channels.fetch(channelId).catch(() => null) : interaction.channel;
            const doneEmbViewer = buildViewerFinishedEmbed(workCh, qNum, usedText);
            await vmsg.edit({ embeds: [doneEmbViewer] }).catch(() => {});
          }
        }
      } catch {}

      if (queueGroup) await renumberGroup(queueGroup);
      await interaction.reply({ content: "✅ จบงานเรียบร้อย", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
  });

  client.on("messageDelete", async (message) => {
    try {
      const mid = message.id;
      const snap = await refMessages.doc(mid).get().catch(() => null);
      let queueGroup = null;
      let monitorChannelId = null;
      let monitorMessageId = null;
      if (snap?.exists) {
        const d = snap.data();
        queueGroup = d?.queueGroup || null;
        monitorChannelId = d?.monitorChannelId || null;
        monitorMessageId = d?.monitorMessageId || null;
      }
      if (countdowns.has(mid)) countdowns.delete(mid);
      await refMessages.doc(mid).delete().catch(() => {});
      if (monitorChannelId && monitorMessageId) {
        try {
          const vch = await client.channels.fetch(monitorChannelId).catch(() => null);
          if (vch?.isTextBased?.()) {
            const vmsg = await vch.messages.fetch(monitorMessageId).catch(() => null);
            if (vmsg) await vmsg.delete().catch(() => {});
          }
        } catch {}
      }
      if (queueGroup) await renumberGroup(queueGroup);
    } catch {}
  });

  client.on("messageUpdate", async (_oldMsg, newMsg) => {
    try {
      const mid = newMsg?.id;
      if (!mid) return;
      const docRef = refMessages.doc(mid);
      const snap = await docRef.get().catch(() => null);
      if (!snap || !snap.exists) return;
      const old = snap.data() || {};
      const chObj = await newMsg.client.channels.fetch(newMsg.channelId).catch(() => null);
      await docRef.set(
        {
          channelId: newMsg.channelId,
          categoryId: old.categoryId || newMsg.channel?.parentId || null,
          queueGroup: old.queueGroup || (chObj ? computeQueueGroup(chObj) : old.queueGroup),
        },
        { merge: true }
      ).catch(() => {});
      const item = countdowns.get(mid);
      if (item && chObj) item.channel = chObj;
    } catch {}
  });
};
