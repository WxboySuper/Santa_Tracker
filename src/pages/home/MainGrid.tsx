import React from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clock3, History, Layers3, Map, Save, Upload } from 'lucide-react';
import type { DayType, ForecastCycle } from '../../types/outlooks';
import type { CycleMetadata, WorkflowMetadata } from '../../types/workflow';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import type { HomeVariant } from './HomeHero';

interface HomeStats {
  daysWithData: DayType[];
  totalOutlooks: number;
  totalFeatures: number;
  savedCyclesCount: number;
  totalForecastsMade: number;
  totalCyclesMade: number;
  forecastStreak: number;
}

interface Props {
  variant: HomeVariant;
  formattedDate: string;
  isSaved: boolean;
  forecastCycle: ForecastCycle;
  workflowMetadata?: CycleMetadata;
  hasActiveWorkflow: boolean;
  stats: HomeStats;
  onQuickStartClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onNewCycle: () => void;
  onStartWorkflow: (workflowTemplate: WorkflowMetadata) => void;
  onCreateWorkflowUpdate: () => void;
  onSave: () => void;
  onOpenFile: () => void;
  onOpenHistory: () => void;
}

/** Header copy for the main current-cycle card. */
const getWorkspaceCopy = (variant: HomeVariant) => {
  if (variant === 'signed_in') {
    return {
      description: 'Resume the package already in progress, switch days, or jump into the next step without losing context.',
      primaryAction: 'Continue Forecast',
    };
  }

  return {
    description: 'Start here whether you are sketching a fresh package or reopening older local work.',
    primaryAction: 'Open Forecast Map',
  };
};

/** Compact stat tile used to keep the current-cycle card informative without dashboard clutter. */
const WorkspaceStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="home-workspace-stat">
    <div className="home-workspace-stat-label">
      {icon}
      {label}
    </div>
    <p>{value}</p>
  </div>
);

/** Header showing the current cycle and save state. */
const CurrentCycleHeader: React.FC<{
  variant: HomeVariant;
  formattedDate: string;
  isSaved: boolean;
}> = ({ variant, formattedDate, isSaved }) => {
  const copy = getWorkspaceCopy(variant);

  return (
    <CardHeader className="home-workspace-header">
      <div className="home-workspace-header-top">
        <div className="home-workspace-copy">
          <CardTitle className="text-2xl">Current Forecast Cycle</CardTitle>
          <CardDescription className="max-w-2xl">{copy.description}</CardDescription>
        </div>
        <div className="home-save-pill">
          <span className={cn('home-save-pill-label', isSaved ? 'text-success' : 'text-warning')}>
            {isSaved ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {isSaved ? 'Saved locally' : 'Unsaved changes'}
          </span>
        </div>
      </div>

      <div className="home-date-pill">
        <Clock3 className="h-4 w-4 text-primary" />
        {formattedDate}
      </div>
    </CardHeader>
  );
};

/** Individual day button for jumping directly into a forecast day. */
const DayButton: React.FC<{
  day: number;
  hasData: boolean;
  isCurrent: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ day, hasData, isCurrent, onClick }) => (
  <button
    type="button"
    data-day={day}
    onClick={onClick}
    className={cn('home-day-button', hasData && 'is-populated', isCurrent && 'is-current')}
  >
    <div className="home-day-button-content">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Day</p>
      <p className="text-2xl font-bold text-foreground">{day}</p>
      <p className="text-xs text-muted-foreground">{hasData ? 'Outlooks started' : 'Ready to edit'}</p>
    </div>
  </button>
);

/** Selector for the active forecast day. */
const CycleDayGrid: React.FC<{
  daysWithData: DayType[];
  currentDay: number;
  onDayClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ daysWithData, currentDay, onDayClick }) => (
  <div className="space-y-3">
    <div className="home-day-grid-header">
      <h3>Jump to a forecast day</h3>
      <p>Pick a day below to head straight into the map editor.</p>
    </div>

    <div className="home-day-grid">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => (
        <DayButton
          key={day}
          day={day}
          hasData={daysWithData.includes(day as DayType)}
          isCurrent={currentDay === day}
          onClick={onDayClick}
        />
      ))}
    </div>
  </div>
);

/** Secondary utility actions for file and cycle management. */
const UtilityActions: React.FC<{
  onNewCycle: () => void;
  onSave: () => void;
  onOpenFile: () => void;
  onOpenHistory: () => void;
}> = ({ onNewCycle, onSave, onOpenFile, onOpenHistory }) => (
  <div className="home-utility-card">
    <div className="home-day-grid-header">
      <h3>Cycle tools</h3>
      <p>Keep the package moving without leaving the landing page.</p>
    </div>

    <div className="home-utility-grid">
      <Button variant="outline" className="home-utility-button justify-start rounded-xl" onClick={onNewCycle}>
        <Calendar className="h-4 w-4 mr-2" />
        Start New Cycle
      </Button>
      <Button
        variant="outline"
        className="home-utility-button home-utility-button-primary justify-start rounded-xl"
        onClick={onSave}
      >
        <Save className="h-4 w-4 mr-2" />
        Save Cycle File
      </Button>
      <Button variant="outline" className="home-utility-button justify-start rounded-xl" onClick={onOpenFile}>
        <Upload className="h-4 w-4 mr-2" />
        Load From File
      </Button>
      <Button variant="outline" className="home-utility-button justify-start rounded-xl" onClick={onOpenHistory}>
        <History className="h-4 w-4 mr-2" />
        Open Cycle History
      </Button>
    </div>
  </div>
);

/** Workflow-first card for the current cycle and the most common forecast actions. */
export const MainGrid: React.FC<Props> = ({
  variant,
  formattedDate,
  isSaved,
  forecastCycle,
  stats,
  onQuickStartClick,
  onNewCycle,
  onSave,
  onOpenFile,
  onOpenHistory,
}) => (
  <Card className="home-surface-card">
    <CurrentCycleHeader variant={variant} formattedDate={formattedDate} isSaved={isSaved} />

    <CardContent className="home-main-content">
      <div className="home-main-stats-grid">
        <WorkspaceStat
          icon={<Clock3 className="h-4 w-4 text-primary" />}
          label="Active day"
          value={`Day ${forecastCycle.currentDay}`}
        />
        <WorkspaceStat
          icon={<Map className="h-4 w-4 text-primary" />}
          label="Days with outlooks"
          value={`${stats.daysWithData.length}`}
        />
        <WorkspaceStat
          icon={<Layers3 className="h-4 w-4 text-primary" />}
          label="Mapped outlooks"
          value={`${stats.totalOutlooks}`}
        />
      </div>

      <CycleDayGrid
        daysWithData={stats.daysWithData}
        currentDay={forecastCycle.currentDay}
        onDayClick={onQuickStartClick}
      />

      <UtilityActions
        onNewCycle={onNewCycle}
        onSave={onSave}
        onOpenFile={onOpenFile}
        onOpenHistory={onOpenHistory}
      />
    </CardContent>
  </Card>
);

export default MainGrid;
