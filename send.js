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
            { name: "Scale", value: data.summon || "-" },
            { name: "Figura", value: data.figure || "-" },
            { name: "รูปตาแบบ", value: data.eyeType || "-" },

            { name: "สีตา", value: data.eyeColor || "-" },
            { name: "สีขนตา", value: data.eyelashColor || "-" },
            { name: "สีแก้ม", value: data.cheekColor || "-" },

            { name: "สีผม 1", value: data.hairColor1 || "-" },
            { name: "สีผม 2", value: data.hairColor2 || "-" },
            { name: "ผมไฮไลต์ 1", value: data.highlight1 || "-" },
            { name: "ผมไฮไลต์ 2", value: data.highlight2 || "-" },

            { name: "สีผิว", value: data.skinColor || "-" },
            { name: "ตำแหน่งไฝ", value: data.molePosition || "-" },
            { name: "สีไฝ", value: data.moleColor || "-" },

            { name: "เครื่องประดับ", value: data.accessory || "-" },
            { name: "รายละเอียดเพิ่มเติม", value: data.extraDetail || "-" }
          )
          .setFooter({ text: "Purple Shop - สกินออเดอร์" })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        await skinOrdersRef.doc(change.doc.id).delete().catch(console.error);
      }
    });
  });
};
