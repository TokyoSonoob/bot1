const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionsBitField,
} = require("discord.js");
const { getFirestore } = require("firebase-admin/firestore");

module.exports = function (client) {
  const db = getFirestore();
  const skinOrdersRef = db.collection("skinOrders");

  skinOrdersRef.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const data = change.doc.data();
        const channelId = data.channelId;

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setTitle("🖌️ รายละเอียดการสั่งสกิน")
          .setColor("#b96eff")
          .addFields(
            { name: "👀 รูปตา", value: data.eyeType || "-", inline: true },
            { name: "🧍‍♀️ ฟิกเกอร์", value: data.figure || "-", inline: true },
            { name: "📦 ขนาดซัมมอน", value: data.summon || "-", inline: true },

            { name: "🎨 สีตา", value: data.eyeColor || "-", inline: true },
            { name: "🎨 สีขนตา", value: data.eyelashColor || "-", inline: true },
            { name: "🎨 สีแก้ม", value: data.cheekColor || "-", inline: true },

            { name: "💇‍♀️ สีผม 1", value: data.hairColor1 || "-", inline: true },
            { name: "💇‍♀️ สีผม 2", value: data.hairColor2 || "-", inline: true },
            { name: "✨ ไฮไลต์ 1", value: data.highlight1 || "-", inline: true },
            { name: "✨ ไฮไลต์ 2", value: data.highlight2 || "-", inline: true },

            { name: "🎨 สีผิว", value: data.skinColor || "-", inline: true },
            { name: "🎯 สีไฝ", value: data.moleColor || "-", inline: true },
            { name: "📍 ตำแหน่งไฝ", value: data.molePosition || "-", inline: true },

            { name: "🎀 ลายเส้น/พร็อพ", value: data.accessory || "-", inline: true },
            { name: "📝 รายละเอียดเพิ่มเติม", value: data.extraDetail || "-", inline: false }
          )
          .setFooter({ text: "Purple Shop - สกินออเดอร์" })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    });
  });
};
