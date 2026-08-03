'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyEntitlementWebhookEvent, isStaleStripeEvent } = require('./billing-webhook-state');

const createFakeDb = () => {
  const documents = new Map();
  let queue = Promise.resolve();
  let failNextCommit = false;
  const ref = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
  const snapshot = (documentRef) => ({
    exists: documents.has(documentRef.key),
    data: () => documents.get(documentRef.key) || {},
  });

  return {
    documents,
    failNextCommit: () => { failNextCommit = true; },
    collection: (collection) => ({ doc: (id) => ref(collection, id) }),
    runTransaction: (callback) => {
      const run = queue.then(async () => {
        const writes = [];
        const result = await callback({
          get: async (documentRef) => snapshot(documentRef),
          set: (documentRef, data, options) => writes.push({ documentRef, data, options }),
        });
        if (failNextCommit) {
          failNextCommit = false;
          throw new Error('simulated commit failure');
        }
        for (const write of writes) {
          const previous = write.options?.merge ? documents.get(write.documentRef.key) || {} : {};
          documents.set(write.documentRef.key, { ...previous, ...write.data });
        }
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
};

const applyStatus = (db, event, status) =>
  applyEntitlementWebhookEvent({
    db,
    entitlementRef: db.collection('userEntitlements').doc('user-1'),
    event,
    buildNextPayload: (existing) => ({ ...existing, billingStatus: status }),
  });

describe('applyEntitlementWebhookEvent', () => {
  it('commits concurrent duplicate deliveries only once', async () => {
    const db = createFakeDb();
    const event = { id: 'evt_once', type: 'customer.subscription.updated', created: 200 };
    const results = await Promise.all([applyStatus(db, event, 'active'), applyStatus(db, event, 'past_due')]);

    assert.deepEqual(results.map((result) => result.reason).sort(), ['applied', 'duplicate']);
    assert.equal(db.documents.get('userEntitlements/user-1').billingStatus, 'active');
    assert.equal(db.documents.get('processedStripeWebhookEvents/evt_once').outcome, 'applied');
  });

  it('records but does not apply an older delivery', async () => {
    const db = createFakeDb();
    await applyStatus(db, { id: 'evt_new', type: 'customer.subscription.deleted', created: 300 }, 'canceled');
    const result = await applyStatus(db, { id: 'evt_old', type: 'customer.subscription.updated', created: 250 }, 'active');

    assert.equal(result.reason, 'stale');
    assert.equal(db.documents.get('userEntitlements/user-1').billingStatus, 'canceled');
    assert.equal(db.documents.get('processedStripeWebhookEvents/evt_old').outcome, 'stale');
  });

  it('keeps a terminal subscription event when timestamps tie', () => {
    assert.equal(
      isStaleStripeEvent(
        { lastStripeEventCreated: 400, lastStripeEventType: 'customer.subscription.deleted' },
        { type: 'customer.subscription.updated', created: 400 }
      ),
      true
    );
  });

  it('retries cleanly after a transaction commit failure', async () => {
    const db = createFakeDb();
    const event = { id: 'evt_retry', type: 'customer.subscription.updated', created: 500 };
    db.failNextCommit();

    await assert.rejects(applyStatus(db, event, 'active'), /simulated commit failure/);
    const retry = await applyStatus(db, event, 'active');

    assert.equal(retry.applied, true);
    assert.equal(db.documents.get('userEntitlements/user-1').billingStatus, 'active');
  });
});
