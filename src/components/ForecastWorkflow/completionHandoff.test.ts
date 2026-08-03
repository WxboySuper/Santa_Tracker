import { getCompletionHandoffEligibility, getCompletionHandoffIdentity } from './completionHandoffPolicy';
import type { CycleMetadata, WorkflowMetadata } from '../../types/workflow';

const cycle: CycleMetadata = {
  id: 'cycle-1', workflowId: 'severe-day1', cycleDate: '2026-07-15', status: 'completed',
  outlookVersions: [{ version: 1, status: 'completed', createdAt: '2026-07-15T00:00:00Z' }],
  createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T01:00:00Z',
};
const workflow = (groupings: WorkflowMetadata['groupings']): WorkflowMetadata => ({ id: 'wf', label: 'Workflow', groupings });

describe('completion handoff policy', () => {
  it('supports a completed Day 1 workflow and Monitor', () => {
    expect(getCompletionHandoffEligibility(workflow(['day1']), cycle)).toEqual({ showHandoff: true, showMonitor: true });
  });

  it('supports short-term workflows without offering Monitor when Day 1 is absent', () => {
    expect(getCompletionHandoffEligibility(workflow(['day2', 'day3']), cycle)).toEqual({ showHandoff: true, showMonitor: false });
  });

  it('fails closed for incomplete, long-range, custom, and malformed workflows', () => {
    expect(getCompletionHandoffEligibility(workflow(['day1']), { ...cycle, status: 'in-progress' })).toEqual({ showHandoff: false, showMonitor: false });
    expect(getCompletionHandoffEligibility(workflow(['day4-8']), cycle)).toEqual({ showHandoff: false, showMonitor: false });
    expect(getCompletionHandoffEligibility(workflow(['custom' as never]), cycle)).toEqual({ showHandoff: false, showMonitor: false });
    expect(getCompletionHandoffEligibility(undefined, cycle)).toEqual({ showHandoff: false, showMonitor: false });
  });

  it('changes identity when the completion revision changes', () => {
    expect(getCompletionHandoffIdentity(cycle)).not.toBe(getCompletionHandoffIdentity({
      ...cycle,
      updatedAt: '2026-07-15T02:00:00Z',
      outlookVersions: [...cycle.outlookVersions, { version: 2, status: 'completed', createdAt: '2026-07-15T02:00:00Z' }],
    }));
  });
});
