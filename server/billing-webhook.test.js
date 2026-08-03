'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const billingPath = require.resolve('./billing');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const originalMetrics = require.cache[metricsPath];
const documents = new Map();
let queue = Promise.resolve();

const createRef = (collection, id) => ({
  collection,
  id,
  key: `${collection}/${id}`,
  get: async function get() { return getSnapshot(this); },
});
const getSnapshot = (ref) => ({
  exists: documents.has(ref.key),
  ref,
  data: () => documents.get(ref.key) || {},
});
const db = {
  collection: (collection) => ({
    doc: (id) => createRef(collection, id),
    where: (field, _operator, value) => ({
      limit: () => ({
        get: async () => {
          const match = [...documents.entries()].find(
            ([key, data]) => key.startsWith(`${collection}/`) && data[field] === value
          );
          if (!match) return { empty: true, docs: [] };
          const id = match[0].slice(collection.length + 1);
          return { empty: false, docs: [getSnapshot(createRef(collection, id))] };
        },
      }),
    }),
  }),
  runTransaction: (callback) => {
    const run = queue.then(async () => {
      const writes = [];
      const result = await callback({
        get: async (ref) => getSnapshot(ref),
        set: (ref, data, options) => writes.push({ ref, data, options }),
      });
      for (const write of writes) {
        const previous = write.options?.merge ? documents.get(write.ref.key) || {} : {};
        documents.set(write.ref.key, { ...previous, ...write.data });
      }
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  },
};

require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: { getAdminDb: () => db, getAdminAuth: () => null, hasFirebaseAdminConfig: () => true },
};
require.cache[metricsPath] = {
  id: metricsPath,
  filename: metricsPath,
  loaded: true,
  exports: { recordBillingMetricEvent: async () => true },
};
delete require.cache[billingPath];
const { __testing } = require('./billing');

const subscription = (status, overrides = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status,
  cancel_at_period_end: status === 'canceled',
  current_period_end: 2_000_000_000,
  metadata: { uid: 'user-1' },
  items: { data: [{ price: { recurring: { interval: 'month' } } }] },
  ...overrides,
});

beforeEach(() => {
  documents.clear();
  documents.set('userEntitlements/user-1', { uid: 'user-1', betaOverrideActive: false });
  queue = Promise.resolve();
});

after(() => {
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  if (originalMetrics) require.cache[metricsPath] = originalMetrics;
  else delete require.cache[metricsPath];
  delete require.cache[billingPath];
});

describe('billing webhook state', () => {
  it('derives invoice entitlement from the current subscription', async () => {
    const retrieved = subscription('canceled');
    const stripe = { subscriptions: { retrieve: async (id) => {
      assert.equal(id, 'sub_1');
      return retrieved;
    } } };
    const event = {
      id: 'evt_invoice',
      type: 'invoice.paid',
      created: 200,
      data: { object: { subscription: 'sub_1', customer: 'cus_1' } },
    };

    await __testing.handleWebhookEvent(event, stripe);

    const entitlement = documents.get('userEntitlements/user-1');
    assert.equal(entitlement.billingStatus, 'canceled');
    assert.equal(entitlement.premiumActive, false);
    assert.equal(entitlement.lastStripeEventId, 'evt_invoice');
  });

  it('does not let an older subscription update reverse a deletion', async () => {
    const stripe = { subscriptions: { retrieve: async () => { throw new Error('not expected'); } } };
    await __testing.handleWebhookEvent({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      created: 300,
      data: { object: subscription('canceled') },
    }, stripe);
    await __testing.handleWebhookEvent({
      id: 'evt_delayed',
      type: 'customer.subscription.updated',
      created: 250,
      data: { object: subscription('active') },
    }, stripe);

    const entitlement = documents.get('userEntitlements/user-1');
    assert.equal(entitlement.billingStatus, 'canceled');
    assert.equal(entitlement.lastStripeEventId, 'evt_deleted');
    assert.equal(documents.get('processedStripeWebhookEvents/evt_delayed').outcome, 'stale');
  });

  it('applies a replayed event id once', async () => {
    const stripe = { subscriptions: { retrieve: async () => { throw new Error('not expected'); } } };
    const event = {
      id: 'evt_replay',
      type: 'customer.subscription.updated',
      created: 400,
      data: { object: subscription('active') },
    };

    await Promise.all([
      __testing.handleWebhookEvent(event, stripe),
      __testing.handleWebhookEvent(event, stripe),
    ]);

    assert.equal(documents.get('userEntitlements/user-1').billingStatus, 'active');
    assert.equal(documents.get('processedStripeWebhookEvents/evt_replay').outcome, 'applied');
  });
});
