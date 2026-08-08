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

const hasValidCycleIdentity = ({ userId, id, label }, uid) => userId === uid && typeof id === 'string' && id.length <= 128 && typeof label === 'string' && label.length > 0 && label.length <= 200;
const hasValidCyclePayload = ({ cycleDate, payloadJson, payloadBytes }) => {
  const bytes = typeof payloadJson === 'string' ? Buffer.byteLength(payloadJson, 'utf8') : -1;
  return typeof cycleDate === 'string' && cycleDate.length <= 32 && typeof payloadJson === 'string' && bytes <= MAX_PAYLOAD_BYTES && payloadBytes === bytes;
};
const hasValidMetadata = (metadata) => Boolean(metadata) && typeof metadata === 'object' && !Array.isArray(metadata);
const readCloudCycleRequest = (body, uid) => {
  const { id, userId, label, cycleDate, payloadJson, payloadBytes, metadata } = body || {};
  if (!hasValidCycleIdentity({ userId, id, label }, uid)) return null;
  if (!hasValidCyclePayload({ cycleDate, payloadJson, payloadBytes })) return null;
  if (!hasValidMetadata(metadata)) return null;
  return { id, label, cycleDate, payloadJson, payloadBytes, metadata };
};

const saveCloudCycle = async (db, uid, cycle) => {
  const cycleRef = db.collection('cloudCycles').doc(cycle.id);
  const payloadRef = cycleRef.collection('payload').doc('payload');
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(cycleRef);
    if (!existing.exists) {
      const count = await transaction.get(db.collection('cloudCycles').where('userId', '==', uid));
      if (count.size >= MAX_CLOUD_CYCLES) throw Object.assign(new Error('CLOUD_QUOTA_EXCEEDED'), { code: 'CLOUD_QUOTA_EXCEEDED' });
    }
    transaction.set(cycleRef, { ...cycle.metadata, id: cycle.id, userId: uid, label: cycle.label, cycleDate: cycle.cycleDate, payloadBytes: cycle.payloadBytes });
    transaction.set(payloadRef, { payloadJson: cycle.payloadJson, payloadBytes: cycle.payloadBytes });
  });
};

const handleCloudCycleSave = async (req, res) => {
  if (!hasFirebaseAdminConfig()) return res.status(503).json({ error: 'Cloud storage is unavailable.' });
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  const db = getAdminDb();
  const entitlement = await db.collection('userEntitlements').doc(user.uid).get();
  if (entitlement.data()?.premiumActive !== true) return res.status(403).json({ error: 'Premium cloud storage is required.' });
  const cycle = readCloudCycleRequest(req.body, user.uid);
  if (!cycle) return res.status(400).json({ error: 'Invalid cloud cycle payload.' });
  await saveCloudCycle(db, user.uid, cycle);
  return res.status(200).json({ success: true, data: cycle.id });
};

const registerCloudCycleRoutes = (app, express, rateLimit) => {
  const saveRateLimit = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.post('/api/cloud-cycles', saveRateLimit, express.json({ limit: '800kb' }), async (req, res) => {
    try {
      return await handleCloudCycleSave(req, res);
    } catch (error) {
      if (error?.code === 'CLOUD_QUOTA_EXCEEDED' || error?.message === 'CLOUD_QUOTA_EXCEEDED') return res.status(409).json({ error: 'Cloud storage quota reached.' });
      console.error('[cloud-cycles] save:error', error);
      return res.status(500).json({ error: 'Unable to save cloud cycle.' });
    }
  });
};

module.exports = { MAX_CLOUD_CYCLES, registerCloudCycleRoutes };
