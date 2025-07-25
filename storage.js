const { db, admin } = require('./firebase');

// ✅ บันทึกข้อมูลการประมูล
async function saveAuctionData(channelId, data) {
  const ref = db.collection('auctions').doc(channelId);
  const doc = await ref.get();

  const updates = {};

  if (data.textEntries && data.textEntries.length > 0) {
    updates.textEntries = admin.firestore.FieldValue.arrayUnion(...data.textEntries);
  }

  if (data.imageUrls && data.imageUrls.length > 0) {
    updates.imageUrls = admin.firestore.FieldValue.arrayUnion(...data.imageUrls);
  }

  if (data.summary) {
    updates.summary = data.summary;
  }

  if (doc.exists) {
    await ref.update(updates);
  } else {
    await ref.set({
      textEntries: data.textEntries || [],
      imageUrls: data.imageUrls || [],
      summary: data.summary || ''
    });
  }
}

// ✅ ดึงข้อมูล
async function getAuctionData(channelId) {
  const doc = await db.collection('auctions').doc(channelId).get();
  return doc.exists ? doc.data() : null;
}

// ✅ ลบข้อมูลทั้งหมดที่เกี่ยวข้องกับห้อง (auctions + auctions_meta)
async function deleteAuctionData(channelId) {
  const collectionsToDelete = ['auctions', 'auctions_meta'];

  for (const col of collectionsToDelete) {
    try {
      await db.collection(col).doc(channelId).delete();
      console.log(`🗑️ ลบข้อมูลใน "${col}" สำหรับห้อง ${channelId} แล้ว`);
    } catch (err) {
      console.warn(`⚠️ ลบข้อมูลใน "${col}" ล้มเหลว (${channelId}):`, err.message);
    }
  }
}

// ✅ ดึงราคาประมูลล่าสุด
async function getLastBid(channelId) {
  const doc = await db.collection('auctions_meta').doc(channelId).get();
  return doc.exists ? (doc.data().lastBid || 0) : 0;
}

// ✅ บันทึกราคาประมูลล่าสุด
async function setLastBid(channelId, price) {
  await db.collection('auctions_meta').doc(channelId).set(
    { lastBid: price },
    { merge: true }
  );
}

// ✅ บันทึกชื่อ baseName ของห้อง (ครั้งที่-xxx)
async function setBaseName(channelId, baseName) {
  await db.collection('auctions_meta').doc(channelId).set(
    { baseName },
    { merge: true }
  );
}

// ✅ ดึง baseName
async function getBaseName(channelId) {
  const doc = await db.collection('auctions_meta').doc(channelId).get();
  return doc.exists ? doc.data().baseName : null;
}

module.exports = {
  saveAuctionData,
  getAuctionData,
  deleteAuctionData,
  getLastBid,
  setLastBid,
  setBaseName,
  getBaseName
};
