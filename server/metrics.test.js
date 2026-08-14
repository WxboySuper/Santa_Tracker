'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];
const documents = new Map();

const createRef = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
const snapshot = (ref) => ({ exists: documents.has(ref.key), data: () => documents.get(ref.key) || {} });
const db = {
  collection: (collection) => ({
    doc: (id) => createRef(collection, id),
    where: () => ({ get: async () => ({ size: 0 }) }),
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
const { handleMetricEvent, recordBillingMetricEvent, requiresAuthenticatedMetricEvent } = require('./metrics');

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

beforeEach(() => documents.clear());
after(() => {
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
