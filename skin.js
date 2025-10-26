const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");

module.exports = function (client) {
  const PREFIX = "!";
  const STAFF_ROLE_ID = "1374387525040214016";
  const CATEGORY_ID = "1374396536951406683";
  const SKIN_MENU_CHANNEL_ID = "1399272990914514964";

  const OWNER_IDS = {
    skin_hi: "1134464935448023152",
    skin_sky: "1260765032413659159",
    skin_muy: "1010202066720936048",
    skin_kim: "1294133075801931870",
    skin_nj: "1092393537238204497",
    skin_neji: "765887179741200394",
  };

  const LABELS = {
    skin_hi: "ลายเส้นฮิเคริ",
    skin_sky: "ลายเส้นสกาย",
    skin_muy: "ลายเส้นมุย",
    skin_kim: "ลายเส้นขิม",
    skin_nj: "ลายเส้น NJ",
    skin_neji: "ลายเส้นเนจิ",
  };

  const QUEUE_PREFIX = {
    skin_hi: "คิวคุณฮิเคริ",
    skin_sky: "คิวคุณสกาย",
    skin_muy: "คิวคุณมุย",
    skin_kim: "คิวคุณขิม",
    skin_nj: "คิวคุณNJ",
    skin_neji: "คิวคุณเนจิ",
  };

  const ARTISTS = [
    { id: "skin_hi", base: "สกินคุณฮิเคริ" },
    { id: "skin_sky", base: "สกินคุณสกาย" },
    { id: "skin_muy", base: "สกินมุยคุง" },
    { id: "skin_kim", base: "สกินคุณขิม" },
    { id: "skin_nj", base: "สกินคุณ nj" },
    { id: "skin_neji", base: "สกินคุณเนจิ" },
  ];

  const MENU_TITLE = "กดตั๋วเพื่อสั่งสกิน";

  const argToCustomId = (raw) => {
    const key = String(raw || "").toLowerCase();
    return {
      hi: "skin_hi",
      sky: "skin_sky",
      muy: "skin_muy",
      kim: "skin_kim",
      nj: "skin_nj",
      neji: "skin_neji",
    }[key] || null;
  };

  const isAdminOrStaff = (member) =>
    member?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member?.roles?.cache?.has(STAFF_ROLE_ID);

  const norm = (s) => (s || "").replace(/[\s\-]+/g, "").toLowerCase();

  async function findExistingMenuMessage(channel) {
    const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    return msgs?.find(
      (m) => m.author?.id === client.user.id && m.embeds?.[0]?.title === MENU_TITLE
    );
  }

  function formatQueueLineOpen(artistId, count) {
    const head = QUEUE_PREFIX[artistId] || "คิว";
    if (count === 0) return `${head} ว่างมากกก`;
    return `${head} ${count} คิว`;
  }
  function formatQueueLineClosed(artistId) {
    const head = QUEUE_PREFIX[artistId] || "คิว";
    return `${head} ปิดรับแบ้ววว`;
  }

  async function computeQueueText(guild) {
    try {
      await guild.channels.fetch();

      const menuChannel =
        guild.channels.cache.get(SKIN_MENU_CHANNEL_ID) ||
        (await guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null));
      const menuMsg = menuChannel ? await findExistingMenuMessage(menuChannel) : null;

      const components = menuMsg?.components?.flatMap((row) => row.components) ?? [];

      const lines = [];
      for (const a of ARTISTS) {
        const baseNorm = norm(a.base);
        const cnt = guild.channels.cache.filter((ch) => {
          if (!ch || ch.parentId !== CATEGORY_ID) return false;
          return norm(ch.name).startsWith(baseNorm);
        }).size;

        // ปุ่มยังแสดงอยู่ไหม = เปิดรับ
        const btnOpen = components.some((btn) => btn.customId === a.id);
        lines.push(btnOpen ? formatQueueLineOpen(a.id, cnt) : formatQueueLineClosed(a.id));
      }
      return lines.join("\n");
    } catch (e) {
      console.error("computeQueueText error:", e);
      return "(โหลดคิวไม่สำเร็จ)";
    }
  }

  async function buildMenuEmbed(guild) {
    const queueText = await computeQueueText(guild);
    return new EmbedBuilder()
      .setTitle(MENU_TITLE)
      .setDescription(`**ห้ามกดเล่น\n\n${queueText}**`)
      .setColor(0x9b59b6)
      .setImage("https://media.tenor.com/S4MdyoCR3scAAAAM/oblakao.gif")
      .setFooter({ text: "Make by Purple Shop" });
  }

  // ทำปุ่มเป็นหลายแถวอัตโนมัติ (แถวละไม่เกิน 5 ปุ่ม)
  function buildMenuRows() {
    const buttons = ARTISTS.map((a) =>
      new ButtonBuilder().setCustomId(a.id).setLabel(LABELS[a.id]).setStyle(ButtonStyle.Primary)
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return rows;
  }

  async function postSkinMenu(channel) {
    await channel.send({
      content: `# ดูลายเส้นแต่ละคนได้ที่\n## <#1374409545836925008>`,
    });
    const embed = await buildMenuEmbed(channel.guild);
    const rows = buildMenuRows();
    return channel.send({ embeds: [embed], components: rows });
  }

  async function refreshMenuQueue(guild) {
    try {
      const menuChannel =
        guild.channels.cache.get(SKIN_MENU_CHANNEL_ID) ||
        (await guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null));
      if (!menuChannel?.isTextBased?.()) return;
      const menuMsg = await findExistingMenuMessage(menuChannel);
      if (!menuMsg) return;
      const newEmbed = await buildMenuEmbed(guild);
      await menuMsg.edit({ embeds: [newEmbed] }).catch(() => {});
    } catch (e) {
      console.error("refreshMenuQueue error:", e);
    }
  }

  client.once("ready", async () => {
    // สร้าง/อัปเดตเมนูตอนบอทขึ้น และทุก 10 นาที
    for (const [, guild] of client.guilds.cache) {
      const ch =
        guild.channels.cache.get(SKIN_MENU_CHANNEL_ID) ||
        (await guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null));
      if (!ch || !ch.isTextBased?.()) continue;
      const existing = await findExistingMenuMessage(ch);
      if (!existing) await postSkinMenu(ch);
      else {
        const embed = await buildMenuEmbed(guild);
        await existing.edit({ embeds: [embed] }).catch(() => {});
      }
    }
    setInterval(async () => {
      for (const [, guild] of client.guilds.cache) {
        await refreshMenuQueue(guild);
      }
    }, 10 * 60 * 1000);
  });

  // ถ้าโพสต์เมนูของบอทถูกลบ: โพสต์คืน
  client.on("messageDelete", async (message) => {
    try {
      if (message.channelId !== SKIN_MENU_CHANNEL_ID) return;
      if (message.author?.id !== client.user.id) return;
      const title = message.embeds?.[0]?.title || "";
      if (title === MENU_TITLE) {
        const channel = message.channel;
        setTimeout(() => postSkinMenu(channel).catch(() => {}), 1000);
      }
    } catch (e) {
      console.error("messageDelete handler error:", e);
    }
  });

  // คำสั่งเปิด/ปิดปุ่มในเมนู
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "closeskin" || command === "openskin") {
      if (!isAdminOrStaff(message.member)) return void message.delete().catch(() => {});
      const customId = argToCustomId(args[0]);
      if (!customId) return void message.delete().catch(() => {});

      const channel =
        message.channel.id === SKIN_MENU_CHANNEL_ID
          ? message.channel
          : await message.guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null);
      if (!channel) return void message.delete().catch(() => {});
      const botMessage = await findExistingMenuMessage(channel);
      if (!botMessage) return void message.delete().catch(() => {});

      // รวบรวมปุ่มทั้งหมดจากทุกแถว
      const currentButtons = botMessage.components.flatMap((row) => row.components);

      if (command === "closeskin") {
        const newButtons = currentButtons.filter((btn) => btn.customId !== customId);
        // สร้างแถวใหม่ทีละ 5
        const rows = [];
        for (let i = 0; i < newButtons.length; i += 5) {
          rows.push(new ActionRowBuilder().addComponents(newButtons.slice(i, i + 5)));
        }
        await botMessage.edit({ components: rows }).catch(() => {});
      } else {
        const exists = currentButtons.some((btn) => btn.customId === customId);
        if (!exists) {
          currentButtons.push(
            new ButtonBuilder()
              .setCustomId(customId)
              .setLabel(LABELS[customId] || "ลายเส้น")
              .setStyle(ButtonStyle.Primary)
          );
          const rows = [];
          for (let i = 0; i < currentButtons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(currentButtons.slice(i, i + 5)));
          }
          await botMessage.edit({ components: rows }).catch(() => {});
        }
      }

      await refreshMenuQueue(message.guild);
      await message.delete().catch(() => {});
    }
  });

  // ===== Interaction (รวมไว้ที่เดียว ป้องกันตอบซ้ำ) =====
  client.on("interactionCreate", async (i) => {
    if (!i.isButton()) return;

    const { guild, user, member } = i;

    // ===== เปิดตั๋วตามลายเส้น =====
    if (ARTISTS.some((a) => a.id === i.customId)) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });

      const map = {
        skin_hi: ["ลายเส้นคุณฮิเคริ", "สกินคุณฮิเคริ", OWNER_IDS.skin_hi],
        skin_sky: ["ลายเส้นคุณสกาย", "สกินคุณสกาย", OWNER_IDS.skin_sky],
        skin_muy: ["ลายเส้นคุณมุย", "สกินมุยคุง", OWNER_IDS.skin_muy],
        skin_kim: ["ลายเส้นคุณขิม", "สกินคุณขิม", OWNER_IDS.skin_kim],
        skin_nj: ["ลายเส้นคุณ NJ", "สกินคุณ NJ", OWNER_IDS.skin_nj],
        skin_neji: ["ลายเส้นคุณเนจิ", "สกินคุณเนจิ", OWNER_IDS.skin_neji],
      };
      const [skinName, baseName, artistId] = map[i.customId];

      const existing = guild.channels.cache.filter(
        (ch) =>
          ch.parentId === CATEGORY_ID &&
          ch.name?.startsWith(baseName) &&
          ch.permissionsFor(user.id)?.has(PermissionsBitField.Flags.ViewChannel)
      );
      if (existing.size >= 3) {
        await i.editReply(`❗ คุณสามารถเปิดตั๋ว ${skinName} ได้สูงสุด 3 ห้อง (ตอนนี้มี ${existing.size})`);
        return;
      }

      const ch = await guild.channels.create({
        name: baseName,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle(skinName)
        .setDescription("สามารถเขียนข้อมูลหรือส่งรูปภาพไว้ได้เลยนะคับ รอแม่ค้ามาตอบ บรีฟไว้ได้เบย")
        .setColor(0x9b59b6);

      const delBtn = new ButtonBuilder().setCustomId("delete_ticket").setLabel("ลบตั๋ว").setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(delBtn);

      await ch.send({ content: `<@${user.id}>\n<@${artistId}>`, embeds: [embed], components: [row] });

      await i.editReply(`✅ เปิดตั๋ว ${skinName} แล้ว: ${ch}`);

      // รีเฟรชบรรทัดคิวหน้าเมนูให้ "นับคิวเหมือนเดิม"
      await refreshMenuQueue(guild);
      return;
    }

    // ===== ลบตั๋ว =====
    if (i.customId === "delete_ticket") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      if (!isAdminOrStaff(member)) {
        await i.editReply("❌ คุณไม่มีสิทธิ์ลบตั๋วนี้");
        return;
      }

      await i.editReply("🗑️ กำลังลบ...");

      const g = i.guild;
      const ch = i.channel;

      // ลบช่องแล้วรีเฟรชคิว
      try {
        await ch?.delete().catch(() => {});
      } finally {
        // หลังลบห้อง ให้รีเฟรชบรรทัดคิวที่หน้าเมนู
        await refreshMenuQueue(g);
      }

      return;
    }
  });
};
