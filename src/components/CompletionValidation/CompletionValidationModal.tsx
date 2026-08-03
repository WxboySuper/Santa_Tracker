// skipcq: JS-W1028
import React, { useCallback } from 'react';
import type { CycleValidationResult } from '../../types/workflow';
import type { DayType, OutlookType } from '../../types/outlooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  CompletionValidationModalBody,
  CompletionValidationModalFooter,
  hasAllOmissionReasons,
} from './CompletionValidationModalSections';
import './CompletionValidationModal.css';

interface CompletionValidationModalProps {
  isOpen: boolean;
  validationResult: CycleValidationResult | null;
  omittedDays: Partial<Record<DayType, string>>;
  onClose: () => void;
  onComplete: () => void;
  onCompleteWithOmissions: () => void;
  onOmitDay: (day: DayType, reason: string) => void;
  onNavigateToIssue?: (day: DayType, outlookType: OutlookType) => void;
  onExport?: () => void;
}

/** Maps a validation grouping key to its primary forecast day number. */
const getGroupingDay = (grouping: string): DayType | null => {
  switch (grouping) {
    case 'day1': return 1;
    case 'day2': return 2;
    case 'day3': return 3;
    case 'day4-8': return 4;
    default: return null;
  }
};

/** Renders the completion validation modal when cycle review is requested. */
export const CompletionValidationModal: React.FC<CompletionValidationModalProps> = ({
  isOpen,
  validationResult,
  omittedDays,
  onClose,
  onComplete,
  onCompleteWithOmissions,
  onOmitDay,
  onNavigateToIssue,
  onExport,
}) => {
  const handleNavigate = useCallback(
    (grouping: string, outlookType: string) => {
      if (!onNavigateToIssue) return;
      const day = getGroupingDay(grouping);
      if (day) {
        onNavigateToIssue(day, outlookType as OutlookType);
      }
    },
    [onNavigateToIssue],
  );

  if (!isOpen || !validationResult) return null;

  const { isComplete, issues, missingGroupings } = validationResult;
  const criticalIssues = issues.filter((issue) => issue.severity === 'critical');
  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const canCompleteWithOmissions = hasAllOmissionReasons(missingGroupings, omittedDays);

/** Completes the forecast review and starts the optional export flow. */
function handleCompleteAndExport(): void {
  onComplete();
  onExport?.();
}

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="completion-modal" aria-describedby="completion-summary">
        <DialogHeader className="completion-modal-header">
          <DialogTitle id="completion-title">Review Package</DialogTitle>
          <DialogDescription>
            Confirm the outlook map and discussion before exporting the workflow bundle.
          </DialogDescription>
        </DialogHeader>
        <CompletionValidationModalBody
          isComplete={isComplete}
          issues={issues}
          criticalIssues={criticalIssues}
          warningIssues={warningIssues}
          missingGroupings={missingGroupings}
          omittedDays={omittedDays}
          onNavigate={handleNavigate}
          onOmitDay={onOmitDay}
        />

        <CompletionValidationModalFooter
          isComplete={isComplete}
          canCompleteWithOmissions={canCompleteWithOmissions}
          onClose={onClose}
          onComplete={onComplete}
          onCompleteWithOmissions={onCompleteWithOmissions}
          onCompleteAndExport={onExport ? handleCompleteAndExport : undefined}
        />
      </DialogContent>
    </Dialog>
  );
};

export default CompletionValidationModal;
