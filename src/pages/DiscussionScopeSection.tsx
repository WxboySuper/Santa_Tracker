import React, { useState } from 'react';
import type { DiscussionGrouping } from '../types/outlooks';

interface DiscussionScopeSectionProps {
  groupings: DiscussionGrouping[];
  selectedGrouping: DiscussionGrouping;
  onSelect: (groupingId: string) => void;
  onCombine: (groupings: DiscussionGrouping[], label: string) => void;
  onReset: () => void;
}

/** Keeps workflow discussion scopes explicit while leaving content on one canonical legacy day. */
const DiscussionScopeSection: React.FC<DiscussionScopeSectionProps> = ({
  groupings,
  selectedGrouping,
  onSelect,
  onCombine,
  onReset,
}) => {
  const [combineIds, setCombineIds] = useState<string[]>([]);
  const [label, setLabel] = useState('');

  if (groupings.length <= 1) return null;

  /** Toggles whether a grouping participates in the combine operation. */
  const toggleGrouping = (id: string) => {
    setCombineIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  };

  /** Combines the selected discussion groupings and resets the local combine form. */
  const handleCombine = () => {
    const selected = groupings.filter((grouping) => combineIds.includes(grouping.id));
    if (selected.length < 2) return;
    onCombine(selected, label.trim() || selected.map((grouping) => grouping.label).join(' + '));
    setCombineIds([]);
    setLabel('');
  };

  return (
    <section className="discussion-scope-section" aria-label="Discussion scope">
      <div className="discussion-scope-main">
        <div>
          <p className="discussion-scope-eyebrow">Workflow discussion scope</p>
          <p className="discussion-scope-help">Use one discussion per outlook by default, or combine outlooks into one scope.</p>
        </div>
        <select
          aria-label="Discussion scope"
          value={selectedGrouping.id}
          onChange={(event) => onSelect(event.target.value)}
          className="discussion-scope-select"
        >
          {groupings.map((grouping) => (
            <option key={grouping.id} value={grouping.id}>{grouping.label}</option>
          ))}
        </select>
      </div>
      <details className="discussion-scope-combine">
        <summary>Combine scopes</summary>
        <div className="discussion-scope-combine-body">
          <div className="discussion-scope-checkboxes">
            {groupings.map((grouping) => (
              <label key={grouping.id}>
                <input
                  type="checkbox"
                  checked={combineIds.includes(grouping.id)}
                  onChange={() => toggleGrouping(grouping.id)}
                />
                {grouping.label}
              </label>
            ))}
          </div>
          <input
            aria-label="Combined discussion label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Optional combined label"
          />
          <button type="button" onClick={handleCombine} disabled={combineIds.length < 2}>
            Combine selected
          </button>
          <button type="button" className="discussion-scope-reset" onClick={onReset}>
            Use one per outlook
          </button>
        </div>
      </details>
    </section>
  );
};

export default DiscussionScopeSection;
