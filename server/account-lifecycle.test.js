'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDeleteAccountHandler,
  deleteAccount,
  deleteLinkedStripeCustomers,
  getDeletionTombstoneId,
  hasRecentAuthentication,
  isAccountDeletionBlocked,
} = require('./account-lifecycle');

class FakeDocumentRef {
  constructor(db, collectionName, id) {
    this.db = db;
    this.collectionName = collectionName;
    this.id = id;
  }
  async get() {
    const data = this.db.read(this.collectionName, this.id);
    return { exists: Boolean(data), data: () => data };
  }
  async set(data, options = {}) {
    const current = options.merge ? this.db.read(this.collectionName, this.id) || {} : {};
    this.db.write(this.collectionName, this.id, { ...current, ...data });
  }
  async delete() {
    this.db.remove(this.collectionName, this.id);
  }
}

class FakeQuery {
  constructor(db, collectionName, field, value) {
    this.db = db;
    this.collectionName = collectionName;
    this.field = field;
    this.value = value;
  }
  async get() {
    const docs = [...this.db.collectionData(this.collectionName).entries()]
      .filter(([, data]) => data?.[this.field] === this.value)
      .map(([id]) => ({ id, ref: new FakeDocumentRef(this.db, this.collectionName, id) }));
    return { docs };
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }
  doc(id) {
    return new FakeDocumentRef(this.db, this.name, id);
  }
  where(field, operator, value) {
    assert.equal(operator, '==');
    return new FakeQuery(this.db, this.name, field, value);
  }
  async get() {
    const docs = [...this.db.collectionData(this.name).entries()]
      .map(([id]) => ({ id, ref: new FakeDocumentRef(this.db, this.name, id) }));
    return { docs };
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.data = new Map(Object.entries(seed).map(([name, records]) => [name, new Map(Object.entries(records))]));
  }
  collectionData(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name);
  }
  collection(name) {
    return new FakeCollection(this, name);
  }
  batch() {
    const pending = [];
    return {
      delete: (ref) => pending.push(ref),
      commit: async () => pending.forEach((ref) => ref.db.remove(ref.collectionName, ref.id)),
    };
  }
  read(name, id) {
    return this.collectionData(name).get(id);
  }
  write(name, id, data) {
    this.collectionData(name).set(id, data);
  }
  remove(name, id) {
    this.collectionData(name).delete(id);
  }
}

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  ended: false,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
  end() { this.ended = true; return this; },
});

test('recent-authentication window rejects stale tokens', () => {
  assert.equal(hasRecentAuthentication({ auth_time: 700 }, 1000), true);
  assert.equal(hasRecentAuthentication({ auth_time: 699 }, 1000), false);
  assert.equal(hasRecentAuthentication({ auth_time: 1001 }, 1000), false);
  assert.equal(hasRecentAuthentication({}, 1000), false);
});

test('deletion removes billing, account records, owned cycles, dedupes, and auth in order', async () => {
  const uid = 'user-1';
  const events = [];
  const db = new FakeDb({
    userProfiles: { [uid]: { displayName: 'Alex' } },
    userSettings: { [uid]: { darkMode: true } },
    userEntitlements: { [uid]: { stripeCustomerId: 'cus_123' } },
    userMetrics: { [uid]: { uid } },
    cloudCycles: { owned: { userId: uid }, other: { userId: 'user-2' } },
    adminMetricDedupes: {
      [`account:2026-07-21:${uid}`]: { kind: 'account', uid },
      'account:2026-07-21:user-2': { kind: 'account', uid: 'user-2' },
      'device:2026-07-21:hash': { kind: 'device' },
    },
  });
  const stripe = { customers: { del: async (id) => events.push(`stripe:${id}`) } };
  const adminAuth = { deleteUser: async (id) => events.push(`auth:${id}`), getUser: async () => ({ uid }) };

  await deleteAccount({ uid, db, adminAuth, stripe });

  assert.deepEqual(events, ['stripe:cus_123', `auth:${uid}`]);
  for (const collection of ['userProfiles', 'userSettings', 'userEntitlements', 'userMetrics']) {
    assert.equal(db.read(collection, uid), undefined);
  }
  assert.equal(db.read('cloudCycles', 'owned'), undefined);
  assert.deepEqual(db.read('cloudCycles', 'other'), { userId: 'user-2' });
  assert.equal(db.read('adminMetricDedupes', `account:2026-07-21:${uid}`), undefined);
  assert.ok(db.read('adminMetricDedupes', 'account:2026-07-21:user-2'));
  assert.equal(db.read('accountDeletionRequests', uid), undefined);
  assert.ok(db.read('accountDeletionTombstones', getDeletionTombstoneId(uid)));
});

