'use strict';

const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const MAX_CLOUD_CYCLES = 100;
const MAX_PAYLOAD_BYTES = 750000;

const verifyUser = async (req) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const auth = getAdminAuth();
  if (!auth || !token) return null;
  try { return await auth.verifyIdToken(token); } catch { return null; }
};

const registerCloudCycleRoutes = (app, express) => {
  app.post('/api/cloud-cycles', express.json({ limit: '800kb' }), async (req, res) => {
    try {
      if (!hasFirebaseAdminConfig()) return res.status(503).json({ error: 'Cloud storage is unavailable.' });
      const user = await verifyUser(req);
      if (!user) return res.status(401).json({ error: 'Authentication required.' });
      const db = getAdminDb();
      const entitlement = await db.collection('userEntitlements').doc(user.uid).get();
      if (entitlement.data()?.premiumActive !== true) return res.status(403).json({ error: 'Premium cloud storage is required.' });
      const { id, userId, label, cycleDate, payloadJson, payloadBytes, metadata } = req.body || {};
      if (userId !== user.uid || typeof id !== 'string' || id.length > 128 || typeof label !== 'string' || !label || label.length > 200 || typeof cycleDate !== 'string' || cycleDate.length > 32 || typeof payloadJson !== 'string' || Buffer.byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES || payloadBytes !== Buffer.byteLength(payloadJson, 'utf8') || !metadata || typeof metadata !== 'object') {
        return res.status(400).json({ error: 'Invalid cloud cycle payload.' });
      }
      const cycleRef = db.collection('cloudCycles').doc(id);
      const payloadRef = cycleRef.collection('payload').doc('payload');
      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(cycleRef);
        if (!existing.exists) {
          const count = await transaction.get(db.collection('cloudCycles').where('userId', '==', user.uid));
          if (count.size >= MAX_CLOUD_CYCLES) throw Object.assign(new Error('CLOUD_QUOTA_EXCEEDED'), { code: 'CLOUD_QUOTA_EXCEEDED' });
        }
        transaction.set(cycleRef, { ...metadata, id, userId: user.uid, label, cycleDate, payloadBytes }, { merge: false });
        transaction.set(payloadRef, { payloadJson, payloadBytes }, { merge: false });
      });
      return res.status(200).json({ success: true, data: id });
    } catch (error) {
      if (error?.code === 'CLOUD_QUOTA_EXCEEDED' || error?.message === 'CLOUD_QUOTA_EXCEEDED') return res.status(409).json({ error: 'Cloud storage quota reached.' });
      console.error('[cloud-cycles] save:error', error);
      return res.status(500).json({ error: 'Unable to save cloud cycle.' });
    }
  });
};

module.exports = { MAX_CLOUD_CYCLES, registerCloudCycleRoutes };
