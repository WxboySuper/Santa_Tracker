'use strict';

const EVENT_LEDGER_COLLECTION = 'processedStripeWebhookEvents';
const EVENT_LEDGER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Returns true when the incoming event would move entitlement state backward. */
const isStaleStripeEvent = (existingData, event) => {
  const lastCreated = Number(existingData.lastStripeEventCreated) || 0;
  const eventCreated = Number(event.created) || 0;
  if (eventCreated < lastCreated) {
    return true;
  }

  return (
    eventCreated === lastCreated &&
    existingData.lastStripeEventType === 'customer.subscription.deleted' &&
    event.type !== 'customer.subscription.deleted'
  );
};

/** Builds the ledger entry that records how this event was processed. */
const buildEventLedgerEntry = ({ event, entitlementRef, stale, processedAt }) => ({
  eventType: event.type,
  eventCreated: Number(event.created) || 0,
  entitlementId: entitlementRef.id,
  outcome: stale ? 'stale' : 'applied',
  processedAt,
  expiresAt: new Date(processedAt.getTime() + EVENT_LEDGER_RETENTION_MS),
});

/** Executes the transactional deduplication and stale-event guard. */
const processEventInTransaction = async (transaction, { eventRef, entitlementRef, event, buildNextPayload }) => {
  const [eventSnapshot, entitlementSnapshot] = await Promise.all([
    transaction.get(eventRef),
    transaction.get(entitlementRef),
  ]);

  if (eventSnapshot.exists) {
    return { applied: false, reason: 'duplicate' };
  }

  const existingData = entitlementSnapshot.exists ? entitlementSnapshot.data() || {} : {};
  const stale = isStaleStripeEvent(existingData, event);
  const processedAt = new Date();
  transaction.set(eventRef, buildEventLedgerEntry({ event, entitlementRef, stale, processedAt }));

  if (stale) {
    return { applied: false, reason: 'stale' };
  }

  const nextPayload = {
    ...buildNextPayload(existingData),
    lastStripeEventId: event.id,
    lastStripeEventType: event.type,
    lastStripeEventCreated: Number(event.created) || 0,
  };
  transaction.set(entitlementRef, nextPayload, { merge: true });
  return { applied: true, reason: 'applied', nextPayload };
};

const WEBHOOK_MISSING_ERROR = 'A verified Stripe event and entitlement target are required.';

/** Returns true when any required webhook processing input is missing. */
const hasMissingInputs = ({ db, entitlementRef, event, buildNextPayload }) =>
  !db || !entitlementRef || !event?.id || !event?.type || typeof buildNextPayload !== 'function';

/** Applies one verified Stripe event exactly once without allowing older state to win. */
const applyEntitlementWebhookEvent = async ({ db, entitlementRef, event, buildNextPayload }) => {
  if (hasMissingInputs({ db, entitlementRef, event, buildNextPayload })) {
    throw new Error(WEBHOOK_MISSING_ERROR);
  }

  const eventRef = db.collection(EVENT_LEDGER_COLLECTION).doc(event.id);
  return db.runTransaction((transaction) =>
    processEventInTransaction(transaction, { eventRef, entitlementRef, event, buildNextPayload })
  );
};

module.exports = {
  applyEntitlementWebhookEvent,
  isStaleStripeEvent,
};
