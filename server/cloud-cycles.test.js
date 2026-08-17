'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  MAX_CLOUD_CYCLES,
  getPayloadBytes,
  readCloudCycleRequest,
  saveCloudCycle,
} = require('./cloud-cycles');

const createRef = (path) => ({
  path,
  collection: (name) => ({ doc: (id) => createRef(`${path}/${name}/${id}`) }),
});

const createDb = ({ existingCount = 0, existingCycle = null } = {}) => {
  const queries = [];
  const writes = new Map();
  const cloudCycles = {
    doc: (id) => createRef(`cloudCycles/${id}`),
    where: (field, operator, value) => ({
      field,
      operator,
      value,
      limit: (limit) => {
        const query = { field, operator, value, limit };
        queries.push(query);
        return query;
      },
    }),
  };

  return {
    queries,
    writes,
    collection: (name) => {
      if (name !== 'cloudCycles') throw new Error(`Unexpected collection: ${name}`);
      return cloudCycles;
    },
    runTransaction: async (callback) => callback({
      get: async (target) => {
        if (target.field === 'userId') return { size: existingCount };
        return { exists: Boolean(existingCycle), data: () => existingCycle };
      },
      set: (ref, value) => writes.set(ref.path, value),
    }),
  };
};

describe('cloud-cycle server contract', () => {
  it('derives UTF-8 payload bytes on the server request boundary', () => {
    const payloadJson = '{"label":"café"}';
    const cycle = readCloudCycleRequest({
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Cycle 1',
      cycleDate: '2026-08-09',
      payloadJson,
      metadata: { id: 'cycle-1', userId: 'user-1' },
    }, 'user-1');

    assert.equal(cycle.payloadBytes, getPayloadBytes(payloadJson));
  });

  it('bounds the new-cycle quota query and writes metadata and payload separately', async () => {
    const db = createDb({ existingCount: MAX_CLOUD_CYCLES - 1 });
    const payloadJson = '{"forecast":true}';

    await saveCloudCycle(db, 'user-1', {
      id: 'cycle-1',
      label: 'Cycle 1',
      cycleDate: '2026-08-09',
      payloadJson,
      payloadBytes: getPayloadBytes(payloadJson),
      metadata: { id: 'cycle-1', userId: 'user-1' },
    });

    assert.equal(db.queries[0].limit, MAX_CLOUD_CYCLES + 1);
    assert.equal(db.writes.get('cloudCycles/cycle-1').payloadBytes, getPayloadBytes(payloadJson));
    assert.equal(db.writes.get('cloudCycles/cycle-1/payload/payload').payloadJson, payloadJson);
  });

  it('rejects an existing cycle owned by another account before writing', async () => {
    const db = createDb({ existingCycle: { userId: 'other-user' } });

    await assert.rejects(
      () => saveCloudCycle(db, 'user-1', {
        id: 'cycle-1',
        label: 'Cycle 1',
        cycleDate: '2026-08-09',
        payloadJson: '{}',
        payloadBytes: 2,
        metadata: { id: 'cycle-1', userId: 'user-1' },
      }),
      (error) => error.code === 'CLOUD_CYCLE_OWNERSHIP_CONFLICT',
    );
    assert.equal(db.writes.size, 0);
  });

  it('overwrites an existing cycle owned by the same account', async () => {
    const db = createDb({ existingCycle: { userId: 'user-1' } });
    const payloadJson = '{"forecast":"updated"}';

    await saveCloudCycle(db, 'user-1', {
      id: 'cycle-1',
      label: 'Updated cycle',
      cycleDate: '2026-08-10',
      payloadJson,
      payloadBytes: getPayloadBytes(payloadJson),
      metadata: { id: 'cycle-1', userId: 'user-1' },
    });

    assert.equal(db.queries.length, 0);
    assert.deepEqual(db.writes.get('cloudCycles/cycle-1'), {
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Updated cycle',
      cycleDate: '2026-08-10',
      payloadBytes: getPayloadBytes(payloadJson),
    });
    assert.deepEqual(db.writes.get('cloudCycles/cycle-1/payload/payload'), {
      payloadJson,
      payloadBytes: getPayloadBytes(payloadJson),
    });
  });
});
