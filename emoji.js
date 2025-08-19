
const CHANNEL_IDS = new Set([
  "1371394966265270323",
  "1374424481447149579",
  "1378318691329904783",
]);

const EMOJIS = ["🫶","☁️","💐","💗","✨"];


const extractEmojiId = (e) => {
  const m = /^<(a)?:\w+:(\d+)>$/.exec(e);
  return m ? m[2] : null;
};

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    try {
      if (message.author?.bot) return;
      if (!CHANNEL_IDS.has(message.channelId)) return;

      for (const e of EMOJIS) {
        try {
          const customId = extractEmojiId(e);
          await message.react(customId ?? e);
        } catch (err) {
          console.warn("React failed for", e, err?.message);
        }
      }
    } catch (err) {
      console.error("messageCreate handler error:", err);
    }
  });
};
