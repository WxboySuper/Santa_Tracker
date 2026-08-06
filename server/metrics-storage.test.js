'use strict';

const { after, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const firebaseAdminPath = require.resolve('./firebase-admin');
const metricsPath = require.resolve('./metrics');
const originalFirebaseAdmin = require.cache[firebaseAdminPath];

/** Build a minimal Firestore double with bounded aggregation support. */
const createDb = ({ counts = {}, payloadBytesSum = 0, supportsAggregates = true }) => {
  const collection = (name) => ({
    name,
    count: supportsAggregates
      ? () => ({ get: async () => ({ data: () => ({ count: counts[name] ?? 0 }) }) })
      : undefined,
    aggregate: supportsAggregates
      ? () => ({ get: async () => ({ data: () => ({ payloadBytes: payloadBytesSum }) }) })
      : undefined,
    limit: supportsAggregates
      ? undefined
      : () => ({
          get: async () => ({
            docs: Array.from({ length: counts[name] ?? 0 }, () => ({ data: () => ({ payloadBytes: 10 }) })),
          }),
        }),
  });
  return { collection };
};

let lastDb = null;
require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: {
    getAdminDb: () => lastDb,
    getAdminAuth: () => null,
    hasFirebaseAdminConfig: () => true,
  },
};

let metrics;
const loadMetrics = () => {
  delete require.cache[metricsPath];
  metrics = require('./metrics');
};

beforeEach(() => {
  lastDb = null;
  loadMetrics();
});

after(() => {
  if (originalFirebaseAdmin) require.cache[firebaseAdminPath] = originalFirebaseAdmin;
  else delete require.cache[firebaseAdminPath];
  delete require.cache[metricsPath];
});

describe('getCurrentStorageBytes bounded aggregation', () => {
  it('uses bounded counts and a payload-byte sum without transferring documents', async () => {
    lastDb = createDb({ counts: { cloudCycles: 3, userProfiles: 2 }, payloadBytesSum: 1500 });
    const total = await metrics.getCurrentStorageBytes();
    assert.ok(total >= 1500, `expected at least payload bytes, got ${total}`);
  });

  it('falls back to a capped scan when aggregates are unavailable', async () => {
    lastDb = createDb({ counts: { cloudCycles: 3 }, supportsAggregates: false });
    const total = await metrics.getCurrentStorageBytes();
    assert.ok(total >= 30, `expected capped fallback bytes, got ${total}`);
  });

  it('returns zero when no admin database is configured', async () => {
    lastDb = null;
    assert.equal(await metrics.getCurrentStorageBytes(), 0);
  });
});
