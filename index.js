// index.js
require("dotenv").config();
const events = require("events");
const { Client, GatewayIntentBits } = require("discord.js");
const { db, admin } = require("./firebase");

// จำกัดจำนวน listener กัน warning
events.defaultMaxListeners = 50;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.setMaxListeners(50);

// ====== ดึง Express app จาก server.js ======
const app = require("./server");

// คำนวณ baseUrl สำหรับใช้สร้างลิงก์ /p/:id
const baseUrl =
  (process.env.P_BASE_URL && process.env.P_BASE_URL.replace(/\/+$/, "")) ||
  (process.env.RENDER_EXTERNAL_URL &&
    process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "")) ||
  `http://localhost:${process.env.PORT || 3000}`;

// ====== โหลดโมดูลอื่นของบอทตามเดิม ======
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

// ====== /p อยู่ในไฟล์นี้ (ส่ง client + app + baseUrl เข้าไป) ======
require("./picture")(client, app, baseUrl);

// ====== ล็อกอินบอท Discord ======
client.login(process.env.token);
