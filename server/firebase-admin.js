'use strict';

const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

let firebaseAdminApp = null;

/** True when the minimum Firebase Admin credentials needed for auth and Firestore are present. */
const hasFirebaseAdminConfig = () =>
  Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

/** Lazily initializes Firebase Admin so billing endpoints can verify tokens and write entitlements. */
const getFirebaseAdminApp = () => {
  if (!hasFirebaseAdminConfig()) {
    return null;
  }

  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  firebaseAdminApp = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });

  return firebaseAdminApp;
};

/** Returns the Admin auth instance when configured. */
const getAdminAuth = () => {
  const app = getFirebaseAdminApp();
  return app ? getAuth(app) : null;
};

/** Returns the Admin Firestore instance when configured. */
const getAdminDb = () => {
  const app = getFirebaseAdminApp();
  return app ? getFirestore(app) : null;
};

module.exports = {
  getAdminAuth,
  getAdminDb,
  hasFirebaseAdminConfig,
};
