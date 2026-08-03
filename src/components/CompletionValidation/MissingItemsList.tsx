// skipcq: JS-W1028
import React from 'react';
import type { ValidationIssue } from '../../types/workflow';

interface MissingItemsListProps {
  issues: ValidationIssue[];
  onNavigate?: (day: string, outlookType: string) => void;
}

/** Formats a workflow grouping key for display in the issues list. */
const formatGrouping = (grouping: string): string => {
  switch (grouping) {
    case 'day1': return 'Day 1';
    case 'day2': return 'Day 2';
    case 'day3': return 'Day 3';
    case 'day4-8': return 'Days 4-8';
    default: return grouping;
  }
};

/** Renders validation issues with optional navigation actions. */
export const MissingItemsList: React.FC<MissingItemsListProps> = ({ issues, onNavigate }) => {
  if (issues.length === 0) return null;

  return (
    <div className="completion-issues-list">
      {issues.map((issue) => (
        <div
          key={`${issue.day}-${issue.outlookType}-${issue.type}-${issue.message}`}
          className={`completion-issue-item completion-issue-item--${issue.severity}`}
        >
          <div className="completion-issue-info">
            <div className="completion-issue-day">{formatGrouping(issue.day)}</div>
            <div className="completion-issue-message">{issue.message}</div>
          </div>
          {issue.canNavigate && onNavigate && (
            <button
              type="button"
              className="completion-issue-nav-btn"
              onClick={() => onNavigate(issue.day, issue.outlookType)}
            >
              Go
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default MissingItemsList;
