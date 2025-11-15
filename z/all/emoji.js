
const CHANNEL_IDS = new Set([
  "1439124956901277787",
  "1439125811536859219",
  "1439125644297638009",
  "1439125547954471004",
  "1439125316697325730",
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
