import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Archive, CheckCircle2, Clock3, FileText, GitBranch, Map, RefreshCw } from 'lucide-react';
import { isFeatureExposed } from '../../config/featureExposure';
import { Button } from '../ui/button';
import {
  selectForecastCycle,
  selectSavedCycles,
  selectHasActiveWorkflow,
  selectWorkflowMetadata,
  selectWorkflowTemplate,
  selectCompletionValidationResult,
  selectOmittedDays,
  createOutlookUpdate,
  startFromPreviousCycle,
  validateCompletion,
  completeCycle,
  completeWithOmissions,
  dismissCompletionModal,
  omitDay,
  setActiveOutlookType,
  setForecastDay,
} from '../../store/forecastSlice';
import { getLocalCalendarDate } from '../../utils/localDate';
import { validateCycleCompletion } from '../../utils/completionValidation';
import { downloadGfcPackage } from '../../utils/fileUtils';
import type { DayType, OutlookType } from '../../types/outlooks';
import type { StandardGrouping } from '../../types/workflow';
import {
  discussionPathForGrouping,
  getDiscussionForGrouping,
  getDiscussionGroupingForDay,
  getDiscussionGroupings,
  hasDiscussionContent as hasGroupedDiscussionContent,
} from '../../utils/discussionGrouping';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import CompletionValidationModal from '../CompletionValidation/CompletionValidationModal';
import CompletionHandoff from './CompletionHandoff';
import {
  getCompletionHandoffEligibility,
  getCompletionHandoffIdentity,
  hasHandledCompletionHandoff,
  markCompletionHandoffHandled,
} from './completionHandoffPolicy';
import './ForecastWorkflowPanel.css';

interface ForecastWorkflowPanelProps {
  controller?: ForecastWorkspaceController;
  context?: 'forecast' | 'discussion';
}

interface PreviousOutlookSuggestion {
  cycleId: string;
  label: string;
  sourceDay: DayType;
  targetDay: DayType;
}

/** True when one forecast day has any drawn outlook or low-probability marker. */
const dayHasMapWork = (day: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]>): boolean => {
  const hasMapData = Object.values(day.data).some((outlookMap) => (outlookMap?.size ?? 0) > 0);
  const hasLowProbability = (day.metadata.lowProbabilityOutlooks?.length ?? 0) > 0;
  const hasCustomLayers = isFeatureExposed('customProducts') && (day.customLayers?.layers.length ?? 0) > 0;
  return hasMapData || hasLowProbability || hasCustomLayers;
};

/** True when one forecast day has any map or discussion work started. */
const dayHasPackageWork = (day: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]>): boolean => {
  return dayHasMapWork(day) || Boolean(day.discussion);
};

/** Returns yesterday's local calendar date as YYYY-MM-DD. */
const getYesterdayLocalDate = (): string => {
  const today = new Date(`${getLocalCalendarDate()}T00:00:00`);
  today.setDate(today.getDate() - 1);
  return today.toISOString().slice(0, 10);
};

/** Maps yesterday's forecast day to the current day's useful starting point. */
const getPreviousSourceDay = (targetDay: DayType): DayType | null => {
  if (targetDay >= 1 && targetDay <= 7) {
    return (targetDay + 1) as DayType;
  }
  return null;
};

