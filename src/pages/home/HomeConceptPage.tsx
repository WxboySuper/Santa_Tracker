import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  Edit3,
  FileText,
  Folder,
  History,
  Lock,
  Map,
  MessageSquare,
  MoreVertical,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle, OutlookDay } from '../../types/outlooks';
import { DEFAULT_WORKFLOW_TEMPLATES } from '../../components/ForecastWorkflow/workflowTemplates';
import type { CycleMetadata, WorkflowMetadata } from '../../types/workflow';

type HomeConceptVariant = 'signed_in' | 'signed_out';

interface HomeConceptPageProps {
  variant: HomeConceptVariant;
  formattedDate: string;
  savedCycles: SavedCycle[];
  forecastCycle: ForecastCycle;
  workflowMetadata?: CycleMetadata;
  workflowEnabled: boolean;
  hasActiveWorkflow: boolean;
  isSaved: boolean;
  onResumeForecast: () => void;
  onWriteDiscussion: () => void;
  onOpenHistory: () => void;
  onOpenFile: () => void;
  onNewCycle: () => void;
  onStartWorkflow: (workflowTemplate: WorkflowMetadata) => void;
  onCreateWorkflowUpdate: () => void;
  onLoadRecentCycle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onNavigateAccount: () => void;
}

const featureItems = [
  {
    icon: Map,
    title: 'Interactive mapping',
    body: 'Draw, edit, and refine with intuitive mapping tools.',
  },
  {
    icon: MessageSquare,
    title: 'Discuss & collaborate',
    body: 'Share your thoughts and get feedback when you are ready.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify with confidence',
    body: 'Use built-in verification tools to improve accuracy and consistency.',
  },
];

/** Returns whether a forecast day contains any map work. */
function dayHasMapWork(day?: OutlookDay): boolean {
  if (!day) return false;
  const hasOutlookFeatures = Object.values(day.data).some((outlookMap) => (outlookMap?.size ?? 0) > 0);
  return hasOutlookFeatures || (day.metadata.lowProbabilityOutlooks?.length ?? 0) > 0;
}

/** Returns whether a forecast day contains any discussion content. */
function dayHasDiscussion(day?: OutlookDay): boolean {
  const discussion = day?.discussion;
  if (!discussion) return false;
  if (discussion.mode === 'diy') return Boolean(discussion.diyContent?.trim());
  return Boolean(discussion.guidedContent && Object.values(discussion.guidedContent).some((value) => value.trim()));
}

/** Returns the readable label for the active workflow template. */
function getWorkflowLabel(workflowMetadata?: CycleMetadata, currentDay?: number): string {
  return DEFAULT_WORKFLOW_TEMPLATES.find((template) => template.id === workflowMetadata?.workflowId)?.label
    ?? workflowMetadata?.workflowId
    ?? `Day ${currentDay ?? 1} workflow`;
}

const workflowStartLabels: Record<string, string> = {
  'severe-day1': 'Day 1',
  'severe-day2': 'Day 2',
  'severe-day3': 'Day 3',
  'severe-day4-8': 'Days 4-8',
  'convective-outlook': 'Full Outlook',
};

const accountBenefits = [
  {
    icon: Map,
    title: 'Track your forecasts',
    body: 'View your forecast history and statistics to measure your progress.',
    badge: 'Free',
  },
  {
    icon: Upload,
    title: 'Sync across devices',
    body: 'Keep your settings in sync and access your forecasts anywhere.',
    badge: 'Premium',
  },
];

/** Formats a saved cycle timestamp for the recent-cycle timeline. */
const formatRecentTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Saved recently';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** Returns a friendly time-of-day label for a saved cycle timestamp. */
const getCyclePeriod = (timestamp: string) => {
  const hour = new Date(timestamp).getHours();
  if (Number.isNaN(hour)) {
    return 'Cycle';
  }
  if (hour < 12) {
    return 'Morning';
  }
  if (hour < 18) {
    return 'Afternoon';
  }
  return 'Evening';
};

