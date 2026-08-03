'use strict';

const Stripe = require('stripe');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');

const RECENT_AUTH_SECONDS = 5 * 60;
const DIRECT_USER_COLLECTIONS = ['userProfiles', 'userSettings', 'userEntitlements', 'userMetrics'];
const NESTED_USER_SUBCOLLECTIONS = ['workflowAwareness', 'customProducts'];

/** Derives a non-reversible document key for the durable deletion safety marker. */
const getDeletionTombstoneId = (uid) => crypto.createHash('sha256').update(uid).digest('hex');

/** True when account deletion is active or has completed for this Firebase UID. */
const isAccountDeletionBlocked = async (db, uid) => {
  if (!db || !uid) return false;
  const [requestSnapshot, tombstoneSnapshot] = await Promise.all([
    db.collection('accountDeletionRequests').doc(uid).get(),
    db.collection('accountDeletionTombstones').doc(getDeletionTombstoneId(uid)).get(),
  ]);
  return requestSnapshot.exists || tombstoneSnapshot.exists;
};

/** True when a Stripe customer ID belongs to an account with an active or completed deletion. */
const isStripeCustomerDeletionBlocked = async (db, customerId) => {
  if (!db || !customerId) return false;
  const [requestQuery, tombstoneQuery] = await Promise.all([
    db.collection('accountDeletionRequests').where('stripeCustomerId', '==', customerId).limit(1).get(),
    db.collection('accountDeletionTombstones').where('stripeCustomerIds', 'array-contains', customerId).limit(1).get(),
  ]);
  if (!requestQuery.empty || !tombstoneQuery.empty) return true;

  const singleQuery = await db.collection('accountDeletionTombstones').where('stripeCustomerId', '==', customerId).limit(1).get();
  return !singleQuery.empty;
};

const deletionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account deletion attempts. Please wait and try again.' },
});

/** Returns a Stripe client only when billing credentials are configured. */
const getStripeClient = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);

/** Extracts and verifies the caller's Firebase ID token. */
const verifyDeletionUser = async (req, res, adminAuth) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Sign in again before deleting your account.' });
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(token, true);
  } catch {
    res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again and retry.' });
    return null;
  }
};

/** True when the token proves a recent interactive authentication. */
const hasRecentAuthentication = (decodedToken, nowSeconds = Math.floor(Date.now() / 1000)) =>
  Number.isFinite(decodedToken?.auth_time) &&
  nowSeconds >= decodedToken.auth_time &&
  nowSeconds - decodedToken.auth_time <= RECENT_AUTH_SECONDS;

