'use strict';

const { getAdminDb } = require('./firebase-admin');

const CUSTOM_PRODUCTS_CAPABILITY = 'customProducts';

/** Keeps the server-owned Custom Products capability enabled after each hosted deploy. */
const ensureCustomProductsCapability = async ({ db = getAdminDb() } = {}) => {
  if (!db) {
    return { enabled: false, skipped: true };
  }

  await db
    .collection('serverFeatureCapabilities')
    .doc(CUSTOM_PRODUCTS_CAPABILITY)
    .set({ enabled: true }, { merge: true });

  return { enabled: true, skipped: false };
};

module.exports = {
  CUSTOM_PRODUCTS_CAPABILITY,
  ensureCustomProductsCapability,
};
