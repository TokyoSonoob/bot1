const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionsBitField,
  MessageFlags, // ✅ ใช้ flags แทน ephemeral
} = require("discord.js");
const express = require("express");
const { db } = require("./firebase");

module.exports = function (client) {
  const PREFIX = "!";
  const STAFF_ROLE_ID = "1374387525040214016";
  const CATEGORY_ID = "1374396536951406683"; // หมวดหมู่ห้องตั๋วสกิน
  const FORM_CHANNEL_ID = "1374427289948786759";

  // ✅ ห้องที่ต้องตรวจและโพสต์เมนูอัตโนมัติ
  const SKIN_MENU_CHANNEL_ID = "1399272990914514964";

  // ✅ เกณฑ์คิวที่ถือว่า "ปิดรับ"
  const QUEUE_CLOSE_THRESHOLD = 8;

  const OWNER_IDS = {
    skin_hi: "1134464935448023152",
    skin_sky: "1260765032413659159",
    skin_muy: "1010202066720936048",
    skin_kim: "1294133075801931870",
    skin_nj: "1092393537238204497",
  };

  const LABELS = {
    skin_hi: "ลายเส้นฮิเคริ",
    skin_sky: "ลายเส้นสกาย",
    skin_muy: "ลายเส้นมุย",
    skin_kim: "ลายเส้นขิม",
    skin_nj: "ลายเส้น NJ",
  };

  // ✅ ใช้สำหรับโชว์บรรทัดคิว (ชื่อย่อสั้น ๆ ด้านหน้า)
  const QUEUE_PREFIX = {
    skin_hi: "คิวคุณฮิเคริ",
    skin_sky: "คิวคุณสกาย",
    skin_muy: "คิวคุณมุย",
    skin_kim: "คิวคุณขิม",
    skin_nj: "คิวคุณNJ",
  };

  // ✅ ชื่อห้องฐานต่อศิลปิน (ใช้เท่าที่ระบบสร้างอยู่แล้ว)
  const ARTISTS = [
    { id: "skin_hi", channelName: "สกินคุณฮิเคริ" },
    { id: "skin_sky", channelName: "สกินคุณสกาย" },
    { id: "skin_muy", channelName: "สกินมุยคุง" },
    { id: "skin_kim", channelName: "สกินคุณขิม" },
    { id: "skin_nj", channelName: "สกินคุณ NJ" },
  ];

  const MENU_TITLE = "กดตั๋วเพื่อสั่งสกิน";

  const argToCustomId = (raw) => {
    if (!raw) return null;
    const key = String(raw).toLowerCase();
    if (key === "hi") return "skin_hi";
    if (key === "sky") return "skin_sky";
    if (key === "muy") return "skin_muy";
    if (key === "kim") return "skin_kim";
    if (key === "nj") return "skin_nj";
    return null;
  };

  const isAdminOrStaff = (member) =>
    member?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member?.roles?.cache?.has(STAFF_ROLE_ID);

  // ---------- Helper: สร้างข้อความคิวจากจำนวนห้อง ----------
  function formatQueueLine(artistId, count) {
    const head = QUEUE_PREFIX[artistId] || "คิว";
    if (count === 0) return `${head} ว่างมากกก`;
    if (count >= QUEUE_CLOSE_THRESHOLD) return `${head} ปิดรับแบ้ววว`;
    return `${head} ${count} คิว`;
  }

  // ---------- Helper: นับคิวทุกศิลปินใน GUILD ----------
  async function computeQueueText(guild) {
    try {
      // fetch เพื่อรีเฟรชแคชให้ครบ ๆ
      await guild.channels.fetch();

      const lines = [];
      for (const a of ARTISTS) {
        const cnt = guild.channels.cache.filter(
          (ch) => ch?.parentId === CATEGORY_ID && ch?.name === a.channelName
        ).size;
        lines.push(formatQueueLine(a.id, cnt));
      }
      return lines.join("\n");
    } catch (e) {
      console.error("computeQueueText error:", e);
      return "(โหลดคิวไม่สำเร็จ)";
    }
  }

  // ---------- Helper: สร้างเมนูโพสต์สกิน ----------
  async function buildMenuEmbed(guild) {
    const queueText = await computeQueueText(guild);
    return new EmbedBuilder()
      .setTitle(MENU_TITLE)
      .setDescription(`**ห้ามกดเล่น\n\n${queueText}**`)
      .setColor(0x9b59b6)
      .setImage("https://media.tenor.com/S4MdyoCR3scAAAAM/oblakao.gif")
      .setFooter({ text: "Make by Purple Shop" });
  }

  async function buildMenuRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("skin_hi").setLabel(LABELS.skin_hi).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("skin_sky").setLabel(LABELS.skin_sky).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("skin_muy").setLabel(LABELS.skin_muy).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("skin_kim").setLabel(LABELS.skin_kim).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("skin_nj").setLabel(LABELS.skin_nj).setStyle(ButtonStyle.Primary)
    );
  }

  async function postSkinMenu(channel) {
    await channel.send({
      content: `# ดูลายเส้นแต่ละคนได้ที่\n## <#1374409545836925008>`,
    });
    const embed = await buildMenuEmbed(channel.guild);
    const row = await buildMenuRow();
    const msg = await channel.send({ embeds: [embed], components: [row] });
    return msg;
  }

  // ---------- Helper: หา message เมนูล่าสุด ----------
  async function findExistingMenuMessage(channel) {
    const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!recent) return null;
    const existing = recent.find((m) => {
      if (m.author?.id !== client.user.id) return false;
      if (!m.embeds?.length) return false;
      if (!m.components?.length) return false;
      const title = m.embeds[0]?.title || "";
      return title === MENU_TITLE;
    });
    return existing || null;
  }

  // ---------- ตรวจ/อัปเดตเมนูอัตโนมัติ ----------
  async function ensureOrRefreshSkinMenu() {
    try {
      for (const [, guild] of client.guilds.cache) {
        const channel =
          guild.channels.cache.get(SKIN_MENU_CHANNEL_ID) ||
          (await guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null));
        if (!channel || !channel.isTextBased?.()) continue;

        const existing = await findExistingMenuMessage(channel);

        if (!existing) {
          await postSkinMenu(channel);
        } else {
          // ✅ รีเฟรชบรรทัดคิวใน embed เดิม
          const newEmbed = await buildMenuEmbed(guild);
          const prevComponents = existing.components; // คงปุ่มเดิม
          await existing.edit({ embeds: [newEmbed], components: prevComponents }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("ensureOrRefreshSkinMenu error:", e);
    }
  }

  // ---------- lifecycle ----------
  client.once("ready", async () => {
    await ensureOrRefreshSkinMenu();
    setInterval(() => {
      ensureOrRefreshSkinMenu();
    }, 10 * 60 * 1000); // ทุก 10 นาที
  });

  // ถ้าโพสต์เมนูของบอทถูกลบ: โพสต์คืน + คิวล่าสุด
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

  // ===== Commands: ปรับปุ่มแสดง/ซ่อนรายศิลปิน =====
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ปิดปุ่มบางคน: !closeskin <hi|sky|muy|kim|nj>
    if (command === "closeskin") {
      if (!isAdminOrStaff(message.member)) {
        await message.delete().catch(() => {});
        return;
      }
      const customIdToRemove = argToCustomId(args[0]);
      if (!customIdToRemove) {
        await message.delete().catch(() => {});
        return;
      }

      const channel =
        message.channel.id === SKIN_MENU_CHANNEL_ID
          ? message.channel
          : await message.guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null);
      if (!channel) return message.delete().catch(() => {});

      const botMessage = await findExistingMenuMessage(channel);
      if (botMessage) {
        const currentRow = botMessage.components[0];
        const newButtons = currentRow.components.filter((btn) => btn.customId !== customIdToRemove);
        await botMessage.edit({ components: newButtons.length ? [new ActionRowBuilder().addComponents(newButtons)] : [] }).catch(() => {});
        // อัปเดตบรรทัดคิวด้วย
        const newEmbed = await buildMenuEmbed(channel.guild);
        await botMessage.edit({ embeds: [newEmbed] }).catch(() => {});
      }
      await message.delete().catch(() => {});
    }

    // เปิดปุ่มด้วยชื่อย่อ: !openskin <hi|sky|muy|kim|nj>
    if (command === "openskin") {
      if (!isAdminOrStaff(message.member)) {
        await message.delete().catch(() => {});
        return;
      }
      const customIdToAdd = argToCustomId(args[0]);
      if (!customIdToAdd) {
        await message.delete().catch(() => {});
        return;
      }

      const channel =
        message.channel.id === SKIN_MENU_CHANNEL_ID
          ? message.channel
          : await message.guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null);
      if (!channel) return message.delete().catch(() => {});

      const botMessage = await findExistingMenuMessage(channel);
      if (botMessage) {
        const currentRow = botMessage.components[0];
        const exists = currentRow.components.some((btn) => btn.customId === customIdToAdd);
        if (!exists) {
          if (currentRow.components.length < 5) {
            const newButton = new ButtonBuilder()
              .setCustomId(customIdToAdd)
              .setLabel(LABELS[customIdToAdd] || "ลายเส้น")
              .setStyle(ButtonStyle.Primary);
            const newRow = new ActionRowBuilder().addComponents([...currentRow.components, newButton]);
            await botMessage.edit({ components: [newRow] }).catch(() => {});
          }
        }
        // อัปเดตบรรทัดคิวด้วย
        const newEmbed = await buildMenuEmbed(channel.guild);
        await botMessage.edit({ embeds: [newEmbed] }).catch(() => {});
      }
      await message.delete().catch(() => {});
    }
  });

  // ===== Interaction Buttons =====
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { guild, user, member } = interaction;

    // เปิดตั๋วสกิน
    if (
      interaction.customId === "skin_hi" ||
      interaction.customId === "skin_sky" ||
      interaction.customId === "skin_muy" ||
      interaction.customId === "skin_kim" ||
      interaction.customId === "skin_nj"
    ) {
      // ✅ ACK ไว้ก่อน กัน 10062
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let skinName = "";
      let channelName = "";
      let pingUserId = "";

      switch (interaction.customId) {
        case "skin_hi":
          skinName = "ลายเส้นคุณฮิเคริ";
          channelName = `สกินคุณฮิเคริ`;
          pingUserId = OWNER_IDS.skin_hi;
          break;
        case "skin_sky":
          skinName = "ลายเส้นคุณสกาย";
          channelName = `สกินคุณสกาย`;
          pingUserId = OWNER_IDS.skin_sky;
          break;
        case "skin_muy":
          skinName = "ลายเส้นคุณมุย";
          channelName = `สกินมุยคุง`;
          pingUserId = OWNER_IDS.skin_muy;
          break;
        case "skin_kim":
          skinName = "ลายเส้นคุณขิม";
          channelName = `สกินคุณขิม`;
          pingUserId = OWNER_IDS.skin_kim;
          break;
        case "skin_nj":
          skinName = "ลายเส้นคุณ NJ";
          channelName = `สกินคุณ NJ`;
          pingUserId = OWNER_IDS.skin_nj;
          break;
      }

      // จำกัดไม่เกิน 3 ห้อง/คน/ลายเส้น
      const userChannels = guild.channels.cache.filter(
        (ch) =>
          ch.parentId === CATEGORY_ID &&
          ch.name === channelName &&
          ch.permissionsFor(user.id)?.has(PermissionsBitField.Flags.ViewChannel)
      );

      if (userChannels.size >= 3) {
        await interaction.editReply({
          content: `❗ คุณสามารถเปิดตั๋วลายเส้น ${skinName} ได้สูงสุด 3 ห้องเท่านั้น (ตอนนี้เปิดอยู่ ${userChannels.size} ห้อง)`,
        });
        return;
      }

      // สร้างห้อง
      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // GuildText
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
      });

      const embed = new EmbedBuilder().setTitle(`${skinName}`).setColor(0x9b59b6);
      const formUrl = `https://seamuwwww.vercel.app?channelId=${channel.id}`;

      const deleteBtn = new ButtonBuilder()
        .setCustomId("delete_ticket")
        .setLabel("ลบตั๋ว")
        .setStyle(ButtonStyle.Danger);

      const formBtn = new ButtonBuilder().setLabel("กรอกแบบฟอร์ม").setStyle(ButtonStyle.Link).setURL(formUrl);

      const row = new ActionRowBuilder().addComponents(deleteBtn, formBtn);

      await channel.send({
        content: `<@${user.id}>\n<@${pingUserId}>`,
        embeds: [embed],
        components: [row],
      });

      await interaction.editReply({
        content: `✅ เปิดตั๋วสกินลายเส้น ${skinName} แล้ว: ${channel}`,
      });

      // หลังเปิดตั๋ว อัปเดตบรรทัดคิวในหน้าเมนูด้วย
      try {
        const menuChannel =
          guild.channels.cache.get(SKIN_MENU_CHANNEL_ID) ||
          (await guild.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null));
        if (menuChannel?.isTextBased?.()) {
          const menuMsg = await findExistingMenuMessage(menuChannel);
          if (menuMsg) {
            const newEmbed = await buildMenuEmbed(guild);
            await menuMsg.edit({ embeds: [newEmbed] }).catch(() => {});
          }
        }
      } catch {}

      return;
    }

    // ลบตั๋ว
    if (interaction.customId === "delete_ticket") {
      if (!isAdminOrStaff(member)) {
        return interaction.reply({
          content: "❌ คุณไม่มีสิทธิ์ลบตั๋วนี้ (เฉพาะแอดมินหรือสตาฟเท่านั้น)",
          flags: MessageFlags.Ephemeral, // ✅ ใช้ flags
        });
      }

      // ✅ ตอบก่อน แล้วค่อยลบห้องกัน 10062
      await interaction.reply({
        content: "🗑️ กำลังลบตั๋ว...",
        flags: MessageFlags.Ephemeral,
      });

      setTimeout(async () => {
        const g = interaction.guild;
        const ch = interaction.channel;
        await ch?.delete().catch(console.error);

        // หลังลบ อัปเดตบรรทัดคิวหน้าเมนู
        try {
          const menuChannel =
            g.channels.cache.get(SKIN_MENU_CHANNEL_ID) ||
            (await g.channels.fetch(SKIN_MENU_CHANNEL_ID).catch(() => null));
          if (menuChannel?.isTextBased?.()) {
            const menuMsg = await findExistingMenuMessage(menuChannel);
            if (menuMsg) {
              const newEmbed = await buildMenuEmbed(g);
              await menuMsg.edit({ embeds: [newEmbed] }).catch(() => {});
            }
          }
        } catch {}
      }, 250);

      return;
    }
  });
};
