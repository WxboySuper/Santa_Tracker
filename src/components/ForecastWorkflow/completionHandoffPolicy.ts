import type { CycleMetadata, WorkflowMetadata } from '../../types/workflow';

export interface CompletionHandoffEligibility { showHandoff: boolean; showMonitor: boolean; }

const MONITOR_SUPPORTED_GROUPINGS = new Set(['day1']);
const COMPLETED_STATUSES = new Set(['completed', 'completed-with-omissions']);

/** Returns whether the cycle reached a completion status eligible for handoff guidance. */
const isCompletedCycle = (cycle: CycleMetadata | undefined): cycle is CycleMetadata =>
  Boolean(cycle && COMPLETED_STATUSES.has(cycle.status));

/** Returns whether the workflow uses one of the supported short-term groupings. */
const isSupportedShortTermWorkflow = (workflow: WorkflowMetadata | undefined): workflow is WorkflowMetadata =>
  Boolean(
    workflow
    && workflow.groupings.length > 0
    && workflow.groupings.every((grouping) => ['day1', 'day2', 'day3'].includes(grouping)),
  );

/** Returns whether Monitor is supported for at least one grouping in the workflow. */
const supportsMonitor = (workflow: WorkflowMetadata): boolean =>
  workflow.groupings.some((grouping) => MONITOR_SUPPORTED_GROUPINGS.has(grouping));

/** Returns the post-completion actions allowed for a known workflow shape. */
export const getCompletionHandoffEligibility = (
  workflow: WorkflowMetadata | undefined,
  cycle: CycleMetadata | undefined,
): CompletionHandoffEligibility => {
  if (!isCompletedCycle(cycle)) {
    return { showHandoff: false, showMonitor: false };
  }
  if (!isSupportedShortTermWorkflow(workflow)) {
    return { showHandoff: false, showMonitor: false };
  }
  return {
    showHandoff: true,
    showMonitor: supportsMonitor(workflow),
  };
};

/** Stable identity used to suppress a handoff only for one completion revision. */
export const getCompletionHandoffIdentity = (cycle: CycleMetadata): string => {
  const version = cycle.outlookVersions.reduce((highest, item) => Math.max(highest, item.version), 1);
  return `${cycle.id}:${cycle.workflowId}:${version}:${cycle.updatedAt}`;
};

export const COMPLETION_HANDOFF_STORAGE_KEY = 'gfc-completion-handoff-handled';

/** Reads whether this completion revision was already handled in this session. */
export const hasHandledCompletionHandoff = (identity: string): boolean => {
  try { return sessionStorage.getItem(`${COMPLETION_HANDOFF_STORAGE_KEY}:${identity}`) === 'true'; } catch { return false; }
};

/** Records a handled completion revision without making storage a hard dependency. */
export const markCompletionHandoffHandled = (identity: string): void => {
  try { sessionStorage.setItem(`${COMPLETION_HANDOFF_STORAGE_KEY}:${identity}`, 'true'); } catch { /* best effort */ }
};
