'use strict';

const Stripe = require('stripe');
const rateLimit = require('express-rate-limit');
const { getSubscriptionPeriodEndUnix } = require('./billing-stripe-period');
const { applyEntitlementWebhookEvent } = require('./billing-webhook-state');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');
const { getBaseUrl, getBillingRuntimeConfig, getPublicBillingConfig } = require('./billing-config');
const { recordBillingMetricEvent } = require('./metrics');
const { deleteStripeCustomer, isAccountDeletionBlocked, isStripeCustomerDeletionBlocked } = require('./account-lifecycle');
const { getStripeObjectId, refundDeletedAccountInvoice } = require('./billing-cleanup');

let stripeClient = null;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
/** Creates a standard billing rate-limit middleware with the given request cap. */
const createBillingRateLimitMiddleware = (max) =>
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many billing requests right now. Please wait a moment and try again.' },
  });

const checkoutRateLimit = createBillingRateLimitMiddleware(5);
const portalRateLimit = createBillingRateLimitMiddleware(10);
const webhookRateLimit = createBillingRateLimitMiddleware(100);

/** Returns the Stripe SDK client when the current deployment is configured for billing. */
const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

/** Redacts identifiers in logs so server output stays useful without exposing full values. */
const redactIdentifier = (value) => {
  if (typeof value !== 'string' || value.length <= 4) {
    return value || null;
  }

  return `...${value.slice(-4)}`;
};

/** Returns a Stripe-compatible customer email only when the decoded token actually includes one. */
const getCheckoutCustomerEmail = (decodedToken) =>
  typeof decodedToken.email === 'string' && decodedToken.email.trim() ? decodedToken.email : undefined;

/** True when the user should retain premium access from Stripe state alone. */
const isStripePremiumStatus = (billingStatus) => billingStatus === 'active' || billingStatus === 'trialing';

/** Builds the effective entitlement fields while preserving beta-override access. */
const computeEffectiveEntitlement = (payload) => {
  const betaOverrideActive = Boolean(payload.betaOverrideActive);
  const stripePremiumActive = isStripePremiumStatus(payload.billingStatus);
  const premiumActive = betaOverrideActive || stripePremiumActive;

  return {
    ...payload,
    premiumActive,
    effectiveSource: betaOverrideActive ? 'beta_override' : stripePremiumActive ? 'stripe' : 'none',
  };
};

/** Builds the baseline entitlement payload before incoming webhook fields are merged in. */
const createBaseEntitlementPayload = (uid, existingData) => ({
  uid: uid || existingData.uid || '',
  planInterval: null,
  billingStatus: 'inactive',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  betaOverrideActive: Boolean(existingData.betaOverrideActive),
  ...existingData,
  updatedAt: new Date(),
});

/** Logs the skipped write case where no Firestore document target could be resolved. */
const logSkippedEntitlementWrite = ({ uid, stripeCustomerId, stripeSubscriptionId }) => {
  console.warn('[billing] writeEntitlement:skipped-no-doc-ref', {
    uid,
    stripeCustomerId: redactIdentifier(stripeCustomerId),
    stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
  });
};

/** Fetches one entitlement document by UID. */
const getEntitlementDocByUid = (uid) => {
  const db = getAdminDb();
  if (!db) {
    return null;
  }

  return db.collection('userEntitlements').doc(uid).get();
};

/** Finds an entitlement document using Stripe identifiers when the webhook payload lacks a UID. */
const findEntitlementDocByField = async (field, value) => {
  const db = getAdminDb();
  if (!db || !value) {
    return null;
  }

  const query = await db.collection('userEntitlements').where(field, '==', value).limit(1).get();
  return query.empty ? null : query.docs[0];
};

/** Finds an entitlement document using Stripe identifiers when the webhook payload lacks a UID. */
const findEntitlementDocByStripeIdentifiers = async ({ stripeCustomerId, stripeSubscriptionId }) => {
  return (
    await findEntitlementDocByField('stripeSubscriptionId', stripeSubscriptionId)
  ) || findEntitlementDocByField('stripeCustomerId', stripeCustomerId);
};

