jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...parts: string[]) => ({ parts })),
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((...parts: unknown[]) => ({ parts })),
  getDocs: jest.fn(),
  query: jest.fn((value) => value),
  setDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock('./firebase', () => ({ db: { name: 'db' } }));

import {
  createWorkflowAwarenessWriteQueue,
  deleteOneWorkflowAwareness,
  getWorkflowAwarenessAllowlist,
  isValidWorkflowAwarenessRecord,
  listWorkflowAwareness,
  saveWorkflowAwareness,
} from './workflowAwarenessService';
import { WORKFLOW_AWARENESS_CONSENT_VERSION } from '../types/workflowAwareness';

const {
  collection: mockCollection,
  deleteDoc: mockDeleteDoc,
  getDocs: mockGetDocs,
  setDoc: mockSetDoc,
} = jest.requireMock('firebase/firestore') as Record<string, jest.Mock>;

const metadata = {
  cycleId: 'WF-severe-day1-2026-07-13',
  workflowId: 'severe-day1',
  cycleDate: '2026-07-13',
  status: 'in-progress' as const,
  outlookVersions: [{ version: 1, status: 'in-progress' as const, createdAt: '2026-07-13T00:00:00.000Z' }],
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('writes only the nested user awareness path and allowlisted metadata', async () => {
  await saveWorkflowAwareness({
    userId: 'user-a',
    metadata,
    consent: { enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION },
  });

  expect(mockCollection).toHaveBeenCalledWith({ name: 'db' }, 'users', 'user-a', 'workflowAwareness');
  expect(mockSetDoc).toHaveBeenCalledWith(
    expect.objectContaining({ parts: [expect.objectContaining({ parts: [{ name: 'db' }, 'users', 'user-a', 'workflowAwareness'] }), metadata.cycleId] }),
    expect.objectContaining({
      consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
      schemaVersion: 1,
      metadata,
    }),
  );
  expect(getWorkflowAwarenessAllowlist()).toEqual(expect.arrayContaining(['metadata', 'consentVersion']));
});

test('rejects stale consent and malformed nested metadata', async () => {
  await saveWorkflowAwareness({ userId: 'user-a', metadata, consent: { enabled: true, version: 0 } });
  expect(mockSetDoc).not.toHaveBeenCalled();

  const malformed = {
    ...metadata,
    consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
    schemaVersion: 1,
    outlookVersions: [{ version: 1, status: 'in-progress', createdAt: 'now', geometry: 'forbidden' }],
  };
  expect(isValidWorkflowAwarenessRecord(malformed)).toBe(false);
});

test('deletes malformed records while returning only valid records', async () => {
  mockGetDocs.mockResolvedValue({
    docs: [
      { id: 'valid', data: () => ({ consentVersion: 1, schemaVersion: 1, metadata }) },
      { id: 'bad', data: () => ({ cycleId: metadata.cycleId }) },
    ],
  });

  const records = await listWorkflowAwareness({
    userId: 'user-a',
    consent: { enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION },
  });

  expect(records).toHaveLength(1);
  expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ parts: expect.arrayContaining(['bad']) }));
});

test('serializes disable/delete behind an in-flight save', async () => {
  const queue = createWorkflowAwarenessWriteQueue();
  const order: string[] = [];
  let releaseSave: () => void = () => undefined;
  const save = queue.enqueue(async () => {
    order.push('save-start');
    await new Promise<void>((resolve) => { releaseSave = resolve; });
    order.push('save-end');
  });
  const remove = queue.enqueue(async () => { order.push('delete'); });

  await Promise.resolve();
  expect(order).toEqual(['save-start']);
  releaseSave();
  await Promise.all([save, remove]);
  expect(order).toEqual(['save-start', 'save-end', 'delete']);
});

test('deletes one cleared workflow awareness record', async () => {
  await deleteOneWorkflowAwareness('user-a', metadata.cycleId);

  expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ parts: expect.arrayContaining([metadata.cycleId]) }));
});
