import {
  isWorkflowAwarenessResponseCurrent,
  readWorkflowAwarenessConsent,
  writeWorkflowAwarenessConsent,
} from './useWorkflowAwarenessSync';
import { WORKFLOW_AWARENESS_CONSENT_VERSION } from '../types/workflowAwareness';

afterEach(() => {
  localStorage.clear();
});

test('ignores an old auth response after a user switch', () => {
  expect(isWorkflowAwarenessResponseCurrent({
    requestGeneration: 1,
    currentGeneration: 2,
    requestUserId: 'user-a',
    currentUserId: 'user-b',
  })).toBe(false);
  expect(isWorkflowAwarenessResponseCurrent({
    requestGeneration: 2,
    currentGeneration: 2,
    requestUserId: 'user-b',
    currentUserId: 'user-b',
  })).toBe(true);
});

test('stores consent per user with the current version', () => {
  writeWorkflowAwarenessConsent('user-a', { enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION });
  writeWorkflowAwarenessConsent('user-b', { enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION });

  expect(readWorkflowAwarenessConsent('user-a')).toEqual({ enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION });
  expect(readWorkflowAwarenessConsent('user-b')).toEqual({ enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION });
});
