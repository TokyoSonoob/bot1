// quickpay-addqr.js
// ใช้กับ discord.js v14 และ firebase-admin (init ไว้ก่อนเรียกใช้โมดูลนี้)
// วิธีใช้: require('./quickpay-addqr')(client)

const {
  Routes,
  ApplicationCommandOptionType,
  EmbedBuilder,
  Events,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const admin = require("firebase-admin");

const db = admin.firestore();

// ===== เป้าหมายสำหรับโพสต์เก็บรูปชั่วคราว =====
const TARGET_GUILD_ID = "1401622759582466229";
const TARGET_CHANNEL_ID = "1413522411025862799";

// ===== ชื่อคอลเลกชัน Firestore =====
const COL = "quickpay_qr"; // docId = trigger เช่น "!nj"

module.exports = function (client) {
  // ---------- ลงทะเบียนสแลชคอมมานด์ (/addqr) ----------
  client.once("ready", async () => {
    try {
      const ADMIN = PermissionsBitField.Flags.Administrator;
      const cmdDef = [
        {
          name: "addqr",
          description:
            "ตั้งค่าทริกเกอร์ (เช่น !nj) ให้ผูกกับรูป QR/ชำระเงิน แล้วให้บอทจำเพื่อนำไปส่ง Embed (แอดมินเท่านั้น)",
          dm_permission: false, // ใช้ในกิลด์เท่านั้น
          default_member_permissions: ADMIN.toString(), // UI จะมองเห็นเฉพาะคนมีสิทธิ์ Administrator
          options: [
            {
              name: "trigger",
              description: 'ทริกเกอร์ที่ต้องการ เช่น "!nj"',
              type: ApplicationCommandOptionType.String,
              required: true,
            },
            {
              name: "timeout_sec",
              description: "เวลารอรูป (วินาที) ค่าเริ่มต้น 120",
              type: ApplicationCommandOptionType.Integer,
              required: false,
            },
          ],
        },
      ];

      await client.rest.put(
        Routes.applicationCommands(client.application.id),
        { body: cmdDef }
      );
      console.log("✅ Registered /addqr (admin-only)");
    } catch (e) {
      console.error("❌ Failed to register /addqr:", e);
    }
  });

  // ---------- ลงทะเบียนสแลชคอมมานด์ (/removeqr) แยก โดยไม่แตะต้อง /addqr ----------
  client.once("ready", async () => {
    try {
      const ADMIN = PermissionsBitField.Flags.Administrator;
      await client.rest.post(
        Routes.applicationCommands(client.application.id),
        {
          body: {
            name: "removeqr",
            description: "ลบ trigger ที่ตั้งค่าไว้ (แอดมินเท่านั้น)",
            dm_permission: false,
            default_member_permissions: ADMIN.toString(),
          },
        }
      );
      console.log("✅ Registered /removeqr (admin-only)");
    } catch (e) {}
  });

  // ---------- Map เก็บสถานะรอรูปต่อผู้ใช้ ----------
  // key = userId, value = { trigger, timeoutAt, originChannelId }
  const awaitingImage = new Map();

  // ---------- handler: /addqr ----------
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "addqr") return;

      // ✅ ตรวจสิทธิ์ซ้ำตอนรันจริง (กันกรณีมีการเปลี่ยนสิทธิ์/แคช)
      if (!interaction.guild) {
        return interaction.reply({ ephemeral: true, content: "❌ ใช้คำสั่งนี้ได้เฉพาะในเซิร์ฟเวอร์" });
      }
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          ephemeral: true,
          content: "❌ เฉพาะ **แอดมิน (Administrator)** เท่านั้นที่ใช้คำสั่งนี้ได้",
        });
      }

      const triggerRaw = interaction.options.getString("trigger");
      const trigger = String(triggerRaw || "").trim();
      const timeoutSec = interaction.options.getInteger("timeout_sec") || 120;

      if (!trigger.startsWith("!") || trigger.length < 2) {
        return interaction.reply({
          ephemeral: true,
          content: "❌ โปรดใส่ trigger ที่ขึ้นต้นด้วย ! เช่น `!nj`",
        });
      }

      const timeoutAt = Date.now() + timeoutSec * 1000;
      awaitingImage.set(interaction.user.id, {
        trigger,
        timeoutAt,
        originChannelId: interaction.channelId,
      });

      await interaction.reply({
        ephemeral: true,
        content:
          `✅ กำลังรอรูปจากคุณภายใน **${timeoutSec} วินาที**\n` +
          `- ทริกเกอร์: \`${trigger}\`\n` +
          `- ส่งรูปเข้ามาได้เลย (รูปแรกที่ส่งจะถูกใช้)\n` +
          `- ระบบจะส่งรูปไปห้องเก็บ (Server ${TARGET_GUILD_ID} / ห้อง ${TARGET_CHANNEL_ID}) แล้วจำ URL จากโพสต์นั้น`,
      });
    } catch (err) {
      console.error("addqr interaction error:", err);
    }
  });

  // ---------- handler: /removeqr ----------
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

      if (interaction.isChatInputCommand() && interaction.commandName === "removeqr") {
        if (!interaction.guild) return interaction.reply({ ephemeral: true, content: "❌ ใช้ได้ในเซิร์ฟเวอร์เท่านั้น" });
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ ephemeral: true, content: "❌ เฉพาะแอดมินเท่านั้น" });
        }

        const snap = await db.collection(COL).limit(25).get();
        if (snap.empty) return interaction.reply({ ephemeral: true, content: "ไม่มีรายการให้ลบ" });

        const options = [];
        snap.forEach((doc) => {
          const trig = doc.id;
          const data = doc.data() || {};
          options.push({
            label: trig,
            description: data.imageUrl ? (data.imageUrl.length > 90 ? data.imageUrl.slice(0, 90) : data.imageUrl) : "no image",
            value: trig,
          });
        });

        const embed = new EmbedBuilder()
          .setTitle("เลือกรายการที่จะลบ")
          .setDescription("เลือกทริกเกอร์จากเมนูด้านล่าง")
          .setColor(0x9b59b6);

        const menu = new StringSelectMenuBuilder()
          .setCustomId("qr:remove:select")
          .setPlaceholder("เลือกทริกเกอร์")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);

        return interaction.reply({ ephemeral: true, embeds: [embed], components: [row] });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === "qr:remove:select") {
        if (!interaction.guild) return interaction.reply({ ephemeral: true, content: "❌ ใช้ได้ในเซิร์ฟเวอร์เท่านั้น" });
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ ephemeral: true, content: "❌ เฉพาะแอดมินเท่านั้น" });
        }

        const values = interaction.values || [];
        if (!values.length) return interaction.reply({ ephemeral: true, content: "ไม่ได้เลือกรายการ" });

        const trig = values[0];
        await db.collection(COL).doc(trig).delete().catch(() => {});
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("ลบสำเร็จ").setDescription(`ลบ \`${trig}\` แล้ว`).setColor(0x2ecc71)],
          components: [],
        });
      }
    } catch {}
  });

  // ---------- handler: messageCreate ----------
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;

      // 1) ผู้ใช้กำลังอยู่ในสถานะรอรูปอยู่ไหม
      const pending = awaitingImage.get(message.author.id);
      const now = Date.now();

      if (pending) {
        // หมดเวลารอหรือไม่
        if (now > pending.timeoutAt) {
          awaitingImage.delete(message.author.id);
          if (message.channelId === pending.originChannelId) {
            await message.reply({
              content: "⏰ หมดเวลารอรูปแล้ว โปรดรัน `/addqr` ใหม่",
              allowedMentions: { repliedUser: false },
            });
          }
          return;
        }

        // ต้องมีรูปอย่างน้อย 1 รูป
        const firstImg =
          (message.attachments &&
            [...message.attachments.values()].find((a) =>
              a.contentType?.startsWith("image/")
            )) ||
          null;
        if (!firstImg) return; // ยังไม่ใช่รูป

        // ส่งซ้ำรูปไปที่ห้องเก็บ (ถาวร)
        const targetGuild =
          message.client.guilds.cache.get(TARGET_GUILD_ID) ||
          (await message.client.guilds.fetch(TARGET_GUILD_ID).catch(() => null));
        if (!targetGuild) {
          awaitingImage.delete(message.author.id);
          await message.reply({
            content:
              "❌ ไม่พบเซิร์ฟเวอร์ปลายทาง (TARGET_GUILD_ID) โปรดตรวจสอบการตั้งค่า",
            allowedMentions: { repliedUser: false },
          });
          return;
        }

        const targetChannel =
          targetGuild.channels.cache.get(TARGET_CHANNEL_ID) ||
          (await targetGuild.channels.fetch(TARGET_CHANNEL_ID).catch(() => null));
        if (!targetChannel || !targetChannel.isTextBased()) {
          awaitingImage.delete(message.author.id);
          await message.reply({
            content:
              "❌ ไม่พบแชนเนลปลายทางหรือไม่ใช่แชนเนลข้อความ (TARGET_CHANNEL_ID)",
            allowedMentions: { repliedUser: false },
          });
          return;
        }

        // โพสต์ไปห้องเก็บ (ไม่ลบ)
        const sent = await targetChannel.send({
          content: `QR สำหรับ ${pending.trigger} (อัปโดย <@${message.author.id}>)`,
          files: [firstImg.url],
        });

        // ดึง URL ของรูปจากข้อความที่เพิ่งโพสต์
        const imgAtt = sent.attachments?.first();
        const imgUrl = imgAtt?.url || firstImg.url;

        // บันทึก Firestore
        await db
          .collection(COL)
          .doc(pending.trigger)
          .set(
            {
              guildId: TARGET_GUILD_ID,
              channelId: TARGET_CHANNEL_ID,
              messageId: sent.id,
              imageUrl: imgUrl || null,
              createdBy: message.author.id,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

        // ลบรูปที่ผู้ใช้ส่ง (กันรกฝั่งผู้ใช้)
        await message.delete().catch(() => {});

        // เคลียร์สถานะรอ
        awaitingImage.delete(message.author.id);

        // แจ้งผล (ลบตัวเองใน 5 วิ)
        const confirm = await message.channel.send({
          content: `✅ บันทึกเรียบร้อย! ผูกทริกเกอร์ \`${pending.trigger}\` กับรูปสำเร็จ`,
        });
        setTimeout(() => {
          confirm.delete().catch(() => {});
        }, 5000);

        return;
      }

      // 2) โหมดเรียกใช้งาน trigger เช่น !nj  -> จำกัด "เฉพาะแอดมินเท่านั้น"
      const content = (message.content || "").trim();
      if (!content.startsWith("!")) return;

      // ต้องอยู่ในกิลด์ และผู้ใช้ต้องเป็นแอดมินเท่านั้นถึงจะเรียก trigger ได้
      if (!message.guild) return;
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      const isAdmin = member?.permissions?.has(PermissionsBitField.Flags.Administrator);
      if (!isAdmin) {
        // แจ้งเตือนเบาๆ แล้วลบทิ้ง
        const warn = await message.reply({
          content: "🔒 คำสั่งชำระเงินนี้ใช้ได้เฉพาะ **แอดมิน** เท่านั้น",
          allowedMentions: { repliedUser: false },
        }).catch(() => null);
        setTimeout(() => warn?.delete?.().catch(() => {}), 5000);
        // ไม่ต้องลบข้อความผู้ใช้เพื่อหลีกเลี่ยงความรู้สึกแย่ (ถ้าต้องการลบให้เปิดคอมเมนต์ด้านล่าง)
        // if (message.channel.permissionsFor(message.client.user)?.has(PermissionsBitField.Flags.ManageMessages)) {
        //   await message.delete().catch(() => {});
        // }
        return;
      }

      const doc = await db.collection(COL).doc(content).get();
      if (!doc.exists) return; // ยังไม่ได้ตั้งค่า trigger นี้

      // ลบข้อความคำสั่งของผู้ใช้ (ถ้ามีสิทธิ์)
      if (
        message.guild &&
        message.channel &&
        message.channel
          .permissionsFor(message.client.user)
          ?.has(PermissionsBitField.Flags.ManageMessages)
      ) {
        await message.delete().catch(() => {});
      }

      const data = doc.data();
      const imgUrl = data?.imageUrl || null;
      if (!imgUrl) return;

      // ส่ง Embed ตามธีม
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage(imgUrl)
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("quickpay-addqr messageCreate error:", err);
    }
  });
};
