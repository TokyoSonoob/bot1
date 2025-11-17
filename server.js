// server.js
const express = require("express");
const multer = require("multer");
const { getSession, uploadImageForSession } = require("./picture");

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("OK");
});

// หน้าแรก /p/:id
app.get("/p/:id", (req, res) => {
  const id = req.params.id;
  const session = getSession(id);
  if (!session) {
    res.status(404).send("Session not found or expired.");
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>อัปโหลดรูปภาพ</title>
<style>
  * { box-sizing: border-box; }

  :root {
    --primary: #a855f7;
    --secondary: #ec4899;
    --bg1: #050017;
    --bg2: #140032;
    --glow: rgba(236, 72, 153, 0.9);
  }

  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
    margin: 0;
    color: #f9fafb;
    background: radial-gradient(circle at top, #4c1d95 0, #020617 55%, #000 100%);
    overflow: hidden;
  }

  /* พื้นหลังอนิเมชั่น */
  .bg-orbit {
    position: fixed;
    inset: 0;
    overflow: hidden;
    z-index: -1;
  }
  .orbit-layer {
    position: absolute;
    width: 200%;
    height: 200%;
    top: -50%;
    left: -50%;
    background:
      radial-gradient(circle at 20% 10%, rgba(236, 72, 153, 0.35), transparent 55%),
      radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.4), transparent 55%),
      radial-gradient(circle at 10% 80%, rgba(45, 212, 191, 0.25), transparent 55%),
      radial-gradient(circle at 90% 75%, rgba(168, 85, 247, 0.35), transparent 55%);
    filter: blur(12px);
    animation: orbitMove 26s linear infinite alternate;
  }
  @keyframes orbitMove {
    0% { transform: translate3d(0,0,0) rotate(0deg); }
    50% { transform: translate3d(3%, -4%, 0) rotate(8deg); }
    100% { transform: translate3d(-4%, 4%, 0) rotate(-6deg); }
  }

  .shell {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 18px;
  }

  .card {
    position: relative;
    width: 100%;
    max-width: 420px;
    padding: 26px 22px 26px;
    border-radius: 28px;
    background: radial-gradient(circle at top left, rgba(88, 28, 135, 0.35), rgba(15, 23, 42, 0.96));
    box-shadow:
      0 0 40px rgba(236, 72, 153, 0.4),
      0 0 90px rgba(88, 28, 135, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.35);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    overflow: hidden;
    animation: floatCard 3.6s ease-in-out infinite;
  }

  @keyframes floatCard {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  .card-glow-ring {
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    pointer-events: none;
    background:
      conic-gradient(
        from 180deg,
        rgba(236, 72, 153, 0) 0deg,
        rgba(236, 72, 153, 0.6) 90deg,
        rgba(129, 140, 248, 0.6) 180deg,
        rgba(45, 212, 191, 0.4) 270deg,
        rgba(236, 72, 153, 0) 360deg
      );
    opacity: 0;
    animation: ringSweep 4.2s ease-in-out infinite;
    mix-blend-mode: screen;
  }
  @keyframes ringSweep {
    0%,100% { opacity: 0; filter: blur(28px); }
    20% { opacity: 0.75; filter: blur(16px); }
    60% { opacity: 0.25; filter: blur(22px); }
  }

  .card-inner {
    position: relative;
    z-index: 1;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
  }

  .planet-icon {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    background:
      radial-gradient(circle at 30% 20%, rgba(248, 250, 252, 0.9), transparent 55%),
      conic-gradient(from 210deg, #ec4899, #a855f7, #22c55e, #0ea5e9, #ec4899);
    box-shadow:
      0 0 26px rgba(236, 72, 153, 0.9),
      0 0 60px rgba(129, 140, 248, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .planet-orbit {
    position: absolute;
    width: 130%;
    height: 130%;
    border-radius: 999px;
    border: 2px dashed rgba(15, 23, 42, 0.9);
    animation: orbitSpin 7s linear infinite;
    opacity: 0.65;
  }
  @keyframes orbitSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .planet-dot {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 0 18px rgba(15, 23, 42, 0.9);
  }

  h1 {
    font-size: 21px;
    margin: 0 0 4px;
    letter-spacing: 0.03em;
  }

  .subtitle {
    font-size: 13px;
    color: #cbd5f5;
    opacity: 0.9;
  }

  .divider {
    height: 1px;
    width: 100%;
    margin: 18px 0 20px;
    background: linear-gradient(
      90deg,
      rgba(148, 163, 184, 0),
      rgba(148, 163, 184, 0.65),
      rgba(148, 163, 184, 0)
    );
    opacity: 0.7;
  }

  .hidden-input {
    display: none;
  }

  .upload-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 28px;
    border-radius: 999px;
    border: none;
    font-size: 16px;
    cursor: pointer;
    background: radial-gradient(circle at top left, var(--secondary), var(--primary));
    color: #fff;
    box-shadow:
      0 0 25px rgba(236, 72, 153, 0.92),
      0 0 55px rgba(168, 85, 247, 0.8);
    text-shadow: 0 0 12px rgba(15, 23, 42, 0.9);
    transition:
      transform 0.18s ease-out,
      box-shadow 0.18s ease-out,
      filter 0.18s ease-out,
      background 0.22s ease-out;
    width: 100%;
  }

  .upload-btn::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(120deg, rgba(255, 255, 255, 0.35), transparent 70%);
    mix-blend-mode: screen;
    opacity: 0;
    transform: translateX(-40%);
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  .upload-btn:hover {
    transform: translateY(-1px) scale(1.03);
    box-shadow:
      0 0 35px rgba(236, 72, 153, 1),
      0 0 80px rgba(88, 28, 135, 0.95);
    filter: brightness(1.07);
  }

  .upload-btn:hover::before {
    opacity: 1;
    transform: translateX(20%);
  }

  .upload-btn:active {
    transform: translateY(1px) scale(0.97);
    box-shadow:
      0 0 18px rgba(236, 72, 153, 0.7),
      0 0 45px rgba(88, 28, 135, 0.7);
    filter: brightness(0.96);
  }

  .btn-icon {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid rgba(248, 250, 252, 0.95);
    border-left-color: transparent;
    border-bottom-color: transparent;
    transform: rotate(45deg);
    box-shadow: 0 0 12px rgba(15, 23, 42, 0.9);
  }

  .note {
    margin-top: 18px;
    font-size: 12px;
    color: #e5e7eb;
    opacity: 0.8;
  }
  .note span {
    color: #a5b4fc;
  }

  .foot {
    margin-top: 18px;
    font-size: 11px;
    color: #9ca3af;
    opacity: 0.7;
  }

  /* ขนาดเล็กมือถือ */
  @media (max-width: 480px) {
    .shell {
      padding: 18px 14px;
    }
    .card {
      border-radius: 22px;
      padding: 22px 18px 22px;
      animation-duration: 3s;
    }
    .title-row {
      gap: 10px;
    }
    .planet-icon {
      width: 46px;
      height: 46px;
    }
    h1 {
      font-size: 18px;
    }
    .subtitle {
      font-size: 12px;
    }
    .upload-btn {
      padding: 13px 20px;
      font-size: 15px;
    }
  }
</style>
</head>
<body>
<div class="bg-orbit">
  <div class="orbit-layer"></div>
</div>

<div class="shell">
  <div class="card" id="card">
    <div class="card-glow-ring"></div>
    <div class="card-inner">
      <div class="title-row">
        <div class="planet-icon">
          <div class="planet-orbit"></div>
          <div class="planet-dot"></div>
        </div>
        <div>
          <h1>อัปโหลดรูปภาพของคุณ</h1>
          <div class="subtitle">ส่งรูปเข้า Discord ให้เสร็จในคลิกเดียว</div>
        </div>
      </div>

      <div class="divider"></div>

      <form id="uploadForm" method="post" enctype="multipart/form-data">
        <input id="fileInput" class="hidden-input" type="file" name="image" accept="image/*" required />
        <button type="button" id="uploadBtn" class="upload-btn">
          <span class="btn-icon"></span>
          <span>เลือกและอัปโหลดรูปภาพ</span>
        </button>
      </form>

      <div class="note">
        รองรับไฟล์ภาพไม่เกิน <span>8MB</span> · แนะนำให้ใช้ไฟล์ .PNG หรือ .JPG
      </div>
      <div class="foot">
        เมื่ออัปโหลดแล้ว ระบบจะพาคุณกลับไปที่ห้อง Discord โดยอัตโนมัติ
      </div>
    </div>
  </div>
</div>

<script>
  const fileInput = document.getElementById("fileInput");
  const form = document.getElementById("uploadForm");
  const btn = document.getElementById("uploadBtn");
  const card = document.getElementById("card");

  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (!fileInput.files || !fileInput.files[0]) return;
    btn.disabled = true;
    btn.innerHTML = "<span class='btn-icon' style='border-width:3px;border-left-color:transparent;border-bottom-color:transparent;border-top-color:#f9fafb;border-right-color:#f9fafb;animation:spin 0.8s linear infinite'></span><span>กำลังอัปโหลด...</span>";
    form.submit();
  });

  // เอฟเฟกต์เอนการ์ดเล็กน้อยบนคอม
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  if (!isCoarse && card) {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const tiltX = y * 8;
      const tiltY = -x * 8;
      card.style.transform = "translateY(-6px) rotateX(" + tiltX + "deg) rotateY(" + tiltY + "deg)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  }

  // เพิ่ม keyframes หมุนใน runtime ให้ใช้กับปุ่มโหลด
  const style = document.createElement("style");
  style.textContent = "@keyframes spin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}";
  document.head.appendChild(style);
</script>
</body>
</html>
`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// รับไฟล์จาก /p/:id
app.post("/p/:id", upload.single("image"), async (req, res) => {
  const id = req.params.id;
  const session = getSession(id);
  if (!session) {
    res.status(404).send("Session not found or expired.");
    return;
  }
  if (!req.file) {
    res.status(400).send("กรุณาเลือกรูปภาพก่อน");
    return;
  }

  try {
    const result = await uploadImageForSession(
      id,
      req.file.buffer,
      req.file.originalname || "image.png"
    );

    if (!result.ok) {
      console.error("Upload error:", result.reason);
      res.status(500).send("เกิดข้อผิดพลาดขณะอัปโหลด");
      return;
    }

    const redirectUrl = result.redirectUrl;

    const doneHtml = `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>อัปโหลดสำเร็จ</title>
<style>
  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top, #22c55e 0, #052e16 55%, #000 100%);
    color: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .bg-pulse {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(circle at 10% 10%, rgba(190, 242, 100, 0.45), transparent 55%),
      radial-gradient(circle at 90% 10%, rgba(34, 197, 94, 0.4), transparent 55%),
      radial-gradient(circle at 50% 90%, rgba(16, 185, 129, 0.45), transparent 55%);
    filter: blur(12px);
    opacity: 0.9;
    animation: bgPulse 5s ease-in-out infinite alternate;
    z-index: -1;
  }
  @keyframes bgPulse {
    0% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.08); opacity: 1; }
    100% { transform: scale(1.02); opacity: 0.8; }
  }

  .wrap {
    text-align: center;
    padding: 24px;
  }

  .check-container {
    width: 150px;
    height: 150px;
    border-radius: 999px;
    border: 5px solid #bbf7d0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 22px;
    box-shadow:
      0 0 40px rgba(190, 242, 100, 0.9),
      0 0 90px rgba(34, 197, 94, 0.9);
    background: radial-gradient(circle at 30% 20%, #22c55e, #052e16);
    animation:
      popCircle 0.42s ease-out forwards,
      floatCircle 3s ease-in-out infinite 0.42s;
  }
  @keyframes popCircle {
    0% { transform: scale(0.4); opacity: 0; }
    80% { transform: scale(1.12); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes floatCircle {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  .check {
    width: 70px;
    height: 36px;
    border-left: 7px solid #ecfeff;
    border-bottom: 7px solid #ecfeff;
    transform: rotate(-45deg) translateY(-2px);
    opacity: 0;
    animation: drawCheck 0.32s 0.25s ease-out forwards;
  }
  @keyframes drawCheck {
    0% { opacity: 0; transform: rotate(-45deg) scale(0.5); }
    100% { opacity: 1; transform: rotate(-45deg) scale(1); }
  }

  h1 {
    margin: 0 0 8px;
    font-size: 22px;
    letter-spacing: 0.04em;
  }
  p {
    margin: 0 0 6px;
    font-size: 15px;
    opacity: 0.95;
  }
  .small {
    font-size: 12px;
    opacity: 0.75;
  }

  @media (max-width: 480px) {
    .wrap {
      padding: 18px;
    }
    h1 {
      font-size: 20px;
    }
    p {
      font-size: 14px;
    }
    .check-container {
      width: 135px;
      height: 135px;
    }
  }
</style>
</head>
<body>
<div class="bg-pulse"></div>
<div class="wrap">
  <div class="check-container">
    <div class="check"></div>
  </div>
  <h1>อัปโหลดสำเร็จ ✔</h1>
  <p>กำลังพากลับไปที่ห้อง Discord ของคุณ...</p>
  <p class="small">หากไม่เปลี่ยนหน้าในไม่กี่วินาที สามารถปิดหน้านี้ได้เลย</p>
</div>
<script>
  setTimeout(function () {
    window.location.href = ${JSON.stringify(redirectUrl)};
  }, 1600);
</script>
</body>
</html>
`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(doneHtml);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("เกิดข้อผิดพลาดขณะอัปโหลด");
  }
});

app.listen(port, () => {
  console.log("🌐 Web server running on port", port);
});

module.exports = app;