test('billing unavailability leaves identity and data available for a safe retry', async () => {
  const uid = 'user-1';
  const db = new FakeDb({
    userProfiles: { [uid]: { displayName: 'Alex' } },
    userEntitlements: { [uid]: { stripeCustomerId: 'cus_123' } },
  });
  let authDeleted = false;
  const adminAuth = {
    deleteUser: async () => { authDeleted = true; },
    getUser: async () => ({ uid }),
  };

  await assert.rejects(
    deleteAccount({ uid, db, adminAuth, stripe: null }),
    { code: 'billing-unavailable' }
  );

  assert.equal(authDeleted, false);
  assert.ok(db.read('userProfiles', uid));
  assert.equal(db.read('accountDeletionRequests', uid).status, 'failed');
});

test('billing reconciliation terminates a customer linkage that changes during deletion', async () => {
  const customerIds = ['cus_old', 'cus_new', 'cus_new'];
  let reads = 0;
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ data: () => ({ stripeCustomerId: customerIds[reads++] }) }),
      }),
    }),
  };
  const deleted = [];
  const stripe = { customers: { del: async (customerId) => deleted.push(customerId) } };
  await deleteLinkedStripeCustomers({ db, uid: 'user-1', stripe });
  assert.deepEqual(deleted, ['cus_old', 'cus_new']);
});

test('orphaned data after identity deletion does not report failure', async () => {
  const uid = 'user-1';
  const db = new FakeDb({
    userProfiles: { [uid]: { displayName: 'Alex' } },
    userEntitlements: { [uid]: { stripeCustomerId: 'cus_123' } },
  });
  let authDeleted = false;
  let authGetCount = 0;
  const adminAuth = {
    deleteUser: async () => { authDeleted = true; },
    getUser: async () => {
      authGetCount++;
      // After deleteUser, identity is gone
      if (authDeleted) {
        const error = new Error('not found');
        error.code = 'auth/user-not-found';
        throw error;
      }
      return { uid };
    },
  };
  const stripe = { customers: { del: async () => {} } };

  // First call deletes identity, second call in catch confirms it's gone
  await deleteAccount({ uid, db, adminAuth, stripe });

  assert.equal(authDeleted, true);
  assert.equal(db.read('accountDeletionRequests', uid), undefined);
});

test('raw in-progress markers and hashed tombstones both block account activity', async () => {
  const uid = 'user-1';
  const db = new FakeDb({ accountDeletionRequests: { [uid]: { status: 'in_progress' } } });
  assert.equal(await isAccountDeletionBlocked(db, uid), true);
  db.remove('accountDeletionRequests', uid);
  db.write('accountDeletionTombstones', getDeletionTombstoneId(uid), { completedAt: new Date() });
  assert.equal(await isAccountDeletionBlocked(db, uid), true);
});

test('route requires exact confirmation before performing authentication work', async () => {
  let verified = false;
  const handler = createDeleteAccountHandler({
    adminAuth: { verifyIdToken: async () => { verified = true; } },
    db: new FakeDb(),
    stripe: null,
    nowSeconds: 1000,
  });
  const res = createResponse();
  await handler({ headers: {}, body: { confirmation: 'delete' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(verified, false);
});

test('route rejects a valid but stale sign-in without mutating account data', async () => {
  const uid = 'user-1';
  const db = new FakeDb({ userProfiles: { [uid]: { displayName: 'Alex' } } });
  const handler = createDeleteAccountHandler({
    adminAuth: {
      verifyIdToken: async () => ({ uid, auth_time: 600 }),
      deleteUser: async () => assert.fail('must not delete stale-auth user'),
    },
    db,
    stripe: null,
    nowSeconds: 1000,
  });
  const res = createResponse();
  await handler({ headers: { authorization: 'Bearer token' }, body: { confirmation: 'DELETE' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'reauthentication-required');
  assert.ok(db.read('userProfiles', uid));
});
