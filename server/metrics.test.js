'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const originalDateNow = Date.now;
const documents = new Map();
let aggregateGet = async () => ({ data: () => ({ count: 3 }) });
let fallbackDocs = [];
let fallbackGet = async () => ({ docs: fallbackDocs });
let countCalls = 0;
let clock = 0;

const createRef = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
const snapshot = (ref) => ({ exists: documents.has(ref.key), data: () => documents.get(ref.key) || {} });
const db = {
  collection: (collection) => ({
    doc: (id) => createRef(collection, id),
    where: () => ({ get: async () => ({ size: 0 }) }),
    count: () => ({
      get: async () => {
        countCalls += 1;
        return aggregateGet();
      },
    }),
    limit: () => ({ get: fallbackGet }),
  }),
  runTransaction: async (callback) =>
    callback({
      get: async (ref) => snapshot(ref),
      set: (ref, data, options) => {
        const previous = options?.merge ? documents.get(ref.key) || {} : {};
        documents.set(ref.key, { ...previous, ...data });
      },
    }),
};

require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: { getAdminDb: () => db, getAdminAuth: () => null, hasFirebaseAdminConfig: () => true },
};
delete require.cache[metricsPath];
const { countTotalAccounts, recordBillingMetricEvent } = require('./metrics');
const { handleMetricEvent, requiresAuthenticatedMetricEvent } = require('./metrics');

const createResponse = () => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(payload) {
      response.body = payload;
      return response;
    },
    end() {},
  };
  return response;
};

const createUnauthenticatedRequest = (event) => ({
  headers: {},
  body: { event, installationId: 'test-installation' },
});

beforeEach(() => {
  documents.clear();
  aggregateGet = async () => ({ data: () => ({ count: 3 }) });
  fallbackDocs = [{}, {}];
  fallbackGet = async () => ({ docs: fallbackDocs });
  countCalls = 0;
  clock += 10 * 60 * 1000;
  Date.now = () => clock;
});
after(() => {
  Date.now = originalDateNow;
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[metricsPath];
});

describe('recordBillingMetricEvent', () => {
  it('records a billing metric event', async () => {
    await recordBillingMetricEvent('premium_upgrade');
    await recordBillingMetricEvent('premium_upgrade');

    const dailyMetrics = [...documents.entries()].find(([key]) => key.startsWith('adminDailyMetrics/'))[1];
    assert.equal(dailyMetrics.upgrades, 2);
  });

  it('ignores billing metrics without a valid event type', async () => {
    await recordBillingMetricEvent('');
    assert.equal([...documents.keys()].some((key) => key.startsWith('adminDailyMetrics/')), false);
  });
});

describe('countTotalAccounts', () => {
  it('caches aggregate results and coalesces concurrent refreshes', async () => {
    let resolveAggregate;
    aggregateGet = () => new Promise((resolve) => {
      resolveAggregate = resolve;
    });

    const first = countTotalAccounts();
    const second = countTotalAccounts();
    assert.equal(countCalls, 1);
    resolveAggregate({ data: () => ({ count: 42 }) });
    assert.equal(await first, 42);
    assert.equal(await second, 42);

    assert.equal(await countTotalAccounts(), 42);
    assert.equal(countCalls, 1);
  });

  it('falls back when aggregate count is unavailable, including synchronous failures', async () => {
    aggregateGet = () => { throw new Error('aggregate unavailable'); };
    let resolveFallback;
    fallbackGet = () => new Promise((resolve) => {
      resolveFallback = resolve;
    });

    const first = countTotalAccounts();
    const second = countTotalAccounts();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(countCalls, 2);
    resolveFallback({ docs: fallbackDocs });
    assert.equal(await first, 2);
    assert.equal(await second, 2);
    assert.equal(countCalls, 2);
  });

  it('falls back when the aggregate result is not numeric', async () => {
    aggregateGet = async () => ({ data: () => ({ count: '42' }) });

    assert.equal(await countTotalAccounts(), 0);
    assert.equal(countCalls, 2);
  });
});

describe('product metric authentication contract', () => {
  it('rejects every allowlisted product event without a verified identity', async () => {
    for (const eventType of [
      'account_signup',
      'account_signin',
      'cycle_saved',
      'discussion_saved',
      'verification_run',
      'cloud_cycle_saved',
      'cloud_cycle_loaded',
    ]) {
      const response = createResponse();

      await handleMetricEvent(createUnauthenticatedRequest(eventType), response);

      assert.equal(response.statusCode, 401, `${eventType} must require authentication`);
    }
  });

  it('performs no Firestore write for an unauthenticated event', async () => {
    const response = createResponse();

    await handleMetricEvent(createUnauthenticatedRequest('cycle_saved'), response);

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Authentication required for product metrics.' });
    assert.equal(documents.size, 0);
  });

  it('leaves billing webhook events out of the client-authenticated allowlist', () => {
    assert.equal(requiresAuthenticatedMetricEvent('premium_upgrade'), false);
    assert.equal(requiresAuthenticatedMetricEvent('premium_cancellation'), false);
  });

  it('does not classify unsupported events as trusted metric writes', () => {
    assert.equal(requiresAuthenticatedMetricEvent('unknown'), false);
  });
});
