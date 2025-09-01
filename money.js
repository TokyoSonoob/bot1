const { EmbedBuilder } = require("discord.js");

module.exports = function (client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content === "!nj") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://drive.google.com/uc?export=download&id=1z6GLXQIJ6mVWjYQuMId7DUpfdy1oup40")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    }
    if (message.content === "!hi") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://cdn.discordapp.com/attachments/1400551163321122836/1410710264336351274/11_20250827232117-1.png?ex=68b201d0&is=68b0b050&hm=3b4bc3f9f6f0fe46f055792ca6b36d33e4607d6760e241e48bd968435b7d1b64&")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    }
    if (message.content === "!sky") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://drive.google.com/uc?export=download&id=1zCzdEkTe13jE0pRkzn5LvgMXGXIf3xiF")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    }
    if (message.content === "!ne") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://drive.google.com/uc?export=download&id=1zFIRbkzMcQWlGNAQemuqZonfdqhLfvwi")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    }
    if (message.content === "!muy") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://drive.google.com/uc?export=download&id=10yqYe3T_jCI_zq733uub1fWlAh_tAHId")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    } 
    if (message.content === "!sea") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://drive.google.com/uc?export=download&id=1DDmlbAXdnKIvnDW5vz-JJpT8a4Bw9BNV")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    }
    if (message.content === "!sand") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("⭐ สามารถโอนได้เลยน้าา")
        .setDescription("ช่องทางการชำระเงิน")
        .setColor(0x9b59b6)
        .setImage("https://drive.google.com/uc?export=download&id=1JgRZ-bHp1Uho2yQPb-NszqhDf5637Ism")
        .setFooter({ text: "Make by Purple Shop" });

      await message.channel.send({ embeds: [embed] });
    }
  });
};