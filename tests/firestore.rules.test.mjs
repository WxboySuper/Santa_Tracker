import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'gfc-rules-test';
const ALICE = 'alice';
const BOB = 'bob';
let testEnv = null;
const TEST_TIMESTAMP = Timestamp.fromDate(new Date('2026-07-16T00:00:00.000Z'));
const UPDATED_TEST_TIMESTAMP = Timestamp.fromDate(new Date('2026-07-16T01:00:00.000Z'));

/** Build a valid client-managed profile document. */
const profile = (overrides = {}) => ({
  email: 'alice@example.test',
  displayName: 'Alice',
  photoURL: '',
  providers: ['password'],
  createdAt: TEST_TIMESTAMP,
  updatedAt: TEST_TIMESTAMP,
  ...overrides,
});

/** Build a valid hosted cloud-cycle document. */
const cloudCycle = (overrides = {}) => ({
  id: 'cycle-1',
  userId: ALICE,
  label: 'July 16 cycle',
  cycleDate: '2026-07-16',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  forecastDays: 3,
  totalOutlooks: 1,
  totalFeatures: 1,
  isReadOnly: false,
  payloadJson: '{}',
  payloadBytes: 2,
  ...overrides,
});

/** Build a valid reusable custom product. */
const customProduct = (overrides = {}) => ({
  schemaVersion: '1.0.0',
  id: 'product-logical-1',
  userId: ALICE,
  label: 'Fire weather',
  description: 'Reusable desk template',
  version: 1,
  status: 'active',
  categories: [{
    id: 'elevated',
    label: 'Elevated',
    order: 0,
    style: {
      fillColor: '#f97316', fillOpacity: 0.45,
      strokeColor: '#123456', strokeOpacity: 1,
      strokeWidth: 2, hatch: 'diagonal',
    },
  }],
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
  ...overrides,
});

/** Build a valid synchronized settings document. */
const settings = (overrides = {}) => ({
  darkMode: false,
  baseMapStyle: 'osm',
  stateBorders: true,
  counties: false,
  ghostOutlooks: {
    tornado: false, wind: false, hail: false, categorical: false,
    totalSevere: false, 'day4-8': false,
  },
  defaultForecasterName: 'Alice',
  forecastUiVariant: 'integrated',
  monitorSettings: {
    radarMode: 'none', radarProduct: 'bref-qcd', radarSite: 'KTLX', radarOpacity: 0.72,
    satelliteProduct: 'none', satelliteOpacity: 0.68,
    outlookSource: { kind: 'current', id: 'current' }, outlookType: 'categorical',
    mapView: { center: [39.8283, -98.5795], zoom: 4 }, animationEnabled: false,
    animationSpeedMs: 400, stormReportsEnabled: true, stormReportsFilterTornado: true,
    stormReportsFilterWind: true, stormReportsFilterHail: true,
    stormReportsMatchOutlookType: false, alertsEnabled: true, alertsOpacity: 0.55,
    alertsShowWatches: true, alertsShowWarnings: true, alertsShowAdvisories: false,
  },
  ...overrides,
});

/** Build valid beta workflow metadata embedded in a cloud cycle. */
const workflowMetadata = (overrides = {}) => ({
  id: 'workflow-1',
  workflowId: 'workflow-1',
  cycleDate: '2026-07-16',
  status: 'in-progress',
  outlookVersions: [
    {
      version: 1,
      status: 'in-progress',
      createdAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  ...overrides,
});

/** Return a Firestore client authenticated as the supplied user. */
const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();
/** Return an unauthenticated Firestore client. */
const anonymousDb = () => testEnv.unauthenticatedContext().firestore();

/** Seed trusted server-owned state without applying client rules. */
const seed = async (writes) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await writes(context.firestore());
  });
};

/** Seed a server-owned premium entitlement. */
const setEntitlement = (db, uid, premiumActive) =>
  setDoc(doc(db, 'userEntitlements', uid), { premiumActive });

