// file: roleButtons.js
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  Events,
  PermissionsBitField
} = require("discord.js");

const ROLE_ID = "1407747215782449242";

module.exports = (client) => {
  // ส่ง embed + ปุ่มเมื่อพิมพ์ !x1 และ !x2
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    // !x1 => ปุ่มรับยศ
    if (message.content.trim() === "!x1") {
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("ทางเข้าโซนคนเถื่อน")
        .setDescription(`**ใครที่จิตใจดีมีเมตตา นุ่งขาวห่มขาว อายุต่ำกว่า16 รับไม่ได้กับการพิมพ์คำหยาบ ควบคุมตัวเองไม่ได้ ไม่ควรกดเด็ดขาด**`)
        .setFooter({ text: "Make by Purple Shop" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("give_role_x1")
          .setLabel("พร้อมรับชะตากรรม")
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    }

    // !x2 => ปุ่มลบยศ
    if (message.content.trim() === "!x2") {
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("ออกจากโซนเถื่อน")
        .setDescription(`**อาบน้ำล้างตัวให้บริสุทธิ แล้วออกไปแตะหญ้าอีกครั้ง**`)
        .setFooter({ text: "Make by Purple Shop" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("remove_role_x2")
          .setLabel("อาบน้ำเลยยยย")
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    }
  });

  // จัดการตอนกดปุ่ม
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    const role = interaction.guild.roles.cache.get(ROLE_ID);
    if (!role) {
      try {
        await interaction.reply({ content: "❌ ไม่พบยศเป้าหมายในเซิร์ฟเวอร์", ephemeral: true });
      } catch {}
      return;
    }

    // เช็คสิทธิ์บอท
    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      try {
        await interaction.reply({ content: "❌ บอทไม่มีสิทธิ์ Manage Roles", ephemeral: true });
      } catch {}
      return;
    }
    if (role.position >= me.roles.highest.position) {
      try {
        await interaction.reply({ content: "❌ ลำดับยศของบอทต้องสูงกว่ายศเป้าหมาย", ephemeral: true });
      } catch {}
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      try {
        await interaction.reply({ content: "❌ ไม่พบสมาชิก", ephemeral: true });
      } catch {}
      return;
    }

    try {
      if (interaction.customId === "give_role_x1") {
        if (member.roles.cache.has(ROLE_ID)) {
          await interaction.reply({ content: "**กดใหม่เพื่อ? เทสออ????**", ephemeral: true });
        } else {
          await member.roles.add(role, "กดปุ่มรับยศ");
          await interaction.reply({ content: `**ยินดีต้อนรับสู่ความเถื่อนไอสัสสส อ่านด้วยก่อนโดนแบน <#1407742809817088060>**`, ephemeral: true });
        }
      }

      if (interaction.customId === "remove_role_x2") {
        if (!member.roles.cache.has(ROLE_ID)) {
          await interaction.reply({ content: "WTF", ephemeral: true });
        } else {
          await member.roles.remove(role, "กดปุ่มลบยศ");
          await interaction.reply({ content: `**ออกไปแตะหญ้าไปปป**`, ephemeral: true });
        }
      }
    } catch (err) {
      console.error("Role action error:", err);
      try {
        await interaction.reply({ content: "❌ ดำเนินการไม่สำเร็จ ตรวจสอบสิทธิ์และลำดับยศอีกครั้ง", ephemeral: true });
      } catch {}
    }
  });
};