/** Reads the existing entitlement document so webhook updates preserve beta overrides. */
const createNewEntitlementTarget = (uid) => {
  const db = getAdminDb();
  if (!db || !uid) {
    return null;
  }

  return {
    ref: db.collection('userEntitlements').doc(uid),
    data: {},
  };
};

/** Prevents delayed Stripe events from recreating state for a deleted Firebase identity. */
const canWriteEntitlementForUid = async (
  uid,
  { adminAuth = getAdminAuth(), db = getAdminDb() } = {}
) => {
  if (!uid) return true;
  if (await isAccountDeletionBlocked(db, uid)) return false;
  if (!adminAuth) return true;
  try {
    await adminAuth.getUser(uid);
    return true;
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return false;
    throw error;
  }
};

/** Reads the existing entitlement document so webhook updates preserve beta overrides. */
const getExistingEntitlementData = async (uid, stripeIds = {}) => {
  const directDoc = uid ? await getEntitlementDocByUid(uid) : null;
  if (directDoc?.exists) {
    return { ref: directDoc.ref, data: directDoc.data() || {} };
  }

  const stripeDoc = await findEntitlementDocByStripeIdentifiers(stripeIds);
  if (stripeDoc) {
    return { ref: stripeDoc.ref, data: stripeDoc.data() || {} };
  }

  return createNewEntitlementTarget(uid);
};

/** Writes the merged entitlement payload into Firestore once for the verified webhook event. */
const writeEntitlement = async ({ uid, stripeCustomerId, stripeSubscriptionId, payload }, event) => {
  console.log('[billing] writeEntitlement:start', {
    uid,
    stripeCustomerId: redactIdentifier(stripeCustomerId),
    stripeSubscriptionId: redactIdentifier(stripeSubscriptionId),
    billingStatus: payload?.billingStatus,
    planInterval: payload?.planInterval,
  });

  const existing = await getExistingEntitlementData(uid, { stripeCustomerId, stripeSubscriptionId });
  if (!existing) {
    logSkippedEntitlementWrite({ uid, stripeCustomerId, stripeSubscriptionId });
    return { applied: false, reason: 'missing-target' };
  }

  const targetUid = uid || existing.data.uid;
  if (!(await canWriteEntitlementForUid(targetUid))) {
    console.warn('[billing] writeEntitlement:skipped-deleted-user', { uid: targetUid });
    return { applied: false, reason: 'deleted-user' };
  }

  const result = await applyEntitlementWebhookEvent({
    db: getAdminDb(),
    entitlementRef: existing.ref,
    event,
    buildNextPayload: (currentData) =>
      computeEffectiveEntitlement({
        ...createBaseEntitlementPayload(uid, currentData),
        ...payload,
      }),
  });

  if (!result.applied) {
    console.log('[billing] writeEntitlement:skipped', { eventId: event.id, reason: result.reason });
    return result;
  }

  console.log('[billing] writeEntitlement:success', {
    uid: result.nextPayload.uid,
    premiumActive: result.nextPayload.premiumActive,
    effectiveSource: result.nextPayload.effectiveSource,
    billingStatus: result.nextPayload.billingStatus,
  });
  return result;
};

/** Extracts a verified Firebase user from the Authorization header. */
const verifyRequestUser = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const adminAuth = getAdminAuth();

  if (!adminAuth || !hasFirebaseAdminConfig()) {
    res.status(503).json({ error: 'Firebase Admin is not configured on this deployment.' });
    return null;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing Firebase ID token.' });
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid Firebase ID token.' });
    return null;
  }
};

/** Creates the plan-specific Stripe checkout session for the verified user. */
const isCheckoutAvailable = (stripe, billingConfig) => Boolean(stripe && billingConfig.checkoutEnabled);

/** Checks whether the Stripe customer portal is configured for this site. */
const isPortalAvailable = (stripe, billingConfig) => Boolean(stripe && billingConfig.hasBaseUrl);

/** Resolves the Stripe price id for the selected billing plan. */
const getCheckoutPriceId = (plan, billingConfig) => {
  if (plan === 'monthly') {
    return billingConfig.monthlyPriceId;
  }

  if (plan === 'annual') {
    return billingConfig.annualPriceId;
  }

  return '';
};

