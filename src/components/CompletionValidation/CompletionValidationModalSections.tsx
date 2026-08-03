// skipcq: JS-W1028
import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ValidationIssue } from '../../types/workflow';
import type { DayType } from '../../types/outlooks';
import { MissingItemsList } from './MissingItemsList';
import { Button } from '../ui/button';
import { DialogFooter } from '../ui/dialog';

/** Formats a workflow grouping key for display in the modal. */
const formatGrouping = (grouping: string): string => {
  switch (grouping) {
    case 'day1': return 'Day 1';
    case 'day2': return 'Day 2';
    case 'day3': return 'Day 3';
    case 'day4-8': return 'Days 4-8';
    default: return grouping;
  }
};

/** Maps a validation grouping key to the forecast day numbers it covers. */
const getDaysForGrouping = (grouping: string): DayType[] => {
  switch (grouping) {
    case 'day1': return [1];
    case 'day2': return [2];
    case 'day3': return [3];
    case 'day4-8': return [4, 5, 6, 7, 8];
    default: return [];
  }
};

/** Reads the stored omission reason for a grouping from the first mapped day. */
export const getOmissionReasonForGrouping = (
  grouping: string,
  omittedDays: Partial<Record<DayType, string>>,
): string => {
  const days = getDaysForGrouping(grouping);
  return days.map((day) => omittedDays[day]).find(Boolean) ?? '';
};

/** Returns true when every missing grouping has a non-empty omission reason. */
export const hasAllOmissionReasons = (
  missingGroupings: string[],
  omittedDays: Partial<Record<DayType, string>>,
): boolean => missingGroupings.every(
  (grouping) => getOmissionReasonForGrouping(grouping, omittedDays).trim().length > 0,
);

interface OmissionReasonsListProps {
  missingGroupings: string[];
  omittedDays: Partial<Record<DayType, string>>;
  onOmitDay: (day: DayType, reason: string) => void;
}

/** Collects acknowledgement reasons for omitted forecast groupings. */
export const OmissionReasonsList: React.FC<OmissionReasonsListProps> = ({
  missingGroupings,
  omittedDays,
  onOmitDay,
}) => {
  if (missingGroupings.length === 0) {
    return null;
  }

  /** Persists the same omission reason across every day in the grouping. */
  const handleReasonChange = (grouping: string, reason: string) => {
    getDaysForGrouping(grouping).forEach((day) => onOmitDay(day, reason));
  };

  return (
    <div className="completion-omission-reasons">
      <h3 className="text-sm font-semibold mt-4 mb-2">Omission Acknowledgements</h3>
      <p className="text-sm text-muted-foreground mb-3">
        Provide a reason for each missing grouping before completing with omissions.
      </p>
      {missingGroupings.map((grouping) => (
        <label key={grouping} className="completion-omission-field">
          <span className="completion-omission-label">{formatGrouping(grouping)}</span>
          <textarea
            className="completion-omission-input"
            rows={2}
            value={getOmissionReasonForGrouping(grouping, omittedDays)}
            onChange={(event) => handleReasonChange(grouping, event.target.value)}
            placeholder={`Why is ${formatGrouping(grouping)} being omitted?`}
          />
        </label>
      ))}
    </div>
  );
};

interface CompletionValidationModalBodyProps {
  isComplete: boolean;
  issues: ValidationIssue[];
  criticalIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
  missingGroupings: string[];
  omittedDays: Partial<Record<DayType, string>>;
  onNavigate: (grouping: string, outlookType: string) => void;
  onOmitDay: (day: DayType, reason: string) => void;
}

/** Renders completion status, missing groupings, and issue lists. */
export const CompletionValidationModalBody: React.FC<CompletionValidationModalBodyProps> = ({
  isComplete,
  issues,
  criticalIssues,
  warningIssues,
  missingGroupings,
  omittedDays,
  onNavigate,
  onOmitDay,
}) => (
  <div className="completion-modal-body">
    {isComplete ? (
      <div className="completion-status-badge completion-status-badge--complete" id="completion-summary">
        <CheckCircle2 className="h-4 w-4" />
        <span>Ready for export</span>
      </div>
    ) : (
      <div className="completion-status-badge completion-status-badge--incomplete" id="completion-summary">
        <AlertTriangle className="h-4 w-4" />
        <span>{criticalIssues.length} item{criticalIssues.length !== 1 ? 's' : ''} missing for completion</span>
      </div>
    )}

    {missingGroupings.length > 0 && (
      <p className="text-sm text-muted-foreground mt-2">
        Missing groupings: {missingGroupings.join(', ')}
      </p>
    )}

    {criticalIssues.length > 0 && (
      <>
        <h3 className="text-sm font-semibold mt-4 mb-2">Critical Issues</h3>
        <MissingItemsList issues={criticalIssues} onNavigate={onNavigate} />
      </>
    )}

    {warningIssues.length > 0 && (
      <>
        <h3 className="text-sm font-semibold mt-4 mb-2">Warnings</h3>
        <MissingItemsList issues={warningIssues} onNavigate={onNavigate} />
      </>
    )}

    {!isComplete && (
      <OmissionReasonsList
        missingGroupings={missingGroupings}
        omittedDays={omittedDays}
        onOmitDay={onOmitDay}
      />
    )}

    {issues.length === 0 && (
      <div className="completion-modal-empty">
        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
        <p>All outlooks are complete and discussions are present.</p>
      </div>
    )}
  </div>
);

interface CompletionValidationModalFooterProps {
  isComplete: boolean;
  canCompleteWithOmissions: boolean;
  onClose: () => void;
  onComplete: () => void;
  onCompleteWithOmissions: () => void;
  onCompleteAndExport?: () => void;
}

/** Renders completion modal action buttons for cancel and finalize flows. */
export const CompletionValidationModalFooter: React.FC<CompletionValidationModalFooterProps> = ({
  isComplete,
  canCompleteWithOmissions,
  onClose,
  onComplete,
  onCompleteWithOmissions,
  onCompleteAndExport,
}) => (
  <DialogFooter className="completion-modal-footer">
    <Button type="button" variant="outline" onClick={onClose}>
      Cancel
    </Button>
    {!isComplete && (
      <Button
        type="button"
        variant="warning"
        onClick={onCompleteWithOmissions}
        disabled={!canCompleteWithOmissions}
      >
        Complete with Omissions
      </Button>
    )}
    {isComplete && onCompleteAndExport ? (
      <Button type="button" onClick={onCompleteAndExport}>
        Mark Reviewed & Export
      </Button>
    ) : null}
    <Button type="button" variant={isComplete ? 'default' : 'warning'} onClick={onComplete}>
      {isComplete ? 'Mark Reviewed' : 'Complete Anyway'}
    </Button>
  </DialogFooter>
);