/** Enable hosted custom-product writes as trusted server state. */
const enableCustomProducts = (db, enabled = true) =>
  setDoc(doc(db, 'serverFeatureCapabilities', 'customProducts'), { enabled });

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('userProfiles authorization', () => {
  test('allows an owner to create ordinary profile fields', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile()));
  });

  test('rejects privileged and unknown fields on owner create', async () => {
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile({ betaAccess: true }))
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile({ role: 'admin' }))
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile({ providers: [{}] }))
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), profile({ providers: ['x'.repeat(129)] }))
    );
  });

  test('preserves server-owned access fields during ordinary owner updates', async () => {
    await seed((db) =>
      setDoc(doc(db, 'userProfiles', ALICE), {
        ...profile(),
        betaAccess: true,
        betaGrantedAt: '2026-07-16T00:00:00.000Z',
        betaInviteSource: 'discord',
      })
    );

    await assertSucceeds(
      updateDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), {
        displayName: 'Updated Alice',
        updatedAt: UPDATED_TEST_TIMESTAMP,
      })
    );
    const snapshot = await getDoc(doc(dbFor(ALICE), 'userProfiles', ALICE));
    assert.equal(snapshot.data().betaAccess, true);
  });

  test('rejects owner attempts to change reserved access fields', async () => {
    await seed((db) =>
      setDoc(doc(db, 'userProfiles', ALICE), { ...profile(), betaAccess: true })
    );

    await assertFails(
      updateDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), { betaAccess: false })
    );
    await assertFails(
      updateDoc(doc(dbFor(ALICE), 'userProfiles', ALICE), { admin: true })
    );
  });

  test('rejects cross-account profile reads and writes', async () => {
    await seed((db) => setDoc(doc(db, 'userProfiles', ALICE), profile()));
    await assertFails(getDoc(doc(dbFor(BOB), 'userProfiles', ALICE)));
    await assertFails(setDoc(doc(dbFor(BOB), 'userProfiles', ALICE), profile()));
  });
});

describe('userSettings schema boundary', () => {
  test('allows the normalized settings shape', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'userSettings', ALICE), settings()));
  });

  test('rejects unsupported and unbounded settings values', async () => {
    const ref = doc(dbFor(ALICE), 'userSettings', ALICE);
    await assertFails(setDoc(ref, settings({ baseMapStyle: 'x'.repeat(5000) })));
    await assertFails(setDoc(ref, settings({ forecastUiVariant: 'unknown' })));
    await assertFails(setDoc(ref, settings({ monitorSettings: { arbitrary: { nested: true } } })));
    await assertFails(setDoc(ref, settings({ ghostOutlooks: { tornado: true } })));
  });
});