/** Decorative contour-line background used by the home concept layout. */
const ConceptBackground: React.FC = () => (
  <div className="home-concept-map-bg" aria-hidden="true">
    <svg viewBox="0 0 1100 420" preserveAspectRatio="none">
      <path d="M0 300 C140 210 205 415 350 320 C490 226 605 380 760 292 C895 215 1005 282 1100 210" />
      <path d="M0 335 C115 260 220 440 375 350 C525 262 610 398 790 324 C928 267 1015 325 1100 250" />
      <path d="M0 255 C130 160 220 360 360 266 C500 172 590 320 750 248 C895 184 1000 238 1100 168" />
      <path d="M0 390 C128 300 230 485 390 390 C545 306 660 438 820 362 C955 296 1040 360 1100 310" />
    </svg>
  </div>
);

/** Reusable large action button for the concept hero areas. */
const HeroActionButton: React.FC<{
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  onClick: () => void;
  primary?: boolean;
}> = ({ icon: Icon, label, sublabel, onClick, primary }) => (
  <button
    type="button"
    className={primary ? 'home-concept-action home-concept-action-primary' : 'home-concept-action'}
    onClick={onClick}
  >
    <Icon className="h-5 w-5" />
    <span>
      <strong>{label}</strong>
      {sublabel && <small>{sublabel}</small>}
    </span>
    <ArrowRight className="h-5 w-5 home-concept-action-arrow" />
  </button>
);

/** Single saved-cycle row in the recent-cycle timeline. */
const RecentCycleButton: React.FC<{
  cycle: SavedCycle;
  isActive: boolean;
  onLoad: (event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ cycle, isActive, onLoad }) => (
  <button
    type="button"
    className="home-concept-cycle-row"
    data-cycle-id={cycle.id}
    onClick={onLoad}
  >
    <span className={isActive ? 'home-concept-dot is-active' : 'home-concept-dot'} />
    <span className="home-concept-cycle-copy">
      <strong>{cycle.cycleDate}</strong>
      <small>{formatRecentTimestamp(cycle.timestamp)}</small>
      <small>{getCyclePeriod(cycle.timestamp)}</small>
    </span>
    {isActive ? <span className="home-concept-resume">Resume</span> : null}
    <ArrowRight className="h-4 w-4" />
  </button>
);