/** Deletes document references in Firestore-safe batches. */
const deleteDocumentRefs = async (db, refs) => {
  for (let offset = 0; offset < refs.length; offset += 450) {
    const batch = db.batch();
    refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

/** Queries all documents in named first-level subcollections of a parent document. */
const findNestedSubcollectionRefs = async (db, parentDocPath, subcollectionNames) => {
  const refs = [];
  for (const name of subcollectionNames) {
    const snapshot = await db.collection(`${parentDocPath}/${name}`).get();
    snapshot.docs.forEach((doc) => {
      refs.push(doc.ref);
    });
  }
  return refs;
};

/** Finds every document associated with the account across top-level and nested collections. */
const findAccountDocumentRefs = async (db, uid) => {
  const directRefs = DIRECT_USER_COLLECTIONS.map((name) => db.collection(name).doc(uid));
  const [cloudSnapshot, accountDedupeSnapshot, nestedSubcollectionRefs] = await Promise.all([
    db.collection('cloudCycles').where('userId', '==', uid).get(),
    db.collection('adminMetricDedupes').where('uid', '==', uid).get(),
    findNestedSubcollectionRefs(db, `users/${uid}`, NESTED_USER_SUBCOLLECTIONS),
  ]);
  const accountDedupeRefs = accountDedupeSnapshot.docs.map((document) => document.ref);

  return [...directRefs, ...cloudSnapshot.docs.map((document) => document.ref), ...accountDedupeRefs, ...nestedSubcollectionRefs];
};

/** Removes all Firestore records that can identify or contain content for this account. */
const deleteAccountFirestoreData = async (db, uid) => {
  const refs = await findAccountDocumentRefs(db, uid);
  await deleteDocumentRefs(db, refs);
};

/** Deletes the linked Stripe customer, which immediately ends its subscriptions. */
const deleteStripeCustomer = async ({ stripe, customerId }) => {
  if (!customerId) return;
  if (!stripe) {
    const error = new Error('Billing service is required to finish deleting this account.');
    error.code = 'billing-unavailable';
    throw error;
  }

  try {
    await stripe.customers.del(customerId);
  } catch (error) {
    if (error?.code !== 'resource_missing') throw error;
  }
};

/** Reads the currently linked Stripe customer from the entitlement document. */
const getLinkedStripeCustomerId = async (db, uid) => {
  const snapshot = await db.collection('userEntitlements').doc(uid).get();
  return snapshot.data()?.stripeCustomerId || null;
};

/** Constructs the stable retryable error used when billing linkage never settles. */
const createBillingLinkageRaceError = () => {
  const error = new Error('Billing linkage changed repeatedly during deletion.');
  error.code = 'billing-linkage-race';
  return error;
};

/** Recursively reconciles late customer-link changes with a strict retry bound. */
const deleteNextLinkedStripeCustomer = async ({ db, uid, stripe, deletedCustomerIds, attemptsRemaining }) => {
  const customerId = await getLinkedStripeCustomerId(db, uid);
  if (!customerId) return;
  if (deletedCustomerIds.has(customerId)) return;
  if (attemptsRemaining === 0) throw createBillingLinkageRaceError();

  await deleteStripeCustomer({ stripe, customerId });
  deletedCustomerIds.add(customerId);
  await deleteNextLinkedStripeCustomer({
    db,
    uid,
    stripe,
    deletedCustomerIds,
    attemptsRemaining: attemptsRemaining - 1,
  });
};

/** Re-reads billing linkage so a customer change during deletion is also terminated. */
const deleteLinkedStripeCustomers = ({ db, uid, stripe }) => {
  return deleteNextLinkedStripeCustomer({
    db,
    uid,
    stripe,
    deletedCustomerIds: new Set(),
    attemptsRemaining: 3,
  });
};

/** True when the Firebase identity for this uid has already been removed. */
const isIdentityGone = async (adminAuth, uid) =>
  adminAuth.getUser(uid).then(() => false).catch((e) => e?.code === 'auth/user-not-found');

/** Deletes the current linked Stripe customer if it differs from the known set. */
const reconcileCurrentCustomer = async ({ db, uid, stripe, seenCustomerIds }) => {
  const entitlement = await db.collection('userEntitlements').doc(uid).get();
  const customerId = entitlement.data()?.stripeCustomerId;
  if (customerId && !seenCustomerIds.has(customerId)) {
    seenCustomerIds.add(customerId);
    await deleteStripeCustomer({ stripe, customerId });
  }
};

/** Sweeps any late entitlement document that appeared during reconciliation. */
const sweepLateEntitlement = async (db, uid, seenCustomerIds) => {
  const lateRef = db.collection('userEntitlements').doc(uid);
  const lateSnapshot = await lateRef.get();
  if (!lateSnapshot.exists) return;
  const lateCustomerId = lateSnapshot.data()?.stripeCustomerId;
  if (lateCustomerId) seenCustomerIds.add(lateCustomerId);
  await lateRef.delete();
};

/** Reconciles billing linkage that changed during the Firestore data sweep. */
const reconcilePostSweepBilling = async ({ db, uid, stripe, tombstoneRef, stripeCustomerId }) => {
  const seenCustomerIds = new Set(stripeCustomerId ? [stripeCustomerId] : []);

  await reconcileCurrentCustomer({ db, uid, stripe, seenCustomerIds });
  await reconcileCurrentCustomer({ db, uid, stripe, seenCustomerIds });
  await sweepLateEntitlement(db, uid, seenCustomerIds);

  if (tombstoneRef && seenCustomerIds.size > 1) {
    await tombstoneRef.set({ stripeCustomerIds: [...seenCustomerIds] }, { merge: true });
  }
};

/** Writes the tombstone, removes the Firebase identity, and cleans up the request marker. */
const finalizeDeletion = async ({ uid, db, adminAuth, requestRef, tombstoneRef }) => {
  await tombstoneRef.set({ completedAt: new Date() }, { merge: true });

  try {
    await adminAuth.deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  await requestRef.delete();
};

/** Handles a deletion failure when the identity was already removed or the request marker is gone. */
const handleDeletionFailure = async ({ adminAuth, uid, requestRef, error }) => {
  if (await isIdentityGone(adminAuth, uid)) return;

  await requestRef.set({ status: 'failed', updatedAt: new Date() }, { merge: true });
  throw error;
};

/** Creates the request marker and hashed tombstone references for the deletion lifecycle. */
const initDeletionRefs = async (db, uid) => {
  const requestRef = db.collection('accountDeletionRequests').doc(uid);
  const tombstoneRef = db.collection('accountDeletionTombstones').doc(getDeletionTombstoneId(uid));

  const entitlementSnapshot = await db.collection('userEntitlements').doc(uid).get();
  const stripeCustomerId = entitlementSnapshot.data()?.stripeCustomerId || null;

  await requestRef.set({ status: 'in_progress', stripeCustomerId, updatedAt: new Date() }, { merge: true });
  return { requestRef, tombstoneRef, stripeCustomerId };
};

/** Runs the idempotent destructive sequence while preserving the auth identity until cleanup succeeds. */
const deleteAccount = async ({ uid, db, adminAuth, stripe }) => {
  const { requestRef, tombstoneRef, stripeCustomerId } = await initDeletionRefs(db, uid);

  try {
    await deleteLinkedStripeCustomers({ db, uid, stripe });
    await deleteAccountFirestoreData(db, uid);
    await reconcilePostSweepBilling({ db, uid, stripe, tombstoneRef, stripeCustomerId });
    await finalizeDeletion({ uid, db, adminAuth, requestRef, tombstoneRef });
  } catch (error) {
    await handleDeletionFailure({ adminAuth, uid, requestRef, error });
  }
};

/** Rejects account deletion before authentication when its dependencies are unavailable. */
const ensureAccountLifecycleAvailable = (res, adminAuth, db) => {
  if (hasFirebaseAdminConfig()) return true;
  if (adminAuth && db) return true;
  res.status(503).json({ error: 'Account management is unavailable on this deployment.' });
  return false;
};

/** Rejects any destructive request that does not carry the exact confirmation phrase. */
const ensureDeletionConfirmed = (req, res) => {
  if (req.body?.confirmation === 'DELETE') return true;
  res.status(400).json({ error: 'Type DELETE exactly to confirm account deletion.' });
  return false;
};

/** Verifies the caller and separately enforces the recent-authentication window. */
const verifyRecentDeletionUser = async ({ req, res, adminAuth, nowSeconds }) => {
  const decodedToken = await verifyDeletionUser(req, res, adminAuth);
  if (!decodedToken) return null;
  if (hasRecentAuthentication(decodedToken, nowSeconds)) return decodedToken;

  res.status(401).json({ code: 'reauthentication-required', error: 'Sign in again before deleting your account.' });
  return null;
};

/** Verifies all request preconditions and returns the authorized Firebase token. */
const authorizeDeleteAccountRequest = async ({ req, res, adminAuth, db, nowSeconds }) => {
  if (!ensureAccountLifecycleAvailable(res, adminAuth, db)) return null;
  if (!ensureDeletionConfirmed(req, res)) return null;
  return verifyRecentDeletionUser({ req, res, adminAuth, nowSeconds });
};

/** Maps a deletion exception to the intentionally small public error response. */
const getDeletionFailureResponse = (error) => {
  if (error?.code === 'billing-unavailable') {
    return {
      status: 503,
      message: 'Billing is temporarily unavailable. Your account was not deleted; please retry later.',
    };
  }
  return {
    status: 500,
    message: 'Account deletion could not be completed. Your sign-in remains available so you can retry.',
  };
};

/** Logs and maps an account deletion failure without leaking implementation details. */
const sendDeletionFailure = (res, error, uid) => {
  console.error('[account] deletion failed', {
    uid,
    error: error instanceof Error ? error.message : 'Unknown deletion failure',
  });
  const response = getDeletionFailureResponse(error);
  res.status(response.status).json({ error: response.message });
};

/** Creates the authenticated account deletion route handler. */
const createDeleteAccountHandler = ({
  adminAuth = getAdminAuth(),
  db = getAdminDb(),
  stripe = getStripeClient(),
  nowSeconds,
} = {}) => async (req, res) => {
  const decodedToken = await authorizeDeleteAccountRequest({ req, res, adminAuth, db, nowSeconds });
  if (!decodedToken) return;

  try {
    await deleteAccount({ uid: decodedToken.uid, db, adminAuth, stripe });
    res.status(204).end();
  } catch (error) {
    sendDeletionFailure(res, error, decodedToken.uid);
  }
};

/** Registers the destructive account lifecycle endpoint. */
const registerAccountLifecycleRoutes = (app, express) => {
  app.post(
    '/api/account/delete',
    deletionRateLimit,
    express.json({ limit: '1kb' }),
    createDeleteAccountHandler()
  );
};

module.exports = {
  createDeleteAccountHandler,
  deleteAccount,
  deleteAccountFirestoreData,
  deleteLinkedStripeCustomers,
  deleteStripeCustomer,
  getDeletionTombstoneId,
  hasRecentAuthentication,
  isAccountDeletionBlocked,
  isStripeCustomerDeletionBlocked,
  registerAccountLifecycleRoutes,
};
