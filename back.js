// feedback.js
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require('discord.js');

const TARGET_GUILD_ID = '1336555551970164839';
const SUBMIT_CHANNEL_ID = '1434953667433205820';
const PANEL_CHANNEL_ID = '1343690544077078600';
const PANEL_TAG = '';
const OPEN_BUTTON_ID = 'open_feedback_modal';
const MODAL_ID = 'feedback_modal';
const INPUT_ID = 'feedback_input';

module.exports = (client) => {
  const isTargetGuild = (guild) => guild && guild.id === TARGET_GUILD_ID;

  function buildPanelEmbed() {
    return new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('กรอกความคิดเห็น')
      .setDescription(
        'กดปุ่มด้านล่างเพื่อกรอกความคิดเห็น\n' +
        'สามารถเสนอแนะการปรับปรุงต่างๆได้หมด ทางเราจะไม่เก็บว่าใครเป็นคนเสนอความคิดเห็น ' +
        'สามารถเสนอแนะได้เต็มที่เบย'
      )
      .setFooter({ text: 'Purple Shop' })
      .setTimestamp(new Date());
  }

  function buildPanelRow() {
    const btn = new ButtonBuilder()
      .setCustomId(OPEN_BUTTON_ID)
      .setLabel('กรอกความคิดเห็น')
      .setStyle(ButtonStyle.Primary);
    return new ActionRowBuilder().addComponents(btn);
  }

  async function ensurePanel() {
    try {
      const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased()) return;
      if (!isTargetGuild(channel.guild)) return; // จำกัดกิลด์

      const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      const exists = messages?.find(
        (m) => m.author?.id === client.user.id && (m.content ?? '').includes(PANEL_TAG)
      );

      if (!exists) {
        await channel.send({
          content: PANEL_TAG,
          embeds: [buildPanelEmbed()],
          components: [buildPanelRow()],
        });
      }
    } catch (err) {
      console.error('[feedback] ensurePanel error:', err);
    }
  }

  client.once(Events.ClientReady, async () => {
    console.log('[feedback] Module ready');
    await ensurePanel();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // จำกัดให้ทำงานเฉพาะกิลด์เป้าหมาย
      if (!interaction.guild || !isTargetGuild(interaction.guild)) return;

      if (interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) {
        const modal = new ModalBuilder()
          .setCustomId(MODAL_ID)
          .setTitle('กรอกความคิดเห็น');

        const input = new TextInputBuilder()
          .setCustomId(INPUT_ID)
          .setLabel('พิมพ์ความคิดเห็นเลอ')
          .setPlaceholder('ตัวอย่าง: แอดมินเป็นไรมากปะ ใส่เดี่ยวกันไหม เห็นห้าวจัง')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        const text = interaction.fields.getTextInputValue(INPUT_ID)?.trim();
        if (!text) {
          await interaction.reply({ content: 'กรอกข้อความก่อนน้า', ephemeral: true });
          return;
        }

        const submitChannel = await client.channels.fetch(SUBMIT_CHANNEL_ID).catch(() => null);
        if (!submitChannel || !submitChannel.isTextBased() || !isTargetGuild(submitChannel.guild)) {
          await interaction.reply({ content: 'ไม่พบห้องสำหรับโพสต์ความคิดเห็น โปรดแจ้งผู้ดูแล', ephemeral: true });
          return;
        }

        const mention = `<@${interaction.user.id}>`;
        await submitChannel.send(`${mention} : ${text}`);
        await interaction.reply({ content: 'ส่งความคิดเห็นเรียบร้อย ขอบคุณมากค้าบบบ', ephemeral: true });
      }
    } catch (err) {
      console.error('[feedback] interaction error:', err);
      if (interaction.isRepliable()) {
        try {
          await interaction.reply({ content: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', ephemeral: true });
        } catch {}
      }
    }
  });
};
