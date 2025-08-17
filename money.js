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
        .setImage("https://drive.google.com/uc?export=download&id=1zMm8-mNzBVI72oARLoQ13Ot8Oz44vRzW")
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
        .setImage("https://drive.google.com/uc?export=download&id=1zV6c5K2H5IykehhKDkx5Hx_m3qUkX7ac")
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