/** Builds the checkout metadata shared between the session and subscription objects. */
const createCheckoutMetadata = (uid, plan) => ({ uid, plan });

/** Creates the plan-specific Stripe checkout session for the verified user. */
const handleCheckout = async (req, res) => {
  const billingConfig = getBillingRuntimeConfig();
  const stripe = getStripeClient();
  if (!isCheckoutAvailable(stripe, billingConfig)) {
    res.status(503).json({ error: 'Billing is not available on this deployment yet.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req, res);
  if (!decodedToken) {
    return;
  }

  if (await isAccountDeletionBlocked(getAdminDb(), decodedToken.uid)) {
    res.status(409).json({ error: 'Account deletion is already in progress or complete.' });
    return;
  }

  const plan = req.body?.plan;
  const priceId = getCheckoutPriceId(plan, billingConfig);
  if (!priceId) {
    res.status(400).json({ error: 'Invalid billing plan selected.' });
    return;
  }

  const baseUrl = getBaseUrl();
  const metadata = createCheckoutMetadata(decodedToken.uid, plan);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/account?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    ...(getCheckoutCustomerEmail(decodedToken) ? { customer_email: getCheckoutCustomerEmail(decodedToken) } : {}),
    metadata,
    subscription_data: {
      metadata,
    },
  });

  res.json({ url: session.url });
};

/** Opens the Stripe billing portal for a user who already has a customer record. */
const handleBillingPortal = async (req, res) => {
  const billingConfig = getBillingRuntimeConfig();
  const stripe = getStripeClient();
  if (!isPortalAvailable(stripe, billingConfig)) {
    res.status(503).json({ error: 'Billing is not available on this deployment yet.' });
    return;
  }

  const decodedToken = await verifyRequestUser(req, res);
  if (!decodedToken) {
    return;
  }

  const entitlementDoc = await getEntitlementDocByUid(decodedToken.uid);
  const entitlementData = entitlementDoc?.data() || {};
  if (!entitlementData.stripeCustomerId) {
    res.status(400).json({ error: 'No Stripe customer is attached to this account yet.' });
    return;
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: entitlementData.stripeCustomerId,
    return_url: `${getBaseUrl()}/account`,
  });

  res.json({ url: portal.url });
};

/** Maps Stripe recurring intervals into the entitlement interval shape. */
const getPlanInterval = (interval) => (interval === 'year' ? 'annual' : 'monthly');

/** Normalizes a Stripe API customer id into a nullable string. */
const getStripeCustomerId = (value) => (typeof value === 'string' ? value : null);

/** Normalizes a Stripe API subscription id into a nullable string. */
const getStripeSubscriptionId = (value) => (typeof value === 'string' ? value : null);

/** Converts Stripe unix timestamps into nullable JS dates. */
const getStripeDate = (value) => (value ? new Date(value * 1000) : null);

