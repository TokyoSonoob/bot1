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

// ===== หน้าอัปโหลด /p/:id =====
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
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>อัปโหลดรูปภาพ</title>
<style>
  * {
    box-sizing: border-box;
  }
  html, body {
    margin: 0;
    padding: 0;
  }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: stretch;
    justify-content: center;
    background: radial-gradient(circle at top, #3b0764 0, #020617 55%, #000 100%);
    color: #f9fafb;
    overflow: hidden;
    position: relative;
  }

  /* แสงฟุ้งด้านหลัง (blob) */
  .bg-blob {
    position: fixed;
    border-radius: 999px;
    filter: blur(40px);
    opacity: 0.7;
    pointer-events: none;
    z-index: 0;
  }
  .bg-blob.blob1 {
    width: 260px;
    height: 260px;
    background: #a855f7;
    top: -60px;
    left: -60px;
    animation: floatBlob1 14s ease-in-out infinite;
  }
  .bg-blob.blob2 {
    width: 320px;
    height: 320px;
    background: #ec4899;
    bottom: -80px;
    right: -80px;
    animation: floatBlob2 18s ease-in-out infinite;
  }
  .bg-blob.blob3 {
    width: 240px;
    height: 240px;
    background: #22c55e;
    bottom: 10%;
    left: 10%;
    opacity: 0.45;
    animation: floatBlob3 19s ease-in-out infinite;
  }

  @keyframes floatBlob1 {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(25px,30px) scale(1.1); }
  }
  @keyframes floatBlob2 {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(-30px,-20px) scale(1.08); }
  }
  @keyframes floatBlob3 {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(15px,-25px) scale(1.12); }
  }

  .outer {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .card {
    width: 100%;
    max-width: 420px;
    border-radius: 24px;
    padding: 22px 20px 26px;
    background: linear-gradient(145deg, rgba(15,23,42,0.95), rgba(17,24,39,0.88));
    box-shadow:
      0 0 35px rgba(168,85,247,0.55),
      0 0 90px rgba(15,23,42,0.9);
    border: 1px solid rgba(148,163,184,0.55);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    animation: cardPop 0.55s ease-out, cardFloat 4s ease-in-out infinite 0.55s;
    backdrop-filter: blur(18px);
  }

  @keyframes cardPop {
    0% { transform: translateY(18px) scale(0.96); opacity: 0; }
    70% { transform: translateY(-4px) scale(1.02); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }

  @keyframes cardFloat {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .card-icon {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 0, #f9a8ff, #a855f7, #4c1d95);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 18px rgba(236,72,153,0.85);
    position: relative;
    overflow: hidden;
  }
  .card-icon::after {
    content: "";
    position: absolute;
    inset: 35%;
    border-radius: inherit;
    border: 2px solid rgba(248,250,252,0.7);
    opacity: 0.7;
  }
  .card-icon-mark {
    width: 18px;
    height: 18px;
    border-radius: 7px;
    border: 2px solid rgba(248,250,252,0.86);
    transform: rotate(18deg);
    opacity: 0.9;
  }
  .card-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .card-title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .card-sub {
    font-size: 12px;
    opacity: 0.8;
  }

  .upload-zone {
    margin-top: 8px;
    border-radius: 20px;
    border: 1px dashed rgba(148,163,184,0.8);
    padding: 16px 14px 14px;
    background: radial-gradient(circle at top left, rgba(88,28,135,0.55), rgba(15,23,42,0.9));
    position: relative;
    overflow: hidden;
  }
  .upload-zone::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 10% 0, rgba(236,72,153,0.35), transparent 65%);
    opacity: 0.8;
  }
  .upload-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .upload-main-text {
    font-size: 14px;
    font-weight: 500;
  }
  .upload-sub-text {
    font-size: 11px;
    opacity: 0.75;
  }

  .hidden-input {
    display: none;
  }

  .upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 28px;
    border-radius: 999px;
    border: none;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    background: linear-gradient(135deg, #a855f7, #ec4899);
    color: #fff;
    box-shadow:
      0 0 22px rgba(236,72,153,0.8),
      0 0 44px rgba(168,85,247,0.65);
    animation: pulseBtn 2.2s ease-in-out infinite;
    transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
    width: 100%;
    max-width: 260px;
  }

  @keyframes pulseBtn {
    0%,100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }

  .upload-btn:active {
    transform: scale(0.96);
    filter: brightness(0.95);
    box-shadow:
      0 0 12px rgba(236,72,153,0.7),
      0 0 26px rgba(168,85,247,0.55);
  }

  .note {
    margin-top: 14px;
    font-size: 11px;
    opacity: 0.75;
    text-align: center;
  }

  .footer-text {
    margin-top: 18px;
    font-size: 10px;
    opacity: 0.5;
    text-align: center;
  }

  @media (min-width: 768px) {
    .card {
      padding: 26px 26px 30px;
    }
    .card-title {
      font-size: 20px;
    }
    .upload-main-text {
      font-size: 15px;
    }
    .upload-btn {
      font-size: 16px;
    }
    .note {
      font-size: 12px;
    }
  }
</style>
</head>
<body>
<div class="bg-blob blob1"></div>
<div class="bg-blob blob2"></div>
<div class="bg-blob blob3"></div>
<div class="outer">
  <div class="card">
    <div class="card-header">
      <div class="card-icon">
        <div class="card-icon-mark"></div>
      </div>
      <div class="card-title-wrap">
        <div class="card-title">อัปโหลดรูปภาพ</div>
        <div class="card-sub">รูปจะถูกส่งเข้า Discord ให้แบบถาวร</div>
      </div>
    </div>

    <div class="upload-zone">
      <div class="upload-inner">
        <div class="upload-main-text">เลือกไฟล์รูปจากเครื่องของคุณ</div>
        <div class="upload-sub-text">รองรับไฟล์ภาพ ไม่เกิน 8MB</div>

        <form id="uploadForm" method="post" enctype="multipart/form-data">
          <input id="fileInput" class="hidden-input" type="file" name="image" accept="image/*" required />
          <button type="button" id="uploadBtn" class="upload-btn">
            แตะเพื่อเลือกภาพ
          </button>
        </form>
      </div>
    </div>

    <div class="note">สำหรับทั้งคอมพิวเตอร์และมือถือ — แตะปุ่มด้านบนเพื่อเริ่มอัปโหลด</div>
    <div class="footer-text">ลิงก์อัปโหลดนี้ใช้ได้ชั่วคราวเท่านั้น</div>
  </div>
</div>

<script>
  const fileInput = document.getElementById("fileInput");
  const form = document.getElementById("uploadForm");
  const btn = document.getElementById("uploadBtn");

  btn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (!fileInput.files || !fileInput.files[0]) return;
    btn.disabled = true;
    btn.textContent = "กำลังอัปโหลด...";
    btn.style.animation = "none";
    form.submit();
  });
