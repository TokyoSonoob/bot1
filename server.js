const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/** 👇 ชื่อบอทตัวเอง (ชื่อเต็ม) */
const myName = "testLock";

/** 👇 รายชื่อบอททั้งหมด พร้อมชื่อ subdomain สำหรับ ping */
const bots = [
  { name: "Bot1 for my discord", subdomain: "bot1-for-my-discord" },
  { name: "testLock", subdomain: "testlock" },
  { name: "Bot2 to my customer", subdomain: "bot2-to-my-customer" },
];

/** 👇 Deploy hook URL ของแต่ละบอท (ใช้ชื่อเต็มเป็น key) */
const deployHooks = {
  "Bot1 for my discord": "https://api.render.com/deploy/srv-d21tgtre5dus73937jdg?key=7I6ioDTWORs",
  "testLock": "https://api.render.com/deploy/srv-d27rbfvdiees73d09q1g?key=jw_eY2z_BHM",
  "Bot2 to my customer": "https://api.render.com/deploy/srv-d26f236r433s739964dg?key=eqJmBZwzZMQ"
};

/** 👇 เก็บจำนวนครั้งที่บอทไม่ตอบ */
const missedReplies = {};

/** ✅ endpoint ping */
app.post("/ping", (req, res) => {
  const { from } = req.body;
  console.log(`📨 ได้รับ ping จาก ${from}`);
  res.send({ ok: true });
});

/** ✅ health check */
app.get("/", (_, res) => {
  res.status(200).send(`✅ ${myName} รันอยู่!`);
});

/** 🔁 ping ทุกตัวทุก 1 นาที */
setInterval(async () => {
  for (const bot of bots) {
    if (bot.name === myName) continue;

    const url = `https://${bot.subdomain}.onrender.com/ping`;

    try {
      const res = await axios.post(url, { from: myName }, { timeout: 5000 });
      if (res.data.ok) {
        console.log(`✅ ${bot.name} ตอบกลับ`);
        missedReplies[bot.name] = 0;
      }
    } catch (err) {
      console.log(`❌ ${bot.name} ไม่ตอบ`);
      missedReplies[bot.name] = (missedReplies[bot.name] || 0) + 1;
    }
  }

  // Redeploy ถ้าบอทไหนไม่ตอบเกิน 5 ครั้ง และชื่อเราเรียงน้อยกว่าเป้าหมาย
  for (const [botName, missed] of Object.entries(missedReplies)) {
    if (missed >= 5 && shouldRedeploy(botName)) {
      console.log(`🚨 ${botName} ไม่ตอบ ${missed} ครั้ง → redeploy โดย ${myName}`);
      await redeployBot(botName);
      missedReplies[botName] = 0;
    }
  }
}, 60_000);

/** เช็คว่าเราควร redeploy บอทนี้มั้ย (ใช้การเรียงลำดับชื่อเต็ม) */
function shouldRedeploy(targetBotName) {
  return myName < targetBotName;
}

/** เรียก Deploy Hook */
async function redeployBot(botName) {
  const url = deployHooks[botName];
  if (!url) {
    console.error(`❌ ไม่พบ deploy hook ของ ${botName}`);
    return;
  }
  try {
    await axios.post(url);
    console.log(`🔁 Redeploy ${botName} สำเร็จ`);
  } catch (err) {
    console.error(`❌ Redeploy ${botName} ล้มเหลว:`, err.message);
  }
}

/** ▶️ เริ่ม server */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 ${myName} รันอยู่ที่พอร์ต ${PORT}`);
});