describe('beta workflow awareness authorization', () => {
  /** Build a valid beta workflow-awareness document. */
  const awareness = (overrides = {}) => ({
    consentVersion: 1,
    schemaVersion: 1,
    metadata: {
      cycleId: 'cycle-1',
      workflowId: 'workflow-1',
      cycleDate: '2026-07-16',
      status: 'in-progress',
      outlookVersions: [
        {
          version: 1,
          status: 'in-progress',
          createdAt: '2026-07-16T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      ...overrides,
    },
  });

  test('preserves bounded owner-only workflow awareness writes', async () => {
    const aliceRef = doc(dbFor(ALICE), 'users', ALICE, 'workflowAwareness', 'cycle-1');
    const bobRef = doc(dbFor(BOB), 'users', ALICE, 'workflowAwareness', 'cycle-1');

    await assertSucceeds(setDoc(aliceRef, awareness()));
    await assertFails(setDoc(bobRef, awareness()));
    await assertFails(
      updateDoc(aliceRef, { metadata: awareness({ workflowId: 'x'.repeat(129) }).metadata })
    );
  });
});

describe('cloudCycles entitlement boundary', () => {
  test('rejects client writes to server-owned entitlement records', async () => {
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'userEntitlements', ALICE), { premiumActive: true })
    );
    await seed((db) => setEntitlement(db, ALICE, false));
    await assertFails(
      updateDoc(doc(dbFor(ALICE), 'userEntitlements', ALICE), { premiumActive: true })
    );
    await assertFails(deleteDoc(doc(dbFor(ALICE), 'userEntitlements', ALICE)));
  });

  test('rejects creation and mutation of the legacy userSettings cloud store', async () => {
    const settingsRef = doc(dbFor(ALICE), 'userSettings', ALICE);

    await assertFails(
      setDoc(settingsRef, {
        darkMode: false,
        cloudCycles: { 'cycle-1': cloudCycle() },
      })
    );

    await seed((db) =>
      setDoc(doc(db, 'userSettings', ALICE), {
        darkMode: false,
        cloudCycles: { 'cycle-1': cloudCycle() },
      })
    );
    await assertFails(
      updateDoc(settingsRef, {
        cloudCycles: { 'cycle-1': cloudCycle({ label: 'mutated' }) },
      })
    );
  });

  test('allows an owner to remove a pre-existing legacy cloud store during migration', async () => {
    await seed((db) =>
      setDoc(doc(db, 'userSettings', ALICE), {
        darkMode: false,
        cloudCycles: { 'cycle-1': cloudCycle() },
      })
    );

    await assertSucceeds(
      updateDoc(doc(dbFor(ALICE), 'userSettings', ALICE), {
        cloudCycles: deleteField(),
      })
    );
  });

  test('rejects signed-out, free, inactive, and wrong-owner creates', async () => {
    await seed(async (db) => {
      await setEntitlement(db, ALICE, false);
      await setEntitlement(db, BOB, true);
    });

    await assertFails(
      setDoc(doc(anonymousDb(), 'cloudCycles', 'cycle-1'), cloudCycle())
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'), cloudCycle())
    );
    await assertFails(
      setDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1'), cloudCycle())
    );
  });

  test('allows an actively entitled owner to create and update', async () => {
    await seed((db) => setEntitlement(db, ALICE, true));
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertSucceeds(setDoc(ref, cloudCycle()));
    await assertSucceeds(
      updateDoc(ref, {
        label: 'Updated cycle',
        updatedAt: '2026-07-16T01:00:00.000Z',
      })
    );
  });

  test('preserves bounded beta workflow metadata for entitled owners', async () => {
    await seed((db) => setEntitlement(db, ALICE, true));
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertSucceeds(
      setDoc(ref, cloudCycle({ workflowMetadata: workflowMetadata() }))
    );
    await assertSucceeds(
      updateDoc(ref, {
        label: 'Updated workflow cycle',
        updatedAt: '2026-07-16T01:00:00.000Z',
      })
    );
    await assertFails(
      updateDoc(ref, {
        workflowMetadata: workflowMetadata({ workflowId: 'x'.repeat(129) }),
      })
    );
  });

  test('lets a downgraded owner read and delete but not update existing data', async () => {
    await seed(async (db) => {
      await setEntitlement(db, ALICE, false);
      await setDoc(doc(db, 'cloudCycles', 'cycle-1'), cloudCycle());
    });
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { label: 'Unauthorized update' }));
    await assertSucceeds(deleteDoc(ref));
  });

  test('rejects anonymous and wrong-owner access to existing cloud cycles', async () => {
    await seed(async (db) => {
      await setEntitlement(db, BOB, true);
      await setDoc(doc(db, 'cloudCycles', 'cycle-1'), cloudCycle());
    });

    await assertFails(getDoc(doc(anonymousDb(), 'cloudCycles', 'cycle-1')));
    await assertFails(getDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1')));
    await assertFails(
      updateDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1'), { label: 'stolen' })
    );
    await assertFails(deleteDoc(doc(dbFor(BOB), 'cloudCycles', 'cycle-1')));
  });

  test('allows only owner-scoped list queries', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'cloudCycles', 'alice-cycle'), cloudCycle({ id: 'alice-cycle' }));
      await setDoc(
        doc(db, 'cloudCycles', 'bob-cycle'),
        cloudCycle({ id: 'bob-cycle', userId: BOB })
      );
    });

    const ownedQuery = query(
      collection(dbFor(ALICE), 'cloudCycles'),
      where('userId', '==', ALICE)
    );
    await assertSucceeds(getDocs(ownedQuery));
    await assertFails(getDocs(collection(dbFor(ALICE), 'cloudCycles')));
    await assertFails(
      getDocs(
        query(collection(dbFor(ALICE), 'cloudCycles'), where('userId', '==', BOB))
      )
    );
  });

  test('rejects ownership transfer, unknown fields, and oversized updates', async () => {
    await seed(async (db) => {
      await setEntitlement(db, ALICE, true);
      await setDoc(doc(db, 'cloudCycles', 'cycle-1'), cloudCycle());
    });
    const ref = doc(dbFor(ALICE), 'cloudCycles', 'cycle-1');

    await assertFails(updateDoc(ref, { userId: BOB }));
    await assertFails(updateDoc(ref, { internalRole: 'admin' }));
    await assertFails(updateDoc(ref, { payloadJson: 'x'.repeat(750001) }));
  });

  test('rejects malformed and oversized documents for active owners', async () => {
    await seed((db) => setEntitlement(db, ALICE, true));

    await assertFails(
      setDoc(doc(dbFor(ALICE), 'cloudCycles', 'malformed'), cloudCycle({ id: 'wrong-id' }))
    );
    await assertFails(
      setDoc(
        doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'),
        cloudCycle({ label: 'x'.repeat(201) })
      )
    );
    await assertFails(
      setDoc(
        doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'),
        cloudCycle({ payloadJson: 'x'.repeat(750001), payloadBytes: 750001 })
      )
    );
    await assertFails(
      setDoc(
        doc(dbFor(ALICE), 'cloudCycles', 'cycle-1'),
        cloudCycle({ payloadJson: '€'.repeat(250001), payloadBytes: 250001 })
      )
    );
  });
});