/** Formats a cycle date for the compact workflow banner label. */
function formatCycleDate(cycleDate: string): string {
  const parsed = new Date(`${cycleDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return cycleDate;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Returns the standard groupings that should be validated for a workflow template. */
const getWorkflowValidationGroupings = (
  template: ReturnType<typeof selectWorkflowTemplate>,
): StandardGrouping[] | undefined => {
  const groupings = (template?.groupings ?? []).filter(
    (grouping): grouping is StandardGrouping =>
      grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  return groupings.length > 0 ? groupings : undefined;
};

/** Finds the most relevant previous outlook for the active forecast day. */
const usePreviousOutlookSuggestion = (): PreviousOutlookSuggestion | null => {
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector(selectSavedCycles);

  return useMemo(() => {
    const sourceDay = getPreviousSourceDay(forecastCycle.currentDay);
    if (!sourceDay) return null;

    const yesterday = getYesterdayLocalDate();
    const candidate = savedCycles
      .slice()
      .reverse()
      .find((cycle) => {
        const source = cycle.forecastCycle.days[sourceDay];
        return cycle.cycleDate === yesterday && source && dayHasPackageWork(source);
      });

    if (!candidate) return null;

    return {
      cycleId: candidate.id,
      label: `${formatCycleDate(candidate.cycleDate)} Day ${sourceDay}`,
      sourceDay,
      targetDay: forecastCycle.currentDay,
    };
  }, [forecastCycle.currentDay, savedCycles]);
};

interface WorkflowStepProps {
  icon: React.ReactNode;
  label: string;
  status: 'complete' | 'active' | 'pending';
}

/** Displays one map, discussion, or review step in the workflow banner. */
function WorkflowStep({ icon, label, status }: WorkflowStepProps): React.ReactElement {
  return (
    <div className={`forecast-workflow-step forecast-workflow-step--${status}`}>
      <span>{icon}</span>
      <strong>{label}</strong>
    </div>
  );
}

interface WorkflowPanelActionsProps {
  context: 'forecast' | 'discussion';
  isReviewed: boolean;
  canReviewPackage: boolean;
  isUpdating: boolean;
  mapIsComplete: boolean;
  canExportPackage: boolean;
  hasController: boolean;
  hasSameDayWork: boolean;
  isPackageDownloading: boolean;
  previousSuggestion: PreviousOutlookSuggestion | null;
  activeUpdateVersion: number | undefined;
  onExport: () => void;
  onOpenReview: () => void;
  onCreateUpdate: () => void;
  onStartFromPrevious: () => void;
  onNavigate: (path: string) => void;
  discussionPath: string;
}

/** Adds the optional workflow export action. */
const WorkflowPanelExportAction: React.FC<WorkflowPanelActionsProps> = ({ canExportPackage, isPackageDownloading, isReviewed, onExport }) => {
  if (!canExportPackage || isReviewed) return null;
  return (
    <Button size="sm" variant="outline" onClick={onExport} disabled={isPackageDownloading}>
      <Archive className="h-4 w-4 mr-2" />
      Export
    </Button>
  );
}

/** Adds the optional review action for controller-backed forecast workspaces. */
const WorkflowPanelReviewAction: React.FC<WorkflowPanelActionsProps> = ({ canReviewPackage, hasController, isReviewed, isUpdating, onOpenReview }) => {
  if (!hasController) return null;
  if (isUpdating) return null;
  if (canReviewPackage && !isReviewed) return null;
  return (
    <Button size="sm" variant="outline" onClick={onOpenReview}>
      <CheckCircle2 className="h-4 w-4 mr-2" />
      Review
    </Button>
  );
};

/** Adds the optional same-day update action. */
const WorkflowPanelUpdateAction: React.FC<WorkflowPanelActionsProps> = ({ hasSameDayWork, isUpdating, onCreateUpdate }) => {
  if (isUpdating || !hasSameDayWork) return null;
  return (
    <Button size="sm" variant="outline" onClick={onCreateUpdate}>
      <RefreshCw className="h-4 w-4 mr-2" />
      Update
    </Button>
  );
};

/** Adds the optional previous-cycle workflow action. */
const WorkflowPanelPreviousAction: React.FC<WorkflowPanelActionsProps> = ({ previousSuggestion, onStartFromPrevious }) => {
  if (!previousSuggestion) return null;
  return (
    <Button size="sm" variant="outline" onClick={onStartFromPrevious}>
      <GitBranch className="h-4 w-4 mr-2" />
      Use {previousSuggestion.label}
    </Button>
  );
};

/** Renders the optional secondary workflow actions. */
function WorkflowPanelExtras(props: WorkflowPanelActionsProps): React.ReactElement {
  return (
    <>
      <WorkflowPanelExportAction {...props} />
      <WorkflowPanelReviewAction {...props} />
      <WorkflowPanelUpdateAction {...props} />
      <WorkflowPanelPreviousAction {...props} />
    </>
  );
}

/** Renders the primary action for the current workflow state. */
const WorkflowPanelPrimaryAction: React.FC<WorkflowPanelActionsProps> = ({
  context,
  isReviewed,
  canReviewPackage,
  isUpdating,
  mapIsComplete,
  isPackageDownloading,
  discussionPath,
  onExport,
  onOpenReview,
  onNavigate,
}) => {
  if (isReviewed) {
    return (
      <Button size="sm" onClick={onExport} disabled={isPackageDownloading}>
        <Archive className="h-4 w-4 mr-2" />
        {isPackageDownloading ? 'Exporting...' : 'Export Workflow'}
      </Button>
    );
  }
  if (canReviewPackage) {
    return (
      <Button size="sm" onClick={onOpenReview}>
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Review Package
      </Button>
    );
  }
  if (isUpdating) {
    return (
      <>
        {context === 'forecast' ? (
          <Button size="sm" onClick={() => onNavigate(discussionPath)} disabled={!mapIsComplete}>
            <FileText className="h-4 w-4 mr-2" />
            Update Discussion
          </Button>
        ) : (
          <Button size="sm" onClick={() => onNavigate('/forecast')}>
            <Map className="h-4 w-4 mr-2" />
            Update Map
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onOpenReview}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Mark Ready
        </Button>
      </>
    );
  }
  if (context === 'discussion') {
    return (
      <Button size="sm" onClick={() => onNavigate('/forecast')}>
        <Map className="h-4 w-4 mr-2" />
        {mapIsComplete ? 'Finish Map' : 'Continue Map'}
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={() => onNavigate(discussionPath)} disabled={!mapIsComplete}>
      <FileText className="h-4 w-4 mr-2" />
      Write Discussion
    </Button>
  );
};

/** Renders navigation and export controls beside the primary workflow action. */
const WorkflowPanelActions: React.FC<WorkflowPanelActionsProps> = (props) => (
  <div className="forecast-workflow-panel__actions">
    <WorkflowPanelPrimaryAction {...props} />
    <WorkflowPanelExtras {...props} />
  </div>
);

/** Returns the concise status shown in the workflow banner. */
interface WorkflowStatusState {
  hasMapStarted: boolean;
  isUpdating: boolean;
  activeUpdateVersion: number | undefined;
  mapIsComplete: boolean;
  discussionIsComplete: boolean;
  isReviewed: boolean;
}

/** Returns the concise status shown in the workflow banner. */
function getWorkflowStatusLabel({
  hasMapStarted,
  isUpdating,
  activeUpdateVersion,
  mapIsComplete,
  discussionIsComplete,
  isReviewed,
}: WorkflowStatusState): string {
  if (!hasMapStarted) return 'Map not started';
  if (isUpdating) return `Update v${activeUpdateVersion} in progress`;
  if (!mapIsComplete) return 'Map in progress';
  if (!discussionIsComplete) return 'Discussion needed';
  return isReviewed ? 'Ready to export' : 'Ready for review';
}

/** Displays the workflow progress steps without mixing them into the panel orchestration. */
const WorkflowPanelSteps: React.FC<{
  mapIsComplete: boolean;
  hasMapStarted: boolean;
  discussionIsComplete: boolean;
  isReviewed: boolean;
  canReviewPackage: boolean;
  isUpdating: boolean;
  activeUpdateVersion: number | undefined;
}> = ({
  mapIsComplete,
  hasMapStarted,
  discussionIsComplete,
  isReviewed,
  canReviewPackage,
  isUpdating,
  activeUpdateVersion,
}) => (
  <div className="forecast-workflow-panel__steps">
    <WorkflowStep icon={<Map className="h-4 w-4" />} label="Outlook map" status={mapIsComplete ? 'complete' : hasMapStarted ? 'active' : 'pending'} />
    <WorkflowStep icon={<FileText className="h-4 w-4" />} label="Discussion" status={discussionIsComplete ? 'complete' : mapIsComplete ? 'active' : 'pending'} />
    <WorkflowStep icon={<CheckCircle2 className="h-4 w-4" />} label={isUpdating ? `Update v${activeUpdateVersion}` : 'Review'} status={isReviewed ? 'complete' : (canReviewPackage || isUpdating) ? 'active' : 'pending'} />
  </div>
);

/** Displays the stale-date notice and route-local completion modal. */
const WorkflowPanelFooter: React.FC<{
  cycleDate: string;
  validationResult: ReturnType<typeof selectCompletionValidationResult>;
  omittedDays: ReturnType<typeof selectOmittedDays>;
  hasController: boolean;
  onClose: () => void;
  onComplete: () => void;
  onCompleteWithOmissions: () => void;
  onOmitDay: (day: DayType, reason: string) => void;
  onNavigateToIssue: (day: DayType, outlookType: OutlookType) => void;
  onExport: () => void;
}> = ({
  cycleDate,
  validationResult,
  omittedDays,
  hasController,
  onClose,
  onComplete,
  onCompleteWithOmissions,
  onOmitDay,
  onNavigateToIssue,
  onExport,
}) => (
  <>
    {cycleDate !== getLocalCalendarDate() ? (
      <div className="forecast-workflow-panel__notice">
        <Clock3 className="h-4 w-4" />
        This forecast was created before today and may now be out of date.
      </div>
    ) : null}
    {!hasController ? (
      <CompletionValidationModal
        isOpen={Boolean(validationResult)}
        validationResult={validationResult}
        omittedDays={omittedDays}
        onClose={onClose}
        onComplete={onComplete}
        onCompleteWithOmissions={onCompleteWithOmissions}
        onOmitDay={onOmitDay}
        onNavigateToIssue={onNavigateToIssue}
        onExport={onExport}
      />
    ) : null}
  </>
);

/** Returns the highest workflow package version, defaulting to the initial package. */
const getCurrentWorkflowVersion = (versions: { version: number }[]): number => {
  if (versions.length === 0) return 1;
  return Math.max(...versions.map((version) => version.version));
};

/** Determines whether the banner has enough state to render. */
const shouldHideWorkflowPanel = (
  isExposed: boolean,
  hasActiveWorkflow: boolean,
  workflowMetadata: ReturnType<typeof selectWorkflowMetadata>,
): boolean => !isExposed || !hasActiveWorkflow || !workflowMetadata;

/** Determines whether the current package can enter review. */
const canReviewWorkflowPackage = (
  mapIsComplete: boolean,
  discussionIsComplete: boolean,
  isUpdating: boolean,
  hasController: boolean,
  context: 'forecast' | 'discussion',
): boolean => mapIsComplete && discussionIsComplete && !isUpdating && (hasController || context === 'discussion');

/** Determines whether the current package has anything available to export. */
const canExportWorkflowPackage = (
  hasMapStarted: boolean,
  hasDiscussion: boolean,
  outlookVersionCount: number,
): boolean => hasMapStarted || hasDiscussion || outlookVersionCount > 0;

/** Determines whether the current package can start a same-day update. */
const hasSameDayWorkflowWork = (
  cycleDate: string,
  currentDay: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]> | undefined,
): boolean => cycleDate === getLocalCalendarDate() && Boolean(currentDay && dayHasPackageWork(currentDay));

const dayHasCustomContent = (
  day: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]> | undefined,
): boolean => Boolean(day?.customLayers?.layers.length);

/** Discloses custom workflow ownership only on builds where the custom editor is exposed. */
const CustomWorkflowDisclosure: React.FC<{ hasCustomContent: boolean }> = ({ hasCustomContent }) => {
  if (!isFeatureExposed('customProducts') || !hasCustomContent) return null;
  return (
    <p className="forecast-workflow-panel__custom-disclosure" role="note">
      Custom layers belong to this workflow grouping and are included in copies, updates, cloud saves, and packages. They are excluded from severe analytics and Auto-Categorical.
    </p>
  );
};

/** Persistent package workflow prompt for the forecast editor. */
export const ForecastWorkflowPanel: React.FC<ForecastWorkflowPanelProps> = ({ controller, context = 'forecast' }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isPackageDownloading, setIsPackageDownloading] = useState(false);
  const [showCompletionHandoff, setShowCompletionHandoff] = useState(false);
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector(selectSavedCycles);
  const hasActiveWorkflow = useSelector(selectHasActiveWorkflow);
  const workflowMetadata = useSelector(selectWorkflowMetadata);
  const workflowTemplate = useSelector(selectWorkflowTemplate);
  const validationResult = useSelector(selectCompletionValidationResult);
  const omittedDays = useSelector(selectOmittedDays);
  const previousSuggestion = usePreviousOutlookSuggestion();
  const handoffEligibility = getCompletionHandoffEligibility(workflowTemplate, workflowMetadata);
  const handoffIdentity = workflowMetadata ? getCompletionHandoffIdentity(workflowMetadata) : '';
  const activeWorkflowMetadata = workflowMetadata as NonNullable<typeof workflowMetadata>;

  useEffect(() => {
    setShowCompletionHandoff(
      Boolean(handoffIdentity) && handoffEligibility.showHandoff && !hasHandledCompletionHandoff(handoffIdentity),
    );
  }, [handoffEligibility.showHandoff, handoffIdentity]);

  if (shouldHideWorkflowPanel(isFeatureExposed('forecastWorkflowV2'), hasActiveWorkflow, workflowMetadata)) {
    return null;
  }

  const currentDay = forecastCycle.days[forecastCycle.currentDay];
  const hasCustomContent = dayHasCustomContent(currentDay);
  const discussionGroupings = getDiscussionGroupings(forecastCycle, workflowTemplate, forecastCycle.currentDay);
  const currentDiscussionGrouping = getDiscussionGroupingForDay(discussionGroupings, forecastCycle.currentDay);
  const hasMapStarted = Boolean(currentDay && dayHasMapWork(currentDay));
  const hasDiscussion = hasGroupedDiscussionContent(
    currentDiscussionGrouping ? getDiscussionForGrouping(forecastCycle, currentDiscussionGrouping) : currentDay?.discussion,
  );
  const discussionPath = currentDiscussionGrouping
    ? discussionPathForGrouping(currentDiscussionGrouping)
    : '/discussion';
  const currentValidation = validateCycleCompletion(forecastCycle, getWorkflowValidationGroupings(workflowTemplate));
  const mapIsComplete = !currentValidation.issues.some((issue) => issue.type === 'missing-polygon');
  const discussionIsComplete = !currentValidation.issues.some((issue) => issue.type === 'missing-discussion');
  const activeUpdateVersion = forecastCycle.updateInProgressVersion;
  const isUpdating = typeof activeUpdateVersion === 'number';
  const canReviewPackage = canReviewWorkflowPackage(mapIsComplete, discussionIsComplete, isUpdating, Boolean(controller), context);
  const canExportPackage = canExportWorkflowPackage(hasMapStarted, hasDiscussion, activeWorkflowMetadata.outlookVersions.length);
  const isReviewed = Boolean(forecastCycle.completionAcknowledgedAt);
  const hasSameDayWork = hasSameDayWorkflowWork(forecastCycle.cycleDate, currentDay);
  const currentVersion = getCurrentWorkflowVersion(activeWorkflowMetadata.outlookVersions);
  const statusLabel = getWorkflowStatusLabel({
    hasMapStarted,
    isUpdating,
    activeUpdateVersion,
    mapIsComplete,
    discussionIsComplete,
    isReviewed,
  });

  /** Starts a same-day workflow update from the current package. */
  function handleCreateUpdate(): void {
    dispatch(createOutlookUpdate());
  }
  /** Opens the completion review in the active workspace or validates it locally. */
  function handleOpenReview(): void {
    if (controller) {
      controller.onOpenCompletionModal();
      return;
    }
    dispatch(validateCompletion());
  }
  /** Closes the local completion review modal. */
  function handleCloseReview(): void { dispatch(dismissCompletionModal()); }
  /** Marks the current workflow package complete. */
  function handleCompleteReview(): void { dispatch(completeCycle()); }
  /** Completes the workflow package while retaining explicitly omitted days. */
  function handleCompleteWithOmissions(): void { dispatch(completeWithOmissions()); }
  /** Records why a workflow day was intentionally omitted. */
  function handleOmitDay(day: DayType, reason: string): void { dispatch(omitDay({ day, reason })); }
  /** Exports the current workflow package and restores the button state afterward. */
  async function handleWorkflowExport(): Promise<void> {
    setIsPackageDownloading(true);
    try {
      await downloadGfcPackage(
        forecastCycle,
        { center: [39.8283, -98.5795], zoom: 4 },
        workflowMetadata,
        'workflow',
      );
    } finally {
      setIsPackageDownloading(false);
    }
  }
  /** Exports the complete cycle through the existing WF-09 package path. */
  function handleCycleExport(): void {
    if (controller) {
      controller.onCyclePackageDownload();
      return;
    }
    setIsPackageDownloading(true);
    downloadGfcPackage(
      forecastCycle,
      { center: [39.8283, -98.5795], zoom: 4 },
      workflowMetadata,
      'cycle',
    ).finally(() => setIsPackageDownloading(false)).catch(() => undefined);
  }
  /** Dismisses guidance while leaving the completed workflow untouched. */
  function handleDismissHandoff(): void {
    markCompletionHandoffHandled(handoffIdentity);
    setShowCompletionHandoff(false);
  }
  /** Opens Monitor with the active cycle's actual source-option namespace. */
  function handleOpenMonitor(): void {
    markCompletionHandoffHandled(handoffIdentity);
    setShowCompletionHandoff(false);
    const savedCycle = savedCycles
      .filter((cycle) => cycle.workflowMetadata?.id === activeWorkflowMetadata.id)
      .sort((left, right) => {
        const leftRevision = new Date(left.workflowMetadata?.updatedAt ?? left.timestamp).getTime();
        const rightRevision = new Date(right.workflowMetadata?.updatedAt ?? right.timestamp).getTime();
        return rightRevision - leftRevision || right.id.localeCompare(left.id);
      })[0];
    const sourceKind = savedCycle ? 'local-cycle' : 'current';
    const sourceId = savedCycle?.id ?? 'current';
    navigate(`/monitor?workflowId=${encodeURIComponent(activeWorkflowMetadata.workflowId)}&sourceKind=${sourceKind}&sourceId=${encodeURIComponent(sourceId)}`);
  }
  /** Closes guidance and returns the user to the forecast map. */
  function handleReturnToMap(): void {
    markCompletionHandoffHandled(handoffIdentity);
    setShowCompletionHandoff(false);
    navigate('/forecast');
  }
  /** Starts today's workflow from the suggested previous-cycle outlook. */
  function handleStartFromPrevious(): void {
    if (!previousSuggestion) return;
    dispatch(startFromPreviousCycle({
      sourceCycleId: previousSuggestion.cycleId,
      sourceDay: previousSuggestion.sourceDay,
      targetDay: previousSuggestion.targetDay,
      newCycleDate: getLocalCalendarDate(),
    }));
  }

  return (
    <section
      className={`forecast-workflow-panel${isUpdating ? ' forecast-workflow-panel--updating' : ''}`}
      aria-label="Forecast package workflow"
    >
      <div className="forecast-workflow-panel__content">
        <div className="forecast-workflow-panel__meta-row">
          <span>Day {forecastCycle.currentDay} package</span>
          <span>{formatCycleDate(forecastCycle.cycleDate)}</span>
          <span>v{currentVersion}</span>
          <strong>{statusLabel}</strong>
          {isUpdating ? (
            <span className="forecast-workflow-panel__update-badge">
              <RefreshCw className="h-3.5 w-3.5" />
              Editing update
            </span>
          ) : null}
        </div>

        <WorkflowPanelSteps
          mapIsComplete={mapIsComplete}
          hasMapStarted={hasMapStarted}
          discussionIsComplete={discussionIsComplete}
          isReviewed={isReviewed}
          canReviewPackage={canReviewPackage}
          isUpdating={isUpdating}
          activeUpdateVersion={activeUpdateVersion}
        />
        <CustomWorkflowDisclosure hasCustomContent={hasCustomContent} />
        <WorkflowPanelActions
          context={context}
          isReviewed={isReviewed}
          canReviewPackage={canReviewPackage}
          isUpdating={isUpdating}
          mapIsComplete={mapIsComplete}
          canExportPackage={canExportPackage}
          hasController={Boolean(controller)}
          hasSameDayWork={hasSameDayWork}
          isPackageDownloading={isPackageDownloading}
          previousSuggestion={previousSuggestion}
          activeUpdateVersion={activeUpdateVersion}
          discussionPath={discussionPath}
          onExport={() => { handleWorkflowExport().catch(() => undefined); }}
          onOpenReview={handleOpenReview}
          onCreateUpdate={handleCreateUpdate}
          onStartFromPrevious={handleStartFromPrevious}
          onNavigate={navigate}
        />
      </div>

      <WorkflowPanelFooter
        cycleDate={forecastCycle.cycleDate}
        validationResult={validationResult}
        omittedDays={omittedDays}
        hasController={Boolean(controller)}
        onClose={handleCloseReview}
        onComplete={handleCompleteReview}
        onCompleteWithOmissions={handleCompleteWithOmissions}
        onOmitDay={handleOmitDay}
        onNavigateToIssue={(day, outlookType) => {
          dispatch(setForecastDay(day));
          dispatch(setActiveOutlookType(outlookType));
          dispatch(dismissCompletionModal());
          navigate('/forecast');
        }}
        onExport={() => { handleWorkflowExport().catch(() => undefined); }}
      />
      <CompletionHandoff
        open={showCompletionHandoff}
        showMonitor={handoffEligibility.showMonitor}
        isDownloading={isPackageDownloading || Boolean(controller?.isPackageDownloading)}
        onWorkflowExport={controller?.onWorkflowPackageDownload ?? (() => { handleWorkflowExport().catch(() => undefined); })}
        onCycleExport={handleCycleExport}
        onMonitor={handleOpenMonitor}
        onReturnToMap={handleReturnToMap}
        onDismiss={handleDismissHandoff}
      />
    </section>
  );
};

export default ForecastWorkflowPanel;
