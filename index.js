require('dotenv').config();
const { Client, GatewayIntentBits } = require("discord.js");
const { db, admin } = require('./firebase');
require("./server");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

require("./z/all/emoji")(client);
require("./z/all/ban")(client);
require("./z/all/boom")(client);
require("./z/all/clearchat")(client);
require("./z/all/embed")(client);
require("./z/all/everyone")(client);
require("./z/all/money")(client);
require("./z/all/pro")(client);
require("./z/all/report")(client);

require("./z/tick/com")(client);
require("./z/tick/dis")(client);
require("./z/tick/skin")(client);
require("./z/tick/test")(client);
require("./z/tick/ticket")(client);

require("./tt")(client);



client.login(process.env.token);
