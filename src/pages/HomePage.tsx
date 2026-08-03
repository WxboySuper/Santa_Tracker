import React from 'react';
import CycleHistoryModal from '../components/CycleManager/CycleHistoryModal';
import ConfirmationModal from '../components/DrawingTools/ConfirmationModal';
import HomeHero, { HeroSummaryCard } from './home/HomeHero';
import Dashboard from './home/Dashboard';
import MainGrid from './home/MainGrid';
import RecentCycles from './home/RecentCycles';
import HomeConceptPage from './home/HomeConceptPage';
import './HomePage.css';
import useHomePageLogic from './home/useHomePageLogic';
import AIDisclosure from './home/AIDisclosure';
import { useWorkflowAwareness } from '../hooks/useWorkflowAwarenessSync';
import type { WorkflowAwarenessRecommendation } from '../types/workflowAwareness';
import { isFeatureExposed } from '../config/featureExposure';

const FORECAST_IMPORT_ACCEPT = isFeatureExposed('customProducts') ? '.json,.zip' : '.json';

type HomeLogic = ReturnType<typeof useHomePageLogic>;

type HomeSectionProps = Pick<
  HomeLogic,
  | 'variant'
  | 'stats'
  | 'formattedDate'
  | 'savedCycles'
  | 'forecastCycle'
  | 'workflowMetadata'
  | 'hasActiveWorkflow'
  | 'isSaved'
  | 'handleNavigateForecast'
  | 'handleNavigateDiscussion'
  | 'handleNavigateAccount'
  | 'handleOpenHistoryModal'
  | 'handleQuickStartClick'
  | 'handleNewCycle'
  | 'handleStartWorkflow'
  | 'handleCreateWorkflowUpdate'
  | 'handleSave'
  | 'openFilePicker'
  | 'handleLoadRecentCycleClick'
>;

/** Signed-in layout (extracted to reduce HomePage function length) */
const HomeSignedInSection: React.FC<HomeSectionProps> = ({
  variant,
  stats,
  formattedDate,
  savedCycles,
  forecastCycle,
  workflowMetadata,
  hasActiveWorkflow,
  isSaved,
  handleNavigateForecast,
  handleNavigateDiscussion,
  handleNavigateAccount,
  handleOpenHistoryModal,
  handleQuickStartClick,
  handleNewCycle,
  handleStartWorkflow,
  handleCreateWorkflowUpdate,
  handleSave,
  openFilePicker,
  handleLoadRecentCycleClick,
}) => (
  <div className="home-signed-in-grid">
    <div className="home-signed-in-main">
      <HomeHero
        variant={variant}
        formattedDate={formattedDate}
        hasSavedCycles={savedCycles.length > 0}
        savedCyclesCount={savedCycles.length}
        showSummaryCard={false}
        onStart={handleNavigateForecast}
        onWriteDiscussion={handleNavigateDiscussion}
        onViewAccount={handleNavigateAccount}
        onOpenHistory={handleOpenHistoryModal}
      />

      <div>
        <MainGrid
          variant={variant}
          formattedDate={formattedDate}
          isSaved={isSaved}
          forecastCycle={forecastCycle}
          workflowMetadata={workflowMetadata}
          hasActiveWorkflow={hasActiveWorkflow}
          stats={stats}
          onQuickStartClick={handleQuickStartClick}
          onNewCycle={handleNewCycle}
          onStartWorkflow={handleStartWorkflow}
          onCreateWorkflowUpdate={handleCreateWorkflowUpdate}
          onSave={handleSave}
          onOpenFile={openFilePicker}
          onOpenHistory={handleOpenHistoryModal}
        />
      </div>
    </div>

    <div className="home-signed-in-side">
      <div className="home-surface-card home-home-summary-rail">
        <HeroSummaryCard
          variant={variant}
          formattedDate={formattedDate}
          savedCyclesCount={savedCycles.length}
        />
      </div>
      <RecentCycles
        variant="compact"
        savedCycles={savedCycles}
        onLoad={handleLoadRecentCycleClick}
        onOpenHistory={handleOpenHistoryModal}
      />
    </div>
  </div>
);