</script>
</body>
</html>
`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ===== หน้า post-upload /p/:id (success + redirect) =====
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
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>อัปโหลดสำเร็จ</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: radial-gradient(circle at top, #064e3b 0, #001b14 70%, #000 100%);
    color: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    position: relative;
    overflow: hidden;
  }

  .bg-ring {
    position: fixed;
    width: 420px;
    height: 420px;
    border-radius: 999px;
    border: 2px dashed rgba(34,197,94,0.28);
    top: -120px;
    right: -140px;
    transform-origin: center;
    animation: spinRing 18s linear infinite;
    pointer-events: none;
    opacity: 0.7;
  }
  @keyframes spinRing {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .wrap {
    text-align: center;
    padding: 22px;
    position: relative;
    z-index: 1;
  }
  .check-container {
    width: 130px;
    height: 130px;
    border-radius: 999px;
    border: 5px solid #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    box-shadow:
      0 0 40px rgba(34, 197, 94, 0.85),
      0 0 90px rgba(22, 163, 74, 0.75);
    animation: pop 0.4s ease-out forwards, float 3s ease-in-out infinite 0.4s;
    background: radial-gradient(circle at 30% 0, #bbf7d0, #22c55e 60%, #14532d);
  }
  @keyframes pop {
    0% { transform: scale(0.25); opacity: 0; }
    70% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes float {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  .check {
    width: 60px;
    height: 30px;
    border-left: 6px solid #f9fafb;
    border-bottom: 6px solid #f9fafb;
    transform: rotate(-45deg) translateY(-4px);
    opacity: 0;
    animation: draw 0.35s 0.25s ease-out forwards;
  }
  @keyframes draw {
    0% { opacity: 0; transform: rotate(-45deg) scale(0.4); }
    100% { opacity: 1; transform: rotate(-45deg) scale(1); }
  }

  h1 {
    font-size: 22px;
    margin-bottom: 8px;
  }
  p {
    font-size: 14px;
    opacity: 0.9;
    margin: 0;
  }

  .small-tip {
    margin-top: 10px;
    font-size: 11px;
    opacity: 0.65;
  }

  @media (min-width: 768px) {
    h1 { font-size: 24px; }
    p { font-size: 15px; }
  }
</style>
</head>
<body>
<div class="bg-ring"></div>
<div class="wrap">
  <div class="check-container">
    <div class="check"></div>
  </div>
  <h1>อัปโหลดสำเร็จ</h1>
  <p>กำลังพาคุณกลับไปที่ห้อง Discord...</p>
  <div class="small-tip">หากเบราว์เซอร์ไม่เปลี่ยนหน้าเอง สามารถกดปุ่มย้อนกลับแล้วดูที่ Discord ได้เลย</div>
</div>
<script>
  setTimeout(function () {
    window.location.href = ${JSON.stringify(redirectUrl)};
  }, 1500);
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
