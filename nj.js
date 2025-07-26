module.exports = function(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content === "!nj") {
      await message.delete().catch(console.error);
      const embed = new EmbedBuilder()
        .setTitle("test")
        .setDescription("test")
        .setColor(0xff6f61)
        .setImage("https://i.pinimg.com/originals/34/1e/80/341e800b1f29d3e34ea2eba5a6af205c.gif")
        .setFooter({ text: "Powered by NJ Bot" });

      await message.channel.send({ embeds: [embed] });
    }
  });
};