/** Signed-out layout (extracted to reduce HomePage function length) */
const HomeSignedOutSection: React.FC<HomeSectionProps> = ({
  variant,
  stats,
  formattedDate,
  savedCycles,
  forecastCycle,
  workflowMetadata,
  hasActiveWorkflow,
  isSaved,
  handleNavigateForecast,
  handleNavigateDiscussion,
  handleNavigateAccount,
  handleOpenHistoryModal,
  handleQuickStartClick,
  handleNewCycle,
  handleStartWorkflow,
  handleCreateWorkflowUpdate,
  handleSave,
  openFilePicker,
  handleLoadRecentCycleClick,
}) => (
  <>
    <HomeHero
      variant={variant}
      formattedDate={formattedDate}
      hasSavedCycles={savedCycles.length > 0}
      savedCyclesCount={savedCycles.length}
      onStart={handleNavigateForecast}
      onWriteDiscussion={handleNavigateDiscussion}
      onViewAccount={handleNavigateAccount}
      onOpenHistory={handleOpenHistoryModal}
    />

    <div className="home-primary-grid home-primary-grid-signed-out">
      <div>
        <MainGrid
          variant={variant}
          formattedDate={formattedDate}
          isSaved={isSaved}
          forecastCycle={forecastCycle}
          workflowMetadata={workflowMetadata}
          hasActiveWorkflow={hasActiveWorkflow}
          stats={stats}
          onQuickStartClick={handleQuickStartClick}
          onNewCycle={handleNewCycle}
          onStartWorkflow={handleStartWorkflow}
          onCreateWorkflowUpdate={handleCreateWorkflowUpdate}
          onSave={handleSave}
          onOpenFile={openFilePicker}
          onOpenHistory={handleOpenHistoryModal}
        />
      </div>
      <Dashboard stats={stats} />
    </div>

    <RecentCycles
      variant="section"
      savedCycles={savedCycles}
      onLoad={handleLoadRecentCycleClick}
      onOpenHistory={handleOpenHistoryModal}
    />
  </>
);


/** Main home page with auth-aware landing variants and a workflow-first forecast layout. */
const LegacyHomePage: React.FC<{ logic: HomeLogic }> = ({ logic }) => {
  const {
    variant,
    stats,
    formattedDate,
    fileInputRef,
    handleFileSelect,
    handleSave,
    handleNavigateForecast,
    handleNavigateDiscussion,
    handleNavigateAccount,
    openFilePicker,
    showHistoryModal,
    confirmNewCycle,
    handleOpenHistoryModal,
    handleCloseHistoryModal,
    handleQuickStartClick,
    handleLoadRecentCycleClick,
    handleConfirmNewCycle,
    handleCancelNewCycle,
    handleNewCycle,
    savedCycles,
    forecastCycle,
    workflowMetadata,
    hasActiveWorkflow,
    isSaved,
  } = logic;

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="home-page-shell">
        {variant === 'signed_in' ? (
          <HomeSignedInSection
            variant={variant}
            stats={stats}
            formattedDate={formattedDate}
            savedCycles={savedCycles}
            forecastCycle={forecastCycle}
            workflowMetadata={workflowMetadata}
            hasActiveWorkflow={hasActiveWorkflow}
            isSaved={isSaved}
            handleNavigateForecast={handleNavigateForecast}
            handleNavigateDiscussion={handleNavigateDiscussion}
            handleNavigateAccount={handleNavigateAccount}
            handleOpenHistoryModal={handleOpenHistoryModal}
            handleQuickStartClick={handleQuickStartClick}
            handleNewCycle={handleNewCycle}
            handleStartWorkflow={logic.handleStartWorkflow}
            handleCreateWorkflowUpdate={logic.handleCreateWorkflowUpdate}
            handleSave={handleSave}
            openFilePicker={openFilePicker}
            handleLoadRecentCycleClick={handleLoadRecentCycleClick}
          />
        ) : (
          <HomeSignedOutSection
            variant={variant}
            stats={stats}
            formattedDate={formattedDate}
            savedCycles={savedCycles}
            forecastCycle={forecastCycle}
            workflowMetadata={workflowMetadata}
            hasActiveWorkflow={hasActiveWorkflow}
            isSaved={isSaved}
            handleNavigateForecast={handleNavigateForecast}
            handleNavigateDiscussion={handleNavigateDiscussion}
            handleNavigateAccount={handleNavigateAccount}
            handleOpenHistoryModal={handleOpenHistoryModal}
            handleQuickStartClick={handleQuickStartClick}
            handleNewCycle={handleNewCycle}
            handleStartWorkflow={logic.handleStartWorkflow}
            handleCreateWorkflowUpdate={logic.handleCreateWorkflowUpdate}
            handleSave={handleSave}
            openFilePicker={openFilePicker}
            handleLoadRecentCycleClick={handleLoadRecentCycleClick}
          />
        )}

        <AIDisclosure />
      </div>

      <input ref={fileInputRef} type="file" accept={FORECAST_IMPORT_ACCEPT} onChange={handleFileSelect} className="hidden" />

      <CycleHistoryModal isOpen={showHistoryModal} onClose={handleCloseHistoryModal} />
      <ConfirmationModal
        isOpen={confirmNewCycle}
        title={logic.pendingWorkflow ? 'Start Workflow' : 'Start Blank Cycle'}
        message={logic.pendingWorkflow
          ? `You have unsaved changes. Start the ${logic.pendingWorkflow.label} workflow and discard the current changes?`
          : 'You have unsaved changes. Start a blank forecast cycle and discard the current changes?'}
        onConfirm={handleConfirmNewCycle}
        onCancel={handleCancelNewCycle}
        confirmLabel={logic.pendingWorkflow ? 'Start Workflow' : 'Start Blank Cycle'}
      />
    </div>
  );
};

/** Shows metadata-only awareness recommendations only when a local cycle can restore them. */
const AwarenessRecommendations: React.FC<{
  recommendations: WorkflowAwarenessRecommendation[];
  savedCycles: HomeLogic['savedCycles'];
  activeWorkflowId?: string;
  onRestore: (savedCycleId?: string) => void;
}> = ({ recommendations, savedCycles, activeWorkflowId, onRestore }) => {
  const visibleRecommendations = recommendations.filter((recommendation) =>
    recommendation.cycleId === activeWorkflowId
    || savedCycles.some((cycle) => cycle.workflowMetadata?.id === recommendation.cycleId),
  );

  if (visibleRecommendations.length === 0) return null;

  return (
    <section className="home-surface-card p-4" aria-labelledby="workflow-awareness-recommendations">
      <h2 id="workflow-awareness-recommendations" className="text-lg font-semibold">Continue a workflow</h2>
      <p className="mt-1 text-sm text-muted-foreground">Metadata awareness found unfinished work. Nothing was downloaded from the cloud.</p>
      <div className="mt-3 grid gap-2">
        {visibleRecommendations.slice(0, 3).map((recommendation) => {
          const localCycle = savedCycles.find((cycle) => cycle.workflowMetadata?.id === recommendation.cycleId);
          return (
            <button
              type="button"
              key={recommendation.cycleId}
              className="flex items-center justify-between rounded-md border p-3 text-left hover:bg-muted/40"
              onClick={() => onRestore(localCycle?.id)}
            >
              <span>
                <strong>{recommendation.workflowId}</strong>
                <small className="block text-muted-foreground">Cycle {recommendation.cycleDate}</small>
              </span>
              <span className="text-sm text-primary">{localCycle ? 'Restore local cycle' : 'Open editor'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

/** Home route that can render either the current concept or classic fallback. */
const HomePage: React.FC = () => {
  const logic = useHomePageLogic();
  const { recommendations } = useWorkflowAwareness();
  const {
    variant,
    formattedDate,
    fileInputRef,
    handleFileSelect,
    handleNavigateForecast,
    handleNavigateAccount,
    openFilePicker,
    showHistoryModal,
    confirmNewCycle,
    handleCloseHistoryModal,
    handleLoadRecentCycleClick,
    handleConfirmNewCycle,
    handleCancelNewCycle,
    handleNewCycle,
    savedCycles,
    forecastCycle,
    workflowMetadata,
    hasActiveWorkflow,
    isSaved,
  } = logic;

  /** Restores a matching local cycle, or opens the editor when none is available. */
  const handleAwarenessRestore = (savedCycleId?: string) => {
    if (savedCycleId) {
      if (logic.handleRestoreSavedCycle) {
        logic.handleRestoreSavedCycle(savedCycleId);
        return;
      }
      logic.handleLoadRecentCycleClick({
        currentTarget: { dataset: { cycleId: savedCycleId } },
      } as unknown as React.MouseEvent<HTMLButtonElement>);
      return;
    }
    logic.handleNavigateForecast();
  };

  const isClassicHome = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('home') === 'classic';

  if (isClassicHome) {
    return <LegacyHomePage logic={logic} />;
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 pt-4">
        <AwarenessRecommendations
          recommendations={recommendations}
          savedCycles={savedCycles}
          activeWorkflowId={workflowMetadata?.id}
          onRestore={handleAwarenessRestore}
        />
      </div>
      <HomeConceptPage
        variant={variant}
        formattedDate={formattedDate}
        savedCycles={savedCycles}
        forecastCycle={forecastCycle}
        workflowMetadata={workflowMetadata}
        workflowEnabled={logic.workflowEnabled ?? true}
        hasActiveWorkflow={hasActiveWorkflow}
        isSaved={isSaved}
        onResumeForecast={handleNavigateForecast}
        onWriteDiscussion={logic.handleNavigateDiscussion}
        onOpenHistory={logic.handleOpenHistoryModal}
        onOpenFile={openFilePicker}
        onNewCycle={handleNewCycle}
        onStartWorkflow={logic.handleStartWorkflow}
        onCreateWorkflowUpdate={logic.handleCreateWorkflowUpdate}
        onLoadRecentCycle={handleLoadRecentCycleClick}
        onNavigateAccount={handleNavigateAccount}
      />
      <input ref={fileInputRef} type="file" accept={FORECAST_IMPORT_ACCEPT} onChange={handleFileSelect} className="hidden" />
      <CycleHistoryModal isOpen={showHistoryModal} onClose={handleCloseHistoryModal} />
      <ConfirmationModal
        isOpen={confirmNewCycle}
        title={logic.pendingWorkflow ? 'Start Workflow' : 'Start Blank Cycle'}
        message={logic.pendingWorkflow
          ? `You have unsaved changes. Start the ${logic.pendingWorkflow.label} workflow and discard the current changes?`
          : 'You have unsaved changes. Start a blank forecast cycle and discard the current changes?'}
        onConfirm={handleConfirmNewCycle}
        onCancel={handleCancelNewCycle}
        confirmLabel={logic.pendingWorkflow ? 'Start Workflow' : 'Start Blank Cycle'}
      />
    </div>
  );
};

export default HomePage;
export { HomePage };