describe('customProducts security and lifecycle boundary', () => {
  const aliceRef = () => doc(dbFor(ALICE), 'users', ALICE, 'customProducts', 'product-01');

  test('is fail-closed until both server capability and entitlement are active', async () => {
    await seed((db) => setEntitlement(db, ALICE, true));
    await assertFails(setDoc(aliceRef(), customProduct()));

    await seed(async (db) => {
      await enableCustomProducts(db);
      await setEntitlement(db, ALICE, false);
    });
    await assertFails(setDoc(aliceRef(), customProduct()));
    await assertFails(getDoc(doc(dbFor(ALICE), 'serverFeatureCapabilities', 'customProducts')));
  });

  test('allows entitled owner create and strict versioned active edits in one of twenty slots', async () => {
    await seed(async (db) => {
      await enableCustomProducts(db);
      await setEntitlement(db, ALICE, true);
    });
    await assertSucceeds(setDoc(aliceRef(), customProduct()));
    await assertSucceeds(updateDoc(aliceRef(), {
      label: 'Updated fire weather', version: 2, updatedAt: '2026-07-17T01:00:00.000Z',
    }));
    await assertFails(setDoc(
      doc(dbFor(ALICE), 'users', ALICE, 'customProducts', 'product-21'),
      customProduct({ id: 'another-product' }),
    ));
  });

  test('preserves owner read and delete after expiration or rollout shutdown', async () => {
    await seed(async (db) => {
      await enableCustomProducts(db, false);
      await setEntitlement(db, ALICE, false);
      await setDoc(doc(db, 'users', ALICE, 'customProducts', 'product-01'), customProduct());
    });
    await assertSucceeds(getDoc(aliceRef()));
    await assertFails(updateDoc(aliceRef(), { label: 'Expired edit', version: 2 }));
    await assertSucceeds(deleteDoc(aliceRef()));
  });

  test('rejects anonymous and cross-account access', async () => {
    await seed((db) => setDoc(doc(db, 'users', ALICE, 'customProducts', 'product-01'), customProduct()));
    await assertFails(getDoc(doc(anonymousDb(), 'users', ALICE, 'customProducts', 'product-01')));
    await assertFails(getDoc(doc(dbFor(BOB), 'users', ALICE, 'customProducts', 'product-01')));
    await assertFails(deleteDoc(doc(dbFor(BOB), 'users', ALICE, 'customProducts', 'product-01')));
  });

  test('enforces immutable identity, monotonic versions, and status-only lifecycle transitions', async () => {
    await seed(async (db) => {
      await enableCustomProducts(db);
      await setEntitlement(db, ALICE, true);
      await setDoc(doc(db, 'users', ALICE, 'customProducts', 'product-01'), customProduct());
    });
    await assertFails(updateDoc(aliceRef(), { userId: BOB, version: 2, updatedAt: '2026-07-17T01:00:00.000Z' }));
    await assertFails(updateDoc(aliceRef(), { label: 'No bump', updatedAt: '2026-07-17T01:00:00.000Z' }));
    await assertSucceeds(updateDoc(aliceRef(), { status: 'archived', version: 2, updatedAt: '2026-07-17T01:00:00.000Z' }));
    await assertFails(updateDoc(aliceRef(), { label: 'Archived edit', version: 3, updatedAt: '2026-07-17T02:00:00.000Z' }));
    await assertSucceeds(updateDoc(aliceRef(), { status: 'active', version: 3, updatedAt: '2026-07-17T02:00:00.000Z' }));
  });

  test('rejects malformed styles, category order, duplicate IDs, and unknown fields', async () => {
    await seed(async (db) => {
      await enableCustomProducts(db);
      await setEntitlement(db, ALICE, true);
    });
    const baseCategory = customProduct().categories[0];
    await assertFails(setDoc(aliceRef(), customProduct({ internalRole: 'admin' })));
    await assertFails(setDoc(aliceRef(), customProduct({ categories: [{ ...baseCategory, order: 1 }] })));
    await assertFails(setDoc(aliceRef(), customProduct({ categories: [{ ...baseCategory, style: { ...baseCategory.style, fillColor: 'red' } }] })));
    const secondCategory = { ...baseCategory, id: 'critical', label: 'Critical', order: 1 };
    await assertSucceeds(setDoc(aliceRef(), customProduct({ categories: [baseCategory, secondCategory] })));
    await assertFails(setDoc(
      doc(dbFor(ALICE), 'users', ALICE, 'customProducts', 'product-02'),
      customProduct({
        id: 'product-logical-2',
        categories: [baseCategory, { ...secondCategory, id: baseCategory.id }],
      }),
    ));
  });

  test('rejects non-canonical, out-of-range, and impossible ISO timestamps', async () => {
    await seed(async (db) => {
      await enableCustomProducts(db);
      await setEntitlement(db, ALICE, true);
    });
    await assertFails(setDoc(aliceRef(), customProduct({ createdAt: 'not-a-timestamp' })));
    await assertFails(setDoc(
      doc(dbFor(ALICE), 'users', ALICE, 'customProducts', 'product-02'),
      customProduct({ id: 'product-logical-2', updatedAt: '2026-13-17T25:00:00.000Z' }),
    ));
    await assertFails(setDoc(
      doc(dbFor(ALICE), 'users', ALICE, 'customProducts', 'product-03'),
      customProduct({ id: 'product-logical-3', updatedAt: '2026-07-17T01:00:00Z' }),
    ));
    for (const [suffix, timestamp] of [
      ['04', '2026-02-29T01:00:00.000Z'],
      ['05', '2026-02-31T01:00:00.000Z'],
      ['06', '2026-04-31T01:00:00.000Z'],
    ]) {
      await assertFails(setDoc(
        doc(dbFor(ALICE), 'users', ALICE, 'customProducts', `product-${suffix}`),
        customProduct({ id: `product-logical-${suffix}`, updatedAt: timestamp }),
      ));
    }
    await assertSucceeds(setDoc(
      doc(dbFor(ALICE), 'users', ALICE, 'customProducts', 'product-07'),
      customProduct({ id: 'product-logical-07', updatedAt: '2028-02-29T01:00:00.000Z' }),
    ));
  });
});
