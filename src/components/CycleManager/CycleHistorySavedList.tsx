import React from 'react';
import type { SavedCycle } from '../../store/forecastSlice';
import { getDaySummary } from './cycleHistoryModalUtils';

interface CycleHistorySavedItemProps {
  cycle: SavedCycle;
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Renders one saved cycle row with load and delete actions. */
const CycleHistorySavedItem: React.FC<CycleHistorySavedItemProps> = ({
  cycle,
  onLoadClick,
  onDeleteClick,
}) => (
  <div className="history-item">
    <div className="history-item-info">
      <div className="history-item-date">
        📅 {new Date(cycle.cycleDate).toLocaleDateString()}
        {cycle.label && <span className="history-item-label">{cycle.label}</span>}
      </div>
      <div className="history-item-meta">
        <span className="history-item-saved">Saved: {new Date(cycle.timestamp).toLocaleString()}</span>
        <span className="history-item-summary">{getDaySummary(cycle)}</span>
      </div>
    </div>
    <div className="history-item-actions">
      <button
        className="history-btn-load"
        data-cycle-id={cycle.id}
        onClick={onLoadClick}
        title="Load this cycle"
      >
        Load
      </button>
      <button
        className="history-btn-delete"
        data-cycle-id={cycle.id}
        onClick={onDeleteClick}
        title="Delete this cycle"
      >
        🗑️
      </button>
    </div>
  </div>
);

interface CycleHistorySavedListProps {
  savedCycles: SavedCycle[];
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Renders the saved-cycle list or an empty-state message. */
const CycleHistorySavedList: React.FC<CycleHistorySavedListProps> = ({
  savedCycles,
  onLoadClick,
  onDeleteClick,
}) => {
  if (savedCycles.length === 0) {
    return (
      <div className="history-empty-state">
        <h3>Saved Cycles (0)</h3>
        <p>No saved cycles yet.</p>
        <p>Save your current cycle to build up a history for reference.</p>
      </div>
    );
  }

  const sortedCycles = savedCycles
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="history-list-section">
      <h3>Saved Cycles ({savedCycles.length})</h3>
      <div className="history-list">
      {sortedCycles.map((cycle) => (
        <CycleHistorySavedItem
          key={cycle.id}
          cycle={cycle}
          onLoadClick={onLoadClick}
          onDeleteClick={onDeleteClick}
        />
      ))}
      </div>
    </div>
  );
};

export default CycleHistorySavedList;
