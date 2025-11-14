// firebase.js
// ✅ Firebase Admin setup (Node.js v22+ compatible)
// รองรับ .env, base64, หรือไฟล์ service.json

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- Helper: normalize private_key ---
function normalizeKey(obj) {
  if (obj && obj.private_key) obj.private_key = obj.private_key.replace(/\\n/g, '\n');
  return obj;
}

// --- โหลดจาก ENV ---
function fromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return normalizeKey(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch {
      throw new Error('❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    }
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      return normalizeKey(JSON.parse(json));
    } catch {
      throw new Error('❌ FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64 JSON');
    }
  }
  return null;
}

// --- โหลดจากไฟล์ ---
function fromFile() {
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const local = path.resolve(__dirname, 'service.json');
  const file = (gac && fs.existsSync(gac)) ? gac : (fs.existsSync(local) ? local : null);
  if (!file) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return normalizeKey(data);
}

// --- รวมและตรวจสอบ ---
function resolveServiceAccount() {
  const svc = fromEnv() || fromFile();
  if (!svc) {
    throw new Error('❌ Missing Firebase credentials: set FIREBASE_SERVICE_ACCOUNT / BASE64 or place service.json');
  }
  if (!svc.client_email || !svc.private_key) {
    throw new Error('❌ Service account missing client_email/private_key');
  }
  return svc;
}

const serviceAccount = resolveServiceAccount();

// --- Initialize Firebase (one time only) ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  console.log(`✅ Firebase Admin initialized for project: ${serviceAccount.project_id}`);
}

// --- Firestore instance ---
const db = admin.firestore();

// --- Utility: Retry handler ---
async function withRetry(fn, { retries = 3, baseMs = 300 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const transient = /deadline-exceeded|ETIMEDOUT|EAI_AGAIN|ECONNRESET|UNAVAILABLE/i.test(e?.message || '');
      if (!transient || i === retries) throw e;
      await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// --- Health Check ---
async function healthCheck() {
  const ref = db.collection('_smoke_tests').doc('bot');
  await withRetry(() => ref.set({ ts: Date.now(), ok: true }, { merge: true }));
  const snap = await withRetry(() => ref.get());
  return { ok: true, data: snap.data(), projectId: admin.app().options.projectId };
}

// --- Export สำหรับโมดูลอื่น ---
module.exports = { db, admin, withRetry, healthCheck };