/** Builds the entitlement payload for a checkout completion event. */
const createCheckoutEntitlementWrite = (session) => {
  const uid = session.metadata?.uid || '';
  const stripeCustomerId = getStripeCustomerId(session.customer);
  const stripeSubscriptionId = getStripeSubscriptionId(session.subscription);

  return {
    uid,
    stripeCustomerId,
    stripeSubscriptionId,
    payload: {
      uid,
      planInterval: session.metadata?.plan === 'annual' ? 'annual' : 'monthly',
      billingStatus: 'active',
      stripeCustomerId,
      stripeSubscriptionId,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
  };
};

/** Builds the entitlement payload for subscription lifecycle updates. */
const getSubscriptionUid = (subscription) => subscription.metadata?.uid || '';

/** Builds the nested payload for a subscription webhook entitlement update. */
const createSubscriptionEntitlementPayload = (subscription, uid, stripeCustomerId) => ({
  uid,
  planInterval: getPlanInterval(subscription.items?.data?.[0]?.price?.recurring?.interval),
  billingStatus: subscription.status || 'inactive',
  stripeCustomerId,
  stripeSubscriptionId: subscription.id,
  cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  currentPeriodEnd: getStripeDate(getSubscriptionPeriodEndUnix(subscription)),
});

/** Builds the entitlement payload for subscription lifecycle updates. */
const createSubscriptionEntitlementWrite = (subscription) => {
  const uid = getSubscriptionUid(subscription);
  const stripeCustomerId = getStripeCustomerId(subscription.customer);

  return {
    uid,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    payload: createSubscriptionEntitlementPayload(subscription, uid, stripeCustomerId),
  };
};

/** Returns the first usable Stripe ID from a list of expanded objects or plain IDs. */
const getFirstStripeObjectId = (values) => values.map(getStripeObjectId).find(Boolean) || '';

/** Finds the payment intent across Checkout and legacy/current invoice shapes. */
const getCheckoutPaymentIntentId = (session, invoice, payments) =>
  getFirstStripeObjectId([
    session.payment_intent,
    invoice?.payment_intent,
    ...payments.map((payment) => payment?.payment?.payment_intent),
  ]);

/** Finds a charge-only payment across current and legacy invoice shapes. */
const getCheckoutChargeId = (invoice, payments) =>
  getFirstStripeObjectId([
    ...payments.map((payment) => payment?.payment?.charge),
    invoice?.charge,
  ]);

/** Finds the initial Checkout payment across Stripe's legacy and current invoice shapes. */
const getCheckoutRefundTarget = (session, subscription) => {
  const invoice = subscription?.latest_invoice;
  const payments = invoice?.payments?.data || [];
  const paymentIntent = getCheckoutPaymentIntentId(session, invoice, payments);
  if (paymentIntent) return { payment_intent: paymentIntent };

  const charge = getCheckoutChargeId(invoice, payments);
  return charge ? { charge } : null;
};

/** Returns the UID only when this Checkout belongs to an account blocked from writes. */
const getBlockedCheckoutUid = async (session, canWrite) => {
  const uid = session.client_reference_id || session.metadata?.uid || '';
  if (!uid) return null;
  return (await canWrite(uid)) ? null : uid;
};

/** Retrieves the expanded first invoice for a subscription-mode Checkout session. */
const getCheckoutSubscription = async (stripe, session) => {
  const subscriptionId = getStripeObjectId(session.subscription);
  if (!subscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  } catch (error) {
    if (error?.code === 'resource_missing') return null;
    throw error;
  }
};

/** Resolves a refundable payment using both legacy invoice fields and the current payments API. */
const resolveCheckoutRefundTarget = async (stripe, session, subscription) => {
  const embeddedTarget = getCheckoutRefundTarget(session, subscription);
  if (embeddedTarget) return embeddedTarget;

  const invoiceId = getStripeObjectId(subscription?.latest_invoice);
  if (!invoiceId || !stripe.invoicePayments?.list) return null;
  const invoicePayments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  return getCheckoutRefundTarget(session, {
    latest_invoice: { payments: { data: invoicePayments.data || [] } },
  });
};

/** Prevents a paid late Checkout from being cleaned up without its required refund. */
const ensurePaidCheckoutHasRefundTarget = (session, refundTarget) => {
  if (session.payment_status !== 'paid' || refundTarget) return;
  throw new Error(`Unable to identify payment for deleted-account Checkout session ${session.id}.`);
};

/** Creates the refund only when Checkout actually produced a refundable payment. */
const refundBlockedCheckout = async (stripe, session, refundTarget) => {
  if (!refundTarget) return;
  await stripe.refunds.create(refundTarget, {
    idempotencyKey: `account-deletion-checkout-refund:${session.id}`,
  });
};

/**
 * Refunds a Checkout payment that completed after account deletion, then removes
 * the newly created Stripe customer. Throwing keeps the webhook retryable.
 */
const cleanupBlockedCheckoutSession = async (
  session,
  { stripe = getStripeClient(), canWrite = canWriteEntitlementForUid } = {}
) => {
  const uid = await getBlockedCheckoutUid(session, canWrite);
  if (!uid) return false;
  if (!stripe) throw new Error('Stripe is not configured for late Checkout cleanup.');

  if (session.payment_status === 'unpaid') return false;

  const subscription = await getCheckoutSubscription(stripe, session);
  const refundTarget = await resolveCheckoutRefundTarget(stripe, session, subscription);
  ensurePaidCheckoutHasRefundTarget(session, refundTarget);
  await refundBlockedCheckout(stripe, session, refundTarget);

  await deleteStripeCustomer({ stripe, customerId: getStripeObjectId(session.customer) });
  console.warn('[billing] checkout:refunded-deleted-user', {
    uid,
    sessionId: redactIdentifier(session.id),
  });
  return true;
};

/** Records billing metric events with safe error handling. */
const recordBillingMetricEventSafely = async (eventType) => {
  try {
    await recordBillingMetricEvent(eventType);
  } catch (error) {
    console.warn('[billing] metrics:nonfatal', {
      eventType,
      error: error instanceof Error ? error.message : 'Unknown billing metrics failure',
    });
  }
};

/** Resolves a subscription id or expanded object from a supported webhook payload. */
const getInvoiceSubscription = (invoice) =>
  invoice.subscription || invoice.parent?.subscription_details?.subscription || null;

/** Resolves a subscription id or expanded object from a supported webhook payload. */
const getWebhookSubscription = (event) => {
  const object = event.data.object;
  if (event.type.startsWith('customer.subscription.')) {
    return object;
  }
  if (event.type === 'checkout.session.completed') {
    return object.subscription || null;
  }
  return getInvoiceSubscription(object);
};

/** Retrieves current Stripe lifecycle state for convenience events such as invoices. */
const resolveAuthoritativeSubscription = async (stripe, event) => {
  const subscription = getWebhookSubscription(event);
  if (!subscription) {
    return null;
  }
  if (typeof subscription === 'object') {
    return subscription;
  }
  return stripe.subscriptions.retrieve(subscription);
};

/** Preserves the checkout UID if Stripe has not copied metadata onto the subscription yet. */
const withFallbackSubscriptionUid = (subscription, fallbackUid) => ({
  ...subscription,
  metadata: {
    ...(subscription.metadata || {}),
    ...(subscription.metadata?.uid || !fallbackUid ? {} : { uid: fallbackUid }),
  },
});

/** Builds the entitlement write from the checkout session's subscription or session data. */
const buildCheckoutEntitlementWrite = async (stripe, event, session) => {
  const subscription = await resolveAuthoritativeSubscription(stripe, event);
  return subscription
    ? createSubscriptionEntitlementWrite(withFallbackSubscriptionUid(subscription, session.metadata?.uid))
    : createCheckoutEntitlementWrite(session);
};

/** Applies checkout completion using current subscription state when available. */
const handleCheckoutSessionCompleted = async (event, stripe) => {
  const session = event.data.object;
  const cleanupDeps = { stripe: stripe || getStripeClient(), canWrite: canWriteEntitlementForUid, redactIdentifier };
  if (await cleanupBlockedCheckoutSession(session, cleanupDeps)) return;
  const entitlementWrite = await buildCheckoutEntitlementWrite(stripe, event, session);
  const result = await writeEntitlement(entitlementWrite, event);
  if (!result?.applied && await cleanupBlockedCheckoutSession(session, cleanupDeps)) return;
  if (result?.applied) await recordBillingMetricEventSafely('premium_upgrade');
};

/** Applies the subscription lifecycle event to the entitlement document. */
const handleSubscriptionEvent = async (event) => {
  const result = await writeEntitlement(createSubscriptionEntitlementWrite(event.data.object), event);
  if (!result?.applied) {
    console.warn('[billing] subscription-event:skipped-deleted-user', {
      subscriptionId: redactIdentifier(event.data.object.id),
      eventType: event.type,
    });
  }
  if (event.type === 'customer.subscription.deleted') {
    await recordBillingMetricEventSafely('premium_cancellation');
  }
};

/** Returns the UID from the subscription or invoice metadata. */
const resolveInvoiceUid = (subscription, invoice) =>
  getSubscriptionUid(subscription) ||
  invoice.parent?.subscription_details?.metadata?.uid ||
  invoice.subscription_details?.metadata?.uid ||
  '';

/** Checks whether an invoice belongs to a deleted account. */
const isInvoiceForDeletedAccount = async (subscription, invoice, customerId) => {
  const uid = resolveInvoiceUid(subscription, invoice);
  return uid
    ? isAccountDeletionBlocked(getAdminDb(), uid)
    : isStripeCustomerDeletionBlocked(getAdminDb(), customerId);
};

/** Applies invoice notifications from the current authoritative subscription state. */
const handleInvoiceEvent = async (event, stripe) => {
  const subscription = await resolveAuthoritativeSubscription(stripe, event);
  if (!subscription) {
    console.warn('[billing] invoice:skipped-no-subscription', { eventId: event.id, eventType: event.type });
    return;
  }
  const result = await writeEntitlement(createSubscriptionEntitlementWrite(subscription), event);
  const invoice = event.data.object;
  const invoiceStripe = stripe || getStripeClient();
  const invoiceCustomerId = getStripeObjectId(invoice.customer);
  const shouldRefund = result?.reason === 'deleted-user' ||
    (result?.reason === 'missing-target' && await isInvoiceForDeletedAccount(subscription, invoice, invoiceCustomerId));
  if (shouldRefund) {
    await refundDeletedAccountInvoice(invoice, { stripe: invoiceStripe, customerId: invoiceCustomerId });
  }
};

const webhookHandlers = {
  'checkout.session.completed': handleCheckoutSessionCompleted,
  'customer.subscription.updated': handleSubscriptionEvent,
  'customer.subscription.deleted': handleSubscriptionEvent,
  'invoice.paid': handleInvoiceEvent,
  'invoice.payment_failed': handleInvoiceEvent,
};

/** Returns the event handler for a Stripe webhook type, if the app cares about it. */
const getWebhookHandler = (eventType) => webhookHandlers[eventType] || null;

/** Handles checkout completion and subscription lifecycle events from Stripe. */
const handleWebhookEvent = async (event, stripe) => {
  console.log('[billing] webhook:event', event.type);

  const handler = getWebhookHandler(event.type);
  if (!handler) {
    console.log('[billing] webhook:ignored', event.type);
    return;
  }

  await handler(event, stripe);
};

/** Writes the public billing config response used by the client. */
const handleBillingConfig = (_req, res) => {
  const publicConfig = getPublicBillingConfig();
  res.json({
    billingEnabled: publicConfig.billingEnabled,
    checkoutEnabled: publicConfig.checkoutEnabled,
    annualPromoActive: publicConfig.annualPromoActive,
    monthlyDisplayPrice: publicConfig.monthlyDisplayPrice,
    annualDisplayPrice: publicConfig.annualDisplayPrice,
  });
};

/** Handles webhook requests once Stripe availability has been confirmed. */
const processWebhookRequest = async (req, res, stripe, webhookSecret) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    await handleWebhookEvent(event, stripe);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[billing] webhook:error', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook payload.' });
  }
};

