
const EMOJI_POOL = [
  "❤️","💖","💗","💘","💕","💓","💞","✨","🌟","💫",
  "🔥","🎀","🌸","💐","🍓","🧁","🐰","🐱","🐥","🧸",
  "😻","😽","🤍","💙","💚","💛","💜","🩷","🫶","☁️",
  "🌀","💯","🎉","🥳","⚡","🍭","🍬","🌈","⭐","🪄"
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_REACTIONS = 40;
const DELAY_MS = 180;

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    try {
      if (message.author?.bot) return;
      if (!message.guild) return;
      const prefix = "!boom";
      if (!message.content.startsWith(prefix)) return;

      const parts = message.content.trim().split(/\s+/);
      const targetId = parts[1];

      if (!targetId || !/^\d{16,20}$/.test(targetId)) {
        await message.reply("ใส่รูปแบบให้ถูกต้องน้า: `!boom <messageId>`").catch(()=>{});
        return;
      }
      message.delete().catch(()=>{});
      const targetMsg = await message.channel.messages.fetch(targetId).catch(() => null);
      if (!targetMsg) {
        await message.channel.send("ไม่พบข้อความตาม ID ในห้องนี้นะ").catch(()=>{});
        return;
      }

      const shuffled = [...EMOJI_POOL].sort(() => Math.random() - 0.5);
      const toReact = shuffled.slice(0, Math.min(MAX_REACTIONS, shuffled.length));

      for (const emoji of toReact) {
        try {
          await targetMsg.react(emoji);
        } catch (e) {}
        await sleep(DELAY_MS);
      }

    } catch (err) {
      console.error("!boom error:", err);
    }
  });
};
