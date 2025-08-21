// first-opener.js
// ต้องมี intents: Guilds, GuildMessages, MessageContent, GuildMembers
const { Events, ChannelType } = require("discord.js");

module.exports = (client) => {
  const CATEGORY_ID = "1375026841114509332";
  // จับ "ชื่อ เลข" เช่น "sea 100" หรือ "เนจิ 50" (จำนวนเต็ม)
  const NAME_NUMBER_REGEX = /^\s*([\p{L}\p{N}_.\-]+)\s+(\d+)\s*$/u;

  // กันซ้ำ: ถ้าช่องใดประกาศ “คนแรก” ไปแล้ว จะไม่ประกาศซ้ำอีก
  const claimedChannels = new Set();

  // helper: หา "บิดก่อนหน้า" (ชื่อ + ราคา + userId) ก่อนข้อความปัจจุบัน
  async function findPrevBid(channel, beforeId) {
    let cursor = beforeId;
    while (true) {
      const batch = await channel.messages.fetch({ before: cursor, limit: 100 });
      if (batch.size === 0) break;
      for (const [, m] of batch) {
        if (m.author.bot) continue;
        const mm = (m.content || "").trim().match(NAME_NUMBER_REGEX);
        if (mm) {
          return { prevName: mm[1], prevAmount: mm[2], prevUserId: m.author.id };
        }
      }
      cursor = batch.last()?.id;
      if (!cursor) break;
    }
    return null;
  }

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const ch = message.channel;

      // รองรับทั้งห้อง text และ thread
      const isText =
        ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.PublicThread ||
        ch.type === ChannelType.PrivateThread ||
        ch.type === ChannelType.AnnouncementThread;
      if (!isText) return;

      // หา category id ให้ถูกทั้งกรณีห้องและ thread
      const categoryId = ch.parent?.parentId ?? ch.parentId;
      if (categoryId !== CATEGORY_ID) return;

      // ชื่อห้องต้องมีคำว่า "ครั้งที่"
      if (!ch.name.includes("ครั้งที่")) return;

      // เช็คว่าเป็นข้อความรูปแบบ "ชื่อ เลข" ไหม
      const content = (message.content || "").trim();
      const match = content.match(NAME_NUMBER_REGEX);
      if (!match) return;

      const nameText = match[1]; // เผื่อใช้ต่อ
      const amount = match[2];

      // ตรวจว่าเป็นข้อความรูปแบบนี้ "คนแรก" ในช่องหรือไม่
      let isFirst = !claimedChannels.has(ch.id);
      if (isFirst) {
        let lookbackLeft = 500;
        let beforeId = message.id;
        while (lookbackLeft > 0) {
          const batch = await ch.messages.fetch({ before: beforeId, limit: 100 });
          if (batch.size === 0) break;

          let foundEarlier = false;
          for (const [, m] of batch) {
            if (m.author.bot) continue;
            if (NAME_NUMBER_REGEX.test((m.content || "").trim())) {
              isFirst = false;
              foundEarlier = true;
              break;
            }
          }
          if (foundEarlier) break;
          beforeId = batch.last()?.id;
          if (!beforeId) break;
          lookbackLeft -= batch.size;
        }
      }

      if (isFirst) {
        claimedChannels.add(ch.id);

        const lastMention = `<@${message.author.id}>`;
        const repliesFirst = [
          `**คุณ ${lastMention} เปิดมาคนแรกแล้ว!!**`,
          `**${lastMention} เปิดคนแรกเลยสุดเกิ้นนน**`,
          `**${lastMention} เปิดมาแล้วว**`,
          `**${lastMention} ขอบคูณสำหรับบิดแรกค้าบบบ**`,
          `**${lastMention} มาแล้วววว**`,
          `**${lastMention} เปิดเลยหรออ้ายย**`,
          `**${lastMention} มาละะะ**`,
          `**${lastMention} อ้ายเปิดแบบโครต skibidi เลออ**`,
          `**${lastMention} มาแล้วอ้ายยยย**`,
          `**${lastMention} เอาจัดด**`,
          `**${lastMention} เปิดดดเลอออ**`,
          `**${lastMention} มีใครต่อบ้างงคับฟู่วว**`,
          `**${lastMention} เปิดแล้วววว มีใครกล้าบิดต่อบ้างง**`,
          `**${lastMention} ขอบคุณบิดแรกนะอ้าย**`,
          `**${lastMention} บิดแรกมาแล้ว มาจุ้บที**`,
          `**${lastMention} บิดมาแล้ว หันตูดมาเลยอ้าย**`,
          `**${lastMention} เอาจาดดดดดดดดดดดดดดดดดดดดดดดดดดดดดดดดด**`,
          `**${lastMention} เปิดเลอออออออออออออ**`,
          `**${lastMention} เปิดประมูลแล้ว เมื่อไรจะเปิดใจจจจจ**`,
          `**${lastMention} เหยดๆๆๆ เปิดแล้วววววว**`,
          `**${lastMention} โหหหหอ้ายยยย**`,
        ];
        const msg = repliesFirst[Math.floor(Math.random() * repliesFirst.length)];
        await message.reply(msg);

      } else {
        // หา "คนก่อนหน้า"
        const prev = await findPrevBid(ch, message.id);
        const prevId = prev?.prevUserId;
        const prevMention = prevId ? `<@${prevId}>` : "อีกคน";
        const lastMention = `<@${message.author.id}>`;

        // === กฎใหม่: ถ้าเลขล่าสุด <= เลขเก่า -> ลบข้อความล่าสุดแล้วจบ ===
        const prevAmtNum = prev ? Number(prev.prevAmount) : NaN;
        const curAmtNum = Number(amount);
        if (!Number.isNaN(prevAmtNum) && !Number.isNaN(curAmtNum) && curAmtNum <= prevAmtNum) {
          await message.delete().catch(() => {}); // ต้องมีสิทธิ์ Manage Messages
          return;
        }

        // ถ้าคนก่อนหน้า == คนล่าสุด -> ใช้ประโยคพิเศษแบบสุ่ม
        if (prevId && prevId === message.author.id) {
          const repliesSameUser = [
            `**${prevMention} ลงซ้ำไปอีกกก**`,
            `**${prevMention} ลงต่อออ**`,
            `**${prevMention} ลงต่อเล้ยยยย**`,
            `**${prevMention} ลงอีกอออ้ายยย**`,
            `**${prevMention} ลงขนาดนี้ใครจะสู้**`,
            `**${prevMention} หาาาา เอาจริงดิ**`,
            `**${prevMention} ถามจริงง ไม่รอคนอื่นเลยหรออ้าย**`,
            `**${prevMention} เหยดดด ต่อตัวเองเลยหว่ะะ**`,
            `**${prevMention} สุดจาดดดด**`,
            `**${prevMention} ใจเยนนนอ้ายยยยย**`,
          ];
          const msg = repliesSameUser[Math.floor(Math.random() * repliesSameUser.length)];
          await message.reply(msg);
          return;
        }

        // กรณีทั่วไป
        const repliesNotFirst = [
          `**${lastMention} เปิดมาที่ ${amount} แล้ว ${prevMention} จะสู้รึป่าววววว**`,
          `**${lastMention} สู้อะะะะะะ  แล้ว ${prevMention} จะสู้ป่าวววว**`,
          `**${lastMention} โหอ้ายยย ${amount} แล้ววว  ${prevMention} ไหวป่าววว**`,
          `**${lastMention} สู้จัดด ${prevMention} ไหวป่าว ${amount}เลยน้าา**`,
          `**${lastMention}  เอาสุดดดดด!!!**`,
          `**${lastMention} มาหว่ะะ  ${prevMention} งานสวยแบบนี้ต้องสู้ละป่าววว**`,
          `**${prevMention} สู้ป่าวววว**`,
          `**${lastMention} มาเหนือจาด**`,
          `**${lastMention} พี่จัดขนาดนี้แล้ว ${prevMention} จะสู้ป่าวว**`,
          `**${lastMention} สู้มาแล้ววว ${prevMention} อ้ายว่าไง**`,
          `**${prevMention} ยอมหรือสู้ละอ้ายยย**`,
          `**${lastMention} งานแบบนี้ยอมไม่ได้หว่ะะะ**`,
          `**${lastMention} เอาสุดทางเลยหรออ้ายยย ${prevMention} สู้ป่าววว**`,
          `**${lastMention} พรี่อย่างสุดดด ${prevMention} ต้องสู้แล้ววว**`,
          `**${lastMention} อ้ายดันสุดดด  ${prevMention}**`,
          `**${amount} แล้วทุกคน!!! ${prevMention} จะสู้ไหมมม**`,
          `**${amount} มาแล้วววว ${prevMention} เอาป่าวอ้ายย**`,
          `**${amount} แล้วหว่ะะะ ${prevMention} ยอมหรือไปต่ออ้ายย**`,
        ];
        const msg = repliesNotFirst[Math.floor(Math.random() * repliesNotFirst.length)];
        await message.reply(msg);
      }
    } catch (err) {
      console.error("first-opener error:", err);
    }
  });
};