/** Rejects webhook requests when Stripe is not fully configured. */
const handleBillingWebhook = async (req, res) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    res.status(503).json({ error: 'Stripe webhooks are not configured on this deployment.' });
    return;
  }

  await processWebhookRequest(req, res, stripe, webhookSecret);
};

/** Generic wrapper for billing JSON routes with shared error handling. */
const wrapBillingJsonRoute = ({ handler, fallbackMessage }) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : fallbackMessage });
  }
};

/** Registers the billing endpoints on the existing hosted-service Express app. */
const registerBillingRoutes = (app, express) => {
  app.get('/api/billing/config', handleBillingConfig);
  app.post(
    '/api/billing/webhook',
    webhookRateLimit,
    express.raw({ type: 'application/json' }),
    handleBillingWebhook
  );
  app.post(
    '/api/billing/checkout',
    checkoutRateLimit,
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute({
      handler: handleCheckout,
      fallbackMessage: 'Unable to create checkout session.',
    })
  );
  app.post(
    '/api/billing/portal',
    portalRateLimit,
    express.json({ limit: '8kb' }),
    wrapBillingJsonRoute({
      handler: handleBillingPortal,
      fallbackMessage: 'Unable to open the billing portal.',
    })
  );
};

module.exports = {
  canWriteEntitlementForUid,
  cleanupBlockedCheckoutSession,
  getCheckoutRefundTarget,
  registerBillingRoutes,
  __testing: {
    handleWebhookEvent,
    resolveAuthoritativeSubscription,
  },
};
