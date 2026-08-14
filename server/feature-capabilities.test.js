'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CUSTOM_PRODUCTS_CAPABILITY,
  ensureCustomProductsCapability,
} = require('./feature-capabilities');

const createDb = () => {
  const writes = [];
  return {
    writes,
    collection(name) {
      assert.equal(name, 'serverFeatureCapabilities');
      return {
        doc(id) {
          assert.equal(id, CUSTOM_PRODUCTS_CAPABILITY);
          return {
            async set(value, options) {
              writes.push({ value, options });
            },
          };
        },
      };
    },
  };
};

test('enables the server-owned Custom Products capability', async () => {
  const db = createDb();

  const result = await ensureCustomProductsCapability({ db });

  assert.deepEqual(result, { enabled: true, skipped: false });
  assert.deepEqual(db.writes, [{ value: { enabled: true }, options: { merge: true } }]);
});

test('skips capability reconciliation when Firebase Admin is not configured', async () => {
  assert.deepEqual(await ensureCustomProductsCapability({ db: null }), { enabled: false, skipped: true });
});