/** Lists the most recent saved cycles and exposes the full history action. */
const RecentTimeline: React.FC<{
  cycles: SavedCycle[];
  onLoad: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenHistory: () => void;
}> = ({ cycles, onLoad, onOpenHistory }) => {
  const recentCycles = cycles.slice(0, 5);

  return (
    <section className="home-concept-recent" aria-labelledby="recent-cycles-title">
      <h2 id="recent-cycles-title">Recent Cycles</h2>
      {recentCycles.length > 0 ? (
        <div className="home-concept-timeline">
          {recentCycles.map((cycle, index) => (
            <RecentCycleButton cycle={cycle} isActive={index === 0} key={cycle.id} onLoad={onLoad} />
          ))}
        </div>
      ) : (
        <p className="home-concept-muted">Saved cycles will appear here once you create or load a forecast.</p>
      )}
      <button type="button" className="home-concept-link" onClick={onOpenHistory}>
        View full history
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
};

/** Shows quick cycle facts for the signed-in concept sidebar. */
const AtAGlance: React.FC<{
  formattedDate: string;
  savedCyclesCount: number;
  hasSavedCycles: boolean;
}> = ({ formattedDate, savedCyclesCount, hasSavedCycles }) => (
  <section className="home-concept-glance" aria-labelledby="at-a-glance-title">
    <h2 id="at-a-glance-title">At A Glance</h2>
    <dl>
      <div>
        <dt><Clock3 className="h-5 w-5" />Today</dt>
        <dd>{formattedDate}</dd>
      </div>
      <div>
        <dt><History className="h-5 w-5" />Saved cycles</dt>
        <dd>{savedCyclesCount}</dd>
      </div>
      <div>
        <dt><FileText className="h-5 w-5" />Cycle status</dt>
        <dd>{hasSavedCycles ? 'History available' : 'Ready to draw'}</dd>
      </div>
    </dl>
  </section>
);

/** Top active-cycle action bar for signed-in users. */
const SignedInCycleBar: React.FC<{
  formattedDate: string;
  isSaved: boolean;
  onResumeForecast: () => void;
  onOpenHistory: () => void;
}> = ({ formattedDate, isSaved, onResumeForecast, onOpenHistory }) => (
  <section className="home-concept-cycle-bar" aria-label="Active cycle">
    <div className="home-concept-cycle-meta">
      <span className="home-concept-icon-chip"><Calendar className="h-5 w-5" /></span>
      <div>
        <p>Active cycle</p>
        <h1>{formattedDate}</h1>
      </div>
      {!isSaved && <span className="home-concept-unsaved">Unsaved changes</span>}
    </div>
    <div className="home-concept-cycle-actions">
      <button type="button" className="home-concept-top-primary" onClick={onResumeForecast}>
        Resume Forecast
        <ArrowRight className="h-5 w-5" />
      </button>
      <button type="button" className="home-concept-top-secondary" onClick={onOpenHistory}>
        <Calendar className="h-5 w-5" />
        Switch Day
      </button>
      <button type="button" className="home-concept-top-secondary" onClick={onOpenHistory}>
        <MoreVertical className="h-5 w-5" />
        More
      </button>
    </div>
  </section>
);

interface SignedInWorkflowPanelProps {
  forecastCycle: ForecastCycle;
  workflowMetadata?: CycleMetadata;
  workflowEnabled: boolean;
  hasActiveWorkflow: boolean;
  onResumeForecast: () => void;
  onWriteDiscussion: () => void;
  onOpenFile: () => void;
  onStartWorkflow: (workflowTemplate: WorkflowMetadata) => void;
  onCreateWorkflowUpdate: () => void;
}

interface WorkflowNextAction {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}

/** Chooses the next editor action for the active workflow state. */
function getWorkflowNextAction(
  mapStarted: boolean,
  discussionStarted: boolean,
  onWriteDiscussion: () => void,
  onResumeForecast: () => void,
): WorkflowNextAction {
  if (mapStarted && !discussionStarted) {
    return { icon: MessageSquare, label: 'Write Discussion', onClick: onWriteDiscussion };
  }
  return { icon: PlayCircle, label: 'Continue Map', onClick: onResumeForecast };
}

/** Renders workflow scope buttons when no workflow is active. */
const SignedInWorkflowStartPanel: React.FC<Pick<SignedInWorkflowPanelProps, 'workflowEnabled' | 'onOpenFile' | 'onStartWorkflow'>> = ({
  workflowEnabled,
  onOpenFile,
  onStartWorkflow,
}) => (
  <section className="home-concept-continue">
    <h2>
      <span>Continue your</span>
      <span className="home-concept-heading-line">forecast <Zap className="h-10 w-10" /></span>
    </h2>
    <p>Start a forecast workflow by scope, or upload a workflow package from your device.</p>
    <div className="home-concept-workflow-start-grid" aria-label="Start workflow">
      {DEFAULT_WORKFLOW_TEMPLATES.map((template) => (
        <button type="button" key={template.id} className="home-concept-workflow-start" onClick={() => onStartWorkflow(template)} disabled={!workflowEnabled}>
          {workflowStartLabels[template.id] ?? template.label}
        </button>
      ))}
    </div>
    <div className="home-concept-workflow-inline-actions">
      <button type="button" onClick={onOpenFile}>
        <Upload className="h-4 w-4" />
        Upload workflow
      </button>
    </div>
  </section>
);

/** Renders status and actions when a workflow is active. */
const SignedInWorkflowActivePanel: React.FC<SignedInWorkflowPanelProps> = ({
  forecastCycle,
  workflowMetadata,
  workflowEnabled,
  onResumeForecast,
  onWriteDiscussion,
  onOpenFile,
  onStartWorkflow,
  onCreateWorkflowUpdate,
}) => {
  const activeDay = forecastCycle.days[forecastCycle.currentDay];
  const mapStarted = dayHasMapWork(activeDay);
  const discussionStarted = dayHasDiscussion(activeDay);
  const nextAction = getWorkflowNextAction(mapStarted, discussionStarted, onWriteDiscussion, onResumeForecast);
  const NextActionIcon = nextAction.icon;

  return (
    <section className="home-concept-continue">
      <h2>
        <span>Continue your</span>
        <span className="home-concept-heading-line">forecast <Zap className="h-10 w-10" /></span>
      </h2>
      <p>
        {getWorkflowLabel(workflowMetadata, forecastCycle.currentDay)} is {workflowMetadata?.status ?? 'draft'}.
        {' '}Day {forecastCycle.currentDay}: map {mapStarted ? 'started' : 'not started'}, discussion {discussionStarted ? 'started' : 'not started'}.
      </p>
      <div className="home-concept-workflow-status" aria-label="Workflow status">
        <span className={mapStarted ? 'is-complete' : 'is-active'}>Map</span>
        <span className={discussionStarted ? 'is-complete' : mapStarted ? 'is-active' : ''}>Discussion</span>
        <span className={mapStarted && discussionStarted ? 'is-complete' : ''}>Complete</span>
      </div>
      <div className="home-concept-workflow-active-actions">
        <button type="button" className="is-primary" onClick={nextAction.onClick}>
          <NextActionIcon className="h-4 w-4" />
          {nextAction.label}
        </button>
        <button type="button" onClick={onCreateWorkflowUpdate} disabled={!workflowEnabled}>
          <RefreshCw className="h-4 w-4" />
          Create update
        </button>
        <button type="button" onClick={onOpenFile}>
          <Upload className="h-4 w-4" />
          Upload workflow
        </button>
      </div>
      <div className="home-concept-workflow-new-row" aria-label="Start new workflow">
        {DEFAULT_WORKFLOW_TEMPLATES.map((template) => (
          <button type="button" key={template.id} onClick={() => onStartWorkflow(template)} disabled={!workflowEnabled}>
            {workflowStartLabels[template.id] ?? template.label}
          </button>
        ))}
      </div>
    </section>
  );
};

/** Main signed-in hero panel with resume, history, and new-cycle actions. */
const SignedInContinuePanel: React.FC<SignedInWorkflowPanelProps> = (props) => {
  if (!props.hasActiveWorkflow) {
    return <SignedInWorkflowStartPanel {...props} />;
  }
  return <SignedInWorkflowActivePanel {...props} />;
};

/** Signed-in concept home screen. */
const SignedInConcept: React.FC<HomeConceptPageProps> = ({
  formattedDate,
  savedCycles,
  forecastCycle,
  workflowMetadata,
  workflowEnabled,
  hasActiveWorkflow,
  isSaved,
  onResumeForecast,
  onWriteDiscussion,
  onOpenHistory,
  onOpenFile,
  onStartWorkflow,
  onCreateWorkflowUpdate,
  onLoadRecentCycle,
}) => (
  <main className="home-concept-shell home-concept-shell-signed-in">
    <ConceptBackground />
    <SignedInCycleBar
      formattedDate={formattedDate}
      isSaved={isSaved}
      onResumeForecast={onResumeForecast}
      onOpenHistory={onOpenHistory}
    />

    <div className="home-concept-signed-in-grid">
      <SignedInContinuePanel
        forecastCycle={forecastCycle}
        workflowMetadata={workflowMetadata}
        workflowEnabled={workflowEnabled}
        hasActiveWorkflow={hasActiveWorkflow}
        onResumeForecast={onResumeForecast}
        onWriteDiscussion={onWriteDiscussion}
        onOpenFile={onOpenFile}
        onStartWorkflow={onStartWorkflow}
        onCreateWorkflowUpdate={onCreateWorkflowUpdate}
      />
      <aside className="home-concept-side-rail">
        <AtAGlance
          formattedDate={formattedDate}
          savedCyclesCount={savedCycles.length}
          hasSavedCycles={savedCycles.length > 0}
        />
        <RecentTimeline cycles={savedCycles} onLoad={onLoadRecentCycle} onOpenHistory={onOpenHistory} />
      </aside>
    </div>
  </main>
);

/** Signed-out hero panel with start, load, and account entry points. */
const SignedOutHero: React.FC<{
  onResumeForecast: () => void;
  onOpenFile: () => void;
  onNavigateAccount: () => void;
}> = ({ onResumeForecast, onOpenFile, onNavigateAccount }) => (
  <section className="home-concept-landing-hero">
    <h1>
      <span>Create forecasts.</span>
      <span className="home-concept-heading-line">Your way. <Zap className="h-12 w-12" /></span>
    </h1>
    <p>Draw, organize, and verify forecasts faster with intuitive mapping tools built for weather forecasters.</p>
    <div className="home-concept-pill">
      <Sparkles className="h-4 w-4" />
      No account required - start forecasting right away.
    </div>
    <div className="home-concept-start-row">
      <HeroActionButton icon={Edit3} label="Start a new forecast" sublabel="Jump right in" onClick={onResumeForecast} primary />
      <HeroActionButton icon={Folder} label="Open a saved forecast" sublabel="From your device" onClick={onOpenFile} />
    </div>
    <div className="home-concept-account-strip">
      <span className="home-concept-icon-chip"><Map className="h-6 w-6" /></span>
      <div>
        <strong>Create a free account to track your forecasts</strong>
        <p>See your history, view statistics, and access your work anywhere.</p>
      </div>
      <button type="button" className="home-concept-link" onClick={onNavigateAccount}>
        Create a free account
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
    <div className="home-concept-quick-notes">
      <span><CheckCircle2 className="h-4 w-4" />Always free to forecast</span>
      <span><BarChart3 className="h-4 w-4" />Track your performance</span>
      <span><Upload className="h-4 w-4" />Sync settings across devices</span>
    </div>
  </section>
);

/** Single tool feature row in the signed-out rail. */
const FeatureItem: React.FC<{
  icon: React.ElementType;
  title: string;
  body: string;
}> = ({ icon: Icon, title, body }) => (
  <div className="home-concept-feature">
    <span className="home-concept-icon-chip"><Icon className="h-8 w-8" /></span>
    <div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  </div>
);

/** Single account benefit row in the signed-out rail. */
const AccountBenefitItem: React.FC<{
  icon: React.ElementType;
  title: string;
  body: string;
  badge: string;
}> = ({ icon: Icon, title, body, badge }) => (
  <div className="home-concept-benefit">
    <span className="home-concept-icon-chip"><Icon className="h-6 w-6" /></span>
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
    <span className="home-concept-badge">{badge}</span>
  </div>
);

/** Supporting signed-out feature and account benefit rail. */
const SignedOutToolRail: React.FC<{
  onNavigateAccount: () => void;
}> = ({ onNavigateAccount }) => (
  <aside className="home-concept-tool-rail">
    <section className="home-concept-feature-list">
      <h2>Powerful tools for every step</h2>
      {featureItems.map(({ icon: Icon, title, body }) => (
        <FeatureItem icon={Icon} title={title} body={body} key={title} />
      ))}
    </section>

    <section className="home-concept-account-card">
      <h2>More with an account</h2>
      {accountBenefits.map(({ icon: Icon, title, body, badge }) => (
        <AccountBenefitItem icon={Icon} title={title} body={body} badge={badge} key={title} />
      ))}
      <p>Create an account to unlock these benefits.</p>
      <button type="button" className="home-concept-link" onClick={onNavigateAccount}>
        Create a free account
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>

    <p className="home-concept-privacy"><Lock className="h-4 w-4" />Your data is private. You&apos;re in control.</p>
  </aside>
);

/** Signed-out concept home screen. */
const SignedOutConcept: React.FC<HomeConceptPageProps> = ({
  onResumeForecast,
  onOpenFile,
  onNavigateAccount,
}) => (
  <main className="home-concept-shell home-concept-shell-signed-out">
    <ConceptBackground />
    <div className="home-concept-landing-grid">
      <SignedOutHero
        onResumeForecast={onResumeForecast}
        onOpenFile={onOpenFile}
        onNavigateAccount={onNavigateAccount}
      />
      <SignedOutToolRail onNavigateAccount={onNavigateAccount} />
    </div>
  </main>
);

/** Switches between the signed-in and signed-out home concept variants. */
const HomeConceptPage: React.FC<HomeConceptPageProps> = (props) => (
  <div className="home-concept-page">
    {props.variant === 'signed_in' ? <SignedInConcept {...props} /> : <SignedOutConcept {...props} />}
  </div>
);

export default HomeConceptPage;
