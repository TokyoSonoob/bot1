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
  .setDescription([
  `**Scale** : ${data.summon || "-"}`,
  `**Figura** : ${data.figure || "-"}`,
  `**รูปตาแบบ** : ${data.eyeType || "-"}`,
  `**สีตา** : ${data.eyeColor || "-"}`,
  `**สีขนตา** : ${data.eyelashColor || "-"}`,
  `**สีแก้ม** : ${data.cheekColor || "-"}`,
  `**สีผม 1** : ${data.hairColor1 || "-"}`,
  `**สีผม 2** : ${data.hairColor2 || "-"}`,
  `**ผมไฮไลต์ 1** : ${data.highlight1 || "-"}`,
  `**ผมไฮไลต์ 2** : ${data.highlight2 || "-"}`,
  `**สีผิว** : ${data.skinColor || "-"}`,
  `**ตำแหน่งไฝ** : ${data.molePosition || "-"}`,
  `**สีไฝ** : ${data.moleColor || "-"}`,
  `**เครื่องประดับ** : ${data.accessory || "-"}`,
  `**รายละเอียดเพิ่มเติม** : ${data.extraDetail || "-"}`
].join("\n"))

          .setFooter({ text: "Purple Shop - สกินออเดอร์" })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    });
  });
};