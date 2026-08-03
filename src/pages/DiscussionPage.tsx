import React, { useMemo, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Eye, 
  Download, 
  Save,
  Wand2,
  Edit3,
  Calendar,
  User,
  AlertTriangle
} from 'lucide-react';
import {
  selectDiscussionDraftForScope,
  selectForecastCycle,
  selectHasActiveWorkflow,
  selectWorkflowTemplate,
  setForecastDay,
  updateDiscussion,
  updateDiscussionDraft,
} from '../store/forecastSlice';
import type { RootState } from '../store';
import { DiscussionMode, DiscussionData, DayType } from '../types/outlooks';
import { compileDiscussionToText, exportDiscussionToFile } from '../utils/discussionUtils';
import useDiscussionFormState, { GuidedContentState, buildDiscussionDataFrom } from './useDiscussionFormState';
import { useAuth } from '../auth/AuthProvider';
import { queueProductMetric } from '../utils/productMetrics';
import {
  getDefaultDiscussionGroupings,
  getDiscussionForGrouping,
  getDiscussionGroupings,
  getDiscussionOwnerDay,
  resolveDiscussionGrouping,
} from '../utils/discussionGrouping';
import DIYDiscussionEditor from '../components/DiscussionEditor/DIYDiscussionEditor';
import GuidedDiscussionEditor from '../components/DiscussionEditor/GuidedDiscussionEditor';
import ForecastWorkflowPanel from '../components/ForecastWorkflow/ForecastWorkflowPanel';
import DiscussionScopeSection from './DiscussionScopeSection';
import { useDiscussionGroupingActions } from './useDiscussionGroupingActions';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import type { AddToastFn } from '../components/Layout';
import './DiscussionPage.css';

interface PageContext {
  addToast: AddToastFn;
}

const DISCUSSION_AUTOSAVE_DELAY_MS = 1500;

// Formats an ISO datetime string into a more human-readable format for display in the metadata section of the discussion editor.
const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
};

// The DiscussionHeaderBar component renders the top header of the discussion page, showing the title, current day,
// unsaved changes indicator, and action buttons for exporting and saving the discussion.
const DiscussionHeaderBar: React.FC<{
  currentDay: DayType;
  groupingLabel?: string;
  hasUnsavedChanges: boolean;
  onExport: () => void;
  onSave: () => void;
}> = ({ currentDay, groupingLabel, hasUnsavedChanges, onExport, onSave }) => (
  <div className="discussion-header-bar flex-shrink-0 border-b border-border bg-card px-6 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Forecast Discussion
        </h1>
        <Badge variant="secondary">{groupingLabel ?? `Day ${currentDay}`}</Badge>
        {hasUnsavedChanges && (
          <Badge variant="warning" className="animate-pulse">Unsaved</Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button variant="save" size="sm" onClick={onSave}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  </div>
);

// The MetadataSection component renders the top section of the discussion editor where users can input metadata about the forecast discussion,
const MetadataSection: React.FC<{
  validStart: string;
  validEnd: string;
  forecasterName: string;
  onValidStartChange: (value: string) => void;
  onValidEndChange: (value: string) => void;
  onForecasterNameChange: (value: string) => void;
}> = ({
  validStart,
  validEnd,
  forecasterName,
  onValidStartChange,
  onValidEndChange,
  onForecasterNameChange
}) => {
  // Checks if there is any data available for the given day type by looking at the Redux store's forecast cycle data. This is used to determine whether to show a data indicator on the day tabs in the header.
  const handleValidStartInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValidStartChange(e.target.value);
  };

  // Handler for when the valid end datetime input changes, which calls the onValidEndChange prop to update the state in the parent component.
  const handleValidEndInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValidEndChange(e.target.value);
  };

  // Handler for when the forecaster name input changes, which calls the onForecasterNameChange prop to update the state in the parent component.
  const handleForecasterNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onForecasterNameChange(e.target.value);
  };

  return (
    <div className="discussion-top-rail">
    <div className="discussion-metadata-grid">
      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Valid From
        </label>
        <Input
          type="datetime-local"
          value={validStart}
          onChange={handleValidStartInputChange}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">{formatDateTime(validStart)}</span>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Valid To
        </label>
        <Input
          type="datetime-local"
          value={validEnd}
          onChange={handleValidEndInputChange}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">{formatDateTime(validEnd)}</span>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <User className="h-3 w-3" />
          Forecaster
        </label>
        <Input
          type="text"
          value={forecasterName}
          onChange={handleForecasterNameInputChange}
          placeholder="Your name or username"
          maxLength={100}
          className="h-9"
        />
      </div>
    </div>

    <div className="discussion-warning-banner mt-3 flex items-center gap-2 text-sm text-orange-900 dark:text-warning-foreground bg-warning/20 px-3 py-2 rounded-md">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span><strong>UNOFFICIAL OUTLOOK</strong> - For educational purposes only.</span>
    </div>
    </div>
  );
};

// The DiscussionTabsSection component renders the tabbed interface for switching between the DIY editor and the Guided editor,
const DiscussionTabsSection: React.FC<{
  mode: DiscussionMode;
  diyContent: string;
  guidedContent: GuidedContentState;
  onModeChange: (value: string) => void;
  onDiyChange: (value: string) => void;
  onGuidedChange: (value: GuidedContentState) => void;
}> = ({ mode, diyContent, guidedContent, onModeChange, onDiyChange, onGuidedChange }) => (
  <Tabs
    value={mode}
    onValueChange={onModeChange}
    className="discussion-editor-shell flex-1 flex flex-col overflow-hidden"
  >
    <div className="discussion-mode-toggle-wrap flex-shrink-0 px-4 pt-4">
      <TabsList className="discussion-mode-toggle w-full max-w-sm">
        <TabsTrigger value="diy" className="discussion-mode-toggle-button flex h-full items-center justify-center gap-2 leading-none">
          <Edit3 className="h-4 w-4" />
          DIY Editor
        </TabsTrigger>
        <TabsTrigger value="guided" className="discussion-mode-toggle-button flex h-full items-center justify-center gap-2 leading-none">
          <Wand2 className="h-4 w-4" />
          Guided
        </TabsTrigger>
      </TabsList>
    </div>

    <TabsContent value="diy" className="flex-1 overflow-hidden m-0 p-4">
      <div className="h-full overflow-auto">
        <DIYDiscussionEditor
          content={diyContent}
          onChange={onDiyChange}
        />
      </div>
    </TabsContent>

    <TabsContent value="guided" className="flex-1 overflow-hidden m-0 p-4">
      <div className="h-full overflow-auto">
        <GuidedDiscussionEditor
          content={guidedContent}
          onChange={onGuidedChange}
        />
      </div>
    </TabsContent>
  </Tabs>
);

// The DiscussionStatusBar component renders the bottom status bar of the discussion editor,
// showing the current word count and the last modified timestamp of the discussion.
const DiscussionStatusBar: React.FC<{ wordCount: number; lastModified?: string }> = ({ wordCount, lastModified }) => (
  <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-sm text-muted-foreground">
    <span>{wordCount} words</span>
    {lastModified && (
      <span>Last saved: {new Date(lastModified).toLocaleString()}</span>
    )}
  </div>
);

// The DiscussionPreviewPane component renders the right-hand pane of the discussion page,
// showing a live preview of the compiled discussion text based on the current editor content and metadata.
const DiscussionPreviewCard: React.FC<{ compiledText: string }> = ({ compiledText }) => (
  <div className="flex-1 overflow-auto p-4">
    <div className="discussion-preview-card p-4 bg-card rounded-md">
      <pre className="discussion-preview-text whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed">
        {compiledText}
      </pre>
    </div>
  </div>
);

// The DiscussionPreviewPane component renders the right-hand pane of the discussion page,
const DiscussionPreviewPane: React.FC<{ compiledText: string }> = ({ compiledText }) => (
  <div className="discussion-preview-pane flex-shrink-0 flex flex-col overflow-hidden bg-muted/20">
    <div className="discussion-top-rail discussion-preview-header flex-shrink-0 flex items-center gap-2 border-b border-border">
      <Eye className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-sm">Live Preview</span>
    </div>

    <DiscussionPreviewCard compiledText={compiledText} />
  </div>
);

// Discussion form state lives in useDiscussionFormState to keep the page focused on composition.
// Auto-save hook keeps the effect isolated and simple. Accepts a single options object
/** Persists edited discussion data after the configured idle delay. */
const useDiscussionAutoSave = (opts: {
  hasUnsavedChanges: boolean;
  buildDiscussionData: () => DiscussionData;
  currentDay: DayType;
  scopeId: string;
  dispatch: ReturnType<typeof useDispatch>;
  clearUnsaved: (v: boolean) => void;
}) => {
  const { hasUnsavedChanges, buildDiscussionData, currentDay, scopeId, dispatch, clearUnsaved } = opts;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (hasUnsavedChanges) {
      timer = setTimeout(() => {
        dispatch(updateDiscussion({ day: currentDay, scopeId, discussion: buildDiscussionData() }));
        clearUnsaved(false);
      }, DISCUSSION_AUTOSAVE_DELAY_MS);
    }

    return () => { if (timer !== null) clearTimeout(timer); };
  }, [hasUnsavedChanges, buildDiscussionData, currentDay, dispatch, clearUnsaved, scopeId]);
};

// Computes derived values (compiled text and word count) in a focused hook.
/** Derives the compiled preview text and active editor word count. */
const useDiscussionComputed = (
  opts: {
    buildDiscussionData: () => DiscussionData;
    currentDay: DayType;
    mode: DiscussionMode;
    diyContent: string;
    guidedContent: GuidedContentState;
  }
) => {
  const { buildDiscussionData, currentDay, mode, diyContent, guidedContent } = opts;

  const compiledText = useMemo(() => compileDiscussionToText(buildDiscussionData(), currentDay), [buildDiscussionData, currentDay]);

  const wordCount = useMemo(() => {
    const text = mode === 'diy' ? diyContent : Object.values(guidedContent).join(' ');
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [mode, diyContent, guidedContent]);

  return { compiledText, wordCount } as const;
};

/** Provides save and export action callbacks for the discussion editor, dispatching to Redux and notifying via toast. */
const useDiscussionActions = (opts: {
  dispatch: ReturnType<typeof useDispatch>;
  currentDay: DayType;
  scopeId: string;
  buildDiscussionData: () => DiscussionData;
  clearUnsaved: (v: boolean) => void;
  addToast: AddToastFn;
  user: ReturnType<typeof useAuth>['user'];
  onSaved: () => void;
}) => {
  const { dispatch, currentDay, scopeId, buildDiscussionData, clearUnsaved, addToast, user, onSaved } = opts;

  const handleSave = useCallback(() => {
    dispatch(updateDiscussion({ day: currentDay, scopeId, discussion: buildDiscussionData() }));
    clearUnsaved(false);
    queueProductMetric({ event: 'discussion_saved', user });
    addToast('Discussion saved!', 'success');
    onSaved();
  }, [dispatch, currentDay, scopeId, buildDiscussionData, clearUnsaved, addToast, user, onSaved]);

  const handleExport = useCallback(() => {
    exportDiscussionToFile(buildDiscussionData(), currentDay);
    addToast('Discussion exported!', 'success');
  }, [buildDiscussionData, currentDay, addToast]);

  return { handleSave, handleExport } as const;
};

interface DiscussionEditorStateOptions {
  existingDiscussion: DiscussionData | undefined;
  defaultForecasterName: string;
  currentDay: DayType;
  discussionKey: string;
  dispatch: ReturnType<typeof useDispatch>;
  addToast: AddToastFn;
  user: ReturnType<typeof useAuth>['user'];
  onSaved: () => void;
}

/** Composes all discussion editor state — form fields, computed text, auto-save, and actions — into a single hook return value. */
const useDiscussionEditorState = ({
  existingDiscussion,
  defaultForecasterName,
  currentDay,
  discussionKey,
  dispatch,
  addToast,
  user,
  onSaved,
}: DiscussionEditorStateOptions) => {
  const form = useDiscussionFormState({
    existingDiscussion,
    defaultForecasterName,
    discussionKey,
    dispatch,
  });

  const buildDiscussionData = useCallback(() => buildDiscussionDataFrom({
    mode: form.mode,
    validStart: form.validStart,
    validEnd: form.validEnd,
    forecasterName: form.forecasterName,
    diyContent: form.diyContent,
    guidedContent: form.guidedContent
  }), [form.mode, form.validStart, form.validEnd, form.forecasterName, form.diyContent, form.guidedContent]);

  const persistDraft = useCallback(() => {
    if (!form.hasUnsavedChanges) return;
    // Scope changes preserve edits as drafts; only explicit save/autosave publishes them.
    dispatch(updateDiscussionDraft({ scopeId: discussionKey, draft: buildDiscussionData() }));
    form.setHasUnsavedChanges(false);
  }, [buildDiscussionData, discussionKey, dispatch, form.hasUnsavedChanges, form.setHasUnsavedChanges]);

  useDiscussionAutoSave({
    hasUnsavedChanges: form.hasUnsavedChanges,
    buildDiscussionData,
    currentDay,
    scopeId: discussionKey,
    dispatch,
    clearUnsaved: form.setHasUnsavedChanges
  });

  const { compiledText, wordCount } = useDiscussionComputed({
    buildDiscussionData,
    currentDay,
    mode: form.mode,
    diyContent: form.diyContent,
    guidedContent: form.guidedContent
  });

  const { handleSave, handleExport } = useDiscussionActions({
    dispatch,
    currentDay,
    scopeId: discussionKey,
    buildDiscussionData,
    clearUnsaved: form.setHasUnsavedChanges,
    addToast,
    user,
    onSaved,
  });

  return {
    mode: form.mode,
    validStart: form.validStart,
    validEnd: form.validEnd,
    forecasterName: form.forecasterName,
    diyContent: form.diyContent,
    guidedContent: form.guidedContent,
    hasUnsavedChanges: form.hasUnsavedChanges,
    compiledText,
    wordCount,
    setValidStart: form.handleValidStart,
    setValidEnd: form.handleValidEnd,
    setForecasterName: form.handleForecasterName,
    handleModeChange: form.handleModeChange,
    handleContentChange: form.handleDiy,
    handleGuidedChange: form.handleGuided,
    handleSave,
    handleExport,
    persistDraft,
  };
};


/** Synchronizes the selected discussion scope with the forecast day and URL query. */
const useDiscussionScopeSync = (options: {
  currentDay: DayType;
  discussionDay: DayType;
  dispatch: ReturnType<typeof useDispatch>;
  hasActiveWorkflow: boolean;
  selectedGroupingId: string;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) => {
  const { currentDay, discussionDay, dispatch, hasActiveWorkflow, selectedGroupingId, searchParams, setSearchParams } = options;
  useEffect(() => {
    if (currentDay !== discussionDay) dispatch(setForecastDay(discussionDay));
  }, [currentDay, discussionDay, dispatch]);
  useEffect(() => {
    if (hasActiveWorkflow && searchParams.get('group') !== selectedGroupingId) {
      setSearchParams({ group: selectedGroupingId }, { replace: true });
    }
  }, [hasActiveWorkflow, searchParams, selectedGroupingId, setSearchParams]);
};

/** The DiscussionPage component is the main forecast discussion workflow surface. */
export const DiscussionPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useOutletContext<PageContext>();
  const { syncedSettings, user } = useAuth();
  const forecastCycle = useSelector(selectForecastCycle);
  const hasActiveWorkflow = useSelector(selectHasActiveWorkflow);
  const workflowTemplate = useSelector(selectWorkflowTemplate);
  const currentDay = forecastCycle.currentDay;

  const groupings = useMemo(
    () => getDiscussionGroupings(forecastCycle, hasActiveWorkflow ? workflowTemplate : undefined, currentDay),
    [forecastCycle, hasActiveWorkflow, workflowTemplate, currentDay],
  );
  const defaultGroupings = useMemo(
    () => getDefaultDiscussionGroupings(hasActiveWorkflow ? workflowTemplate : undefined, currentDay),
    [currentDay, hasActiveWorkflow, workflowTemplate],
  );
  const selectedGrouping = useMemo(
    () => resolveDiscussionGrouping(groupings, searchParams.get('group'), currentDay),
    [groupings, searchParams, currentDay],
  );
  const discussionDay = getDiscussionOwnerDay(forecastCycle, selectedGrouping);
  const outlookDay = forecastCycle.days[discussionDay];
  const discussionDraft = useSelector((state: RootState) => selectDiscussionDraftForScope(state, selectedGrouping.id));
  const existingDiscussion = discussionDraft ?? getDiscussionForGrouping(forecastCycle, selectedGrouping);
  const defaultForecasterName = syncedSettings?.defaultForecasterName ?? user?.displayName ?? '';

  useDiscussionScopeSync({
    currentDay: forecastCycle.currentDay,
    discussionDay,
    dispatch,
    hasActiveWorkflow,
    selectedGroupingId: selectedGrouping.id,
    searchParams,
    setSearchParams,
  });

  const editorState = useDiscussionEditorState({
    existingDiscussion,
    defaultForecasterName,
    currentDay: discussionDay,
    discussionKey: selectedGrouping.id,
    dispatch,
    addToast,
    user,
    onSaved: () => navigate('/forecast'),
  });

  const { handleCombine: handleCombineGroupings, handleReset: handleResetGroupings } = useDiscussionGroupingActions({
    forecastCycle,
    groupings,
    defaultGroupings,
    currentDay,
    selectedGroupingId: selectedGrouping.id,
    persistDraft: editorState.persistDraft,
  });

  const handleSelectGrouping = useCallback((groupingId: string) => {
    const nextGrouping = groupings.find((grouping) => grouping.id === groupingId);
    if (!nextGrouping) return;
    editorState.persistDraft();
    dispatch(setForecastDay(getDiscussionOwnerDay(forecastCycle, nextGrouping)));
    if (hasActiveWorkflow) setSearchParams({ group: groupingId });
  }, [dispatch, editorState, forecastCycle, groupings, hasActiveWorkflow, setSearchParams]);

  return (
    <div className="h-full flex flex-col bg-background">
      <ForecastWorkflowPanel context="discussion" />
      <DiscussionHeaderBar
        currentDay={discussionDay}
        groupingLabel={selectedGrouping.label}
        hasUnsavedChanges={editorState.hasUnsavedChanges}
        onExport={editorState.handleExport}
        onSave={editorState.handleSave}
      />
      <DiscussionScopeSection
        groupings={groupings}
        selectedGrouping={selectedGrouping}
        onSelect={handleSelectGrouping}
        onCombine={handleCombineGroupings}
        onReset={handleResetGroupings}
      />

      <div className="discussion-layout flex-1 flex overflow-hidden">
        <div className="discussion-editor-pane flex flex-col overflow-hidden border-r border-border">
          <MetadataSection
            validStart={editorState.validStart}
            validEnd={editorState.validEnd}
            forecasterName={editorState.forecasterName}
            onValidStartChange={editorState.setValidStart}
            onValidEndChange={editorState.setValidEnd}
            onForecasterNameChange={editorState.setForecasterName}
          />

          <DiscussionTabsSection
            mode={editorState.mode}
            diyContent={editorState.diyContent}
            guidedContent={editorState.guidedContent}
            onModeChange={editorState.handleModeChange}
            onDiyChange={editorState.handleContentChange}
            onGuidedChange={editorState.handleGuidedChange}
          />

          <DiscussionStatusBar
            wordCount={editorState.wordCount}
            lastModified={outlookDay?.discussion?.lastModified}
          />
        </div>

        <DiscussionPreviewPane compiledText={editorState.compiledText} />
      </div>
    </div>
  );
};

export default DiscussionPage;
