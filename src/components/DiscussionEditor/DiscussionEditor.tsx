import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { updateDiscussion } from '../../store/forecastSlice';
import { DiscussionMode, DiscussionData } from '../../types/outlooks';
import { compileDiscussionToText, exportDiscussionToFile } from '../../utils/discussionUtils';
import { toDatetimeLocal } from '../../utils/datetimeLocal';
import DIYDiscussionEditor from './DIYDiscussionEditor';
import GuidedDiscussionEditor from './GuidedDiscussionEditor';
import './DiscussionEditor.css';

interface DiscussionEditorProps {
  onClose: () => void;
}

type ViewTab = 'edit' | 'preview';

interface DiscussionDraftInput {
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: DiscussionData['guidedContent'];
}

type GuidedDiscussionContent = NonNullable<DiscussionData['guidedContent']>;

const DEFAULT_GUIDED_CONTENT: GuidedDiscussionContent = {
  synopsis: '',
  meteorologicalSetup: '',
  severeWeatherExpectations: '',
  timing: '',
  regionalBreakdown: '',
  additionalConsiderations: ''
};

// Returns an initial valid-end timestamp, defaulting to 24 hours ahead when none exists.
const getInitialValidEnd = (existingValidEnd?: string): string => {
  if (existingValidEnd) return existingValidEnd;
  const end = new Date();
  end.setHours(end.getHours() + 24);
  return toDatetimeLocal(end);
};

// Returns an initial valid-start timestamp, defaulting to current local time.
const getInitialValidStart = (existingValidStart?: string): string => {
  return existingValidStart ?? toDatetimeLocal(new Date());
};

// Returns initial guided content with fallback to an empty template.
const getInitialGuidedContent = (
  existingGuidedContent?: DiscussionData['guidedContent']
): GuidedDiscussionContent => {
  return existingGuidedContent ?? DEFAULT_GUIDED_CONTENT;
};

// Normalizes editor state into the persisted discussion payload format.
const buildDiscussionDraft = ({
  mode,
  validStart,
  validEnd,
  forecasterName,
  diyContent,
  guidedContent
}: DiscussionDraftInput): DiscussionData => ({
  mode,
  validStart,
  validEnd,
  forecasterName,
  diyContent: mode === 'diy' ? diyContent : undefined,
  guidedContent: mode === 'guided' ? guidedContent : undefined,
  lastModified: new Date().toISOString()
});

// Renders a single datetime field with its localized, human-readable time preview.
const ValidityField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  format: (iso: string) => string;
}> = ({ id, label, value, onChange, format }) => (
  <div className="validity-field">
    <label htmlFor={id}>{label}:</label>
    <input id={id} type="datetime-local" value={value} onChange={onChange} />
    <span className="formatted-time">{format(value)}</span>
  </div>
);

// Renders the top metadata section for validity window and forecaster details.
const EditorHeader: React.FC<{
  validStart: string;
  validEnd: string;
  forecasterName: string;
  onValidStartChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValidEndChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onForecasterNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatDateTime: (iso: string) => string;
}> = ({
  validStart,
  validEnd,
  forecasterName,
  onValidStartChange,
  onValidEndChange,
  onForecasterNameChange,
  formatDateTime
}) => (
  <div className="discussion-header-section">
    <div className="validity-section">
      <ValidityField
        id="valid-start"
        label="Valid From"
        value={validStart}
        onChange={onValidStartChange}
        format={formatDateTime}
      />
      <ValidityField
        id="valid-end"
        label="Valid To"
        value={validEnd}
        onChange={onValidEndChange}
        format={formatDateTime}
      />
    </div>
    <div className="forecaster-section">
      <label htmlFor="forecaster-name">Forecaster:</label>
      <input
        id="forecaster-name"
        type="text"
        value={forecasterName}
        onChange={onForecasterNameChange}
        placeholder="Enter your name or username"
        maxLength={100}
      />
    </div>
    <div className="disclaimer">
      <strong>⚠️ UNOFFICIAL OUTLOOK</strong> - For educational purposes only.
    </div>
  </div>
);

// Renders mode toggle controls for switching between DIY and guided editors.
const ModeSelection: React.FC<{
  mode: DiscussionMode;
  onSetModeDiy: () => void;
  onSetModeGuided: () => void;
}> = ({ mode, onSetModeDiy, onSetModeGuided }) => (
  <div className="mode-selection">
    <label>Discussion Mode:</label>
    <div className="mode-buttons">
      <button
        className={`mode-button ${mode === 'diy' ? 'active' : ''}`}
        onClick={onSetModeDiy}
      >
        DIY Editor
      </button>
      <button
        className={`mode-button ${mode === 'guided' ? 'active' : ''}`}
        onClick={onSetModeGuided}
      >
        Guided Builder
      </button>
    </div>
  </div>
);

// Renders the edit/preview tab switcher used by the discussion modal.
const TabNavigation: React.FC<{
  viewTab: ViewTab;
  onViewEdit: () => void;
  onViewPreview: () => void;
}> = ({ viewTab, onViewEdit, onViewPreview }) => (
  <div className="discussion-tabs">
    <button
      className={`tab-button ${viewTab === 'edit' ? 'active' : ''}`}
      onClick={onViewEdit}
    >
      📝 Edit Discussion
    </button>
    <button
      className={`tab-button ${viewTab === 'preview' ? 'active' : ''}`}
      onClick={onViewPreview}
    >
      👁️ Preview Output
    </button>
  </div>
);

// Renders compiled discussion output and export action in preview mode.
const PreviewSection: React.FC<{
  compiledText: string;
  onExport: () => void;
}> = ({ compiledText, onExport }) => (
  <div className="preview-container">
    <div className="preview-actions">
      <button className="export-text-button" onClick={onExport}>
        📄 Export as Text
      </button>
    </div>
    <pre className="discussion-preview">{compiledText}</pre>
  </div>
);

// Composes the edit-mode content sections and the mode-specific editor body.
const EditorContent: React.FC<{
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: GuidedDiscussionContent;
  onValidStartChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValidEndChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onForecasterNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetModeDiy: () => void;
  onSetModeGuided: () => void;
  onDiyContentChange: (content: string) => void;
  onGuidedContentChange: (content: GuidedDiscussionContent) => void;
  formatDateTime: (iso: string) => string;
}> = ({
  mode,
  validStart,
  validEnd,
  forecasterName,
  diyContent,
  guidedContent,
  onValidStartChange,
  onValidEndChange,
  onForecasterNameChange,
  onSetModeDiy,
  onSetModeGuided,
  onDiyContentChange,
  onGuidedContentChange,
  formatDateTime
}) => (
  <>
    <EditorHeader
      validStart={validStart}
      validEnd={validEnd}
      forecasterName={forecasterName}
      onValidStartChange={onValidStartChange}
      onValidEndChange={onValidEndChange}
      onForecasterNameChange={onForecasterNameChange}
      formatDateTime={formatDateTime}
    />

    <ModeSelection
      mode={mode}
      onSetModeDiy={onSetModeDiy}
      onSetModeGuided={onSetModeGuided}
    />

    <div className="editor-section">
      {mode === 'diy' ? (
        <DIYDiscussionEditor
          content={diyContent}
          onChange={onDiyContentChange}
        />
      ) : (
        <GuidedDiscussionEditor
          content={guidedContent}
          onChange={onGuidedContentChange}
        />
      )}
    </div>
  </>
);

// Encapsulates DiscussionEditor state, derived values, and action handlers.
const useDiscussionEditorModel = (onClose: () => void) => {
  const dispatch = useDispatch();
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const outlookDay = useSelector((state: RootState) => state.forecast.forecastCycle.days[currentDay]);
  const existingDiscussion = outlookDay?.discussion;

  const [viewTab, setViewTab] = useState<ViewTab>('edit');
  const [mode, setMode] = useState<DiscussionMode>(existingDiscussion?.mode ?? 'diy');
  const [validStart, setValidStart] = useState(() => getInitialValidStart(existingDiscussion?.validStart));
  const [validEnd, setValidEnd] = useState(() => getInitialValidEnd(existingDiscussion?.validEnd));
  const [forecasterName, setForecasterName] = useState(existingDiscussion?.forecasterName ?? '');
  const [diyContent, setDiyContent] = useState(existingDiscussion?.diyContent ?? '');
  const [guidedContent, setGuidedContent] = useState<GuidedDiscussionContent>(() => (
    getInitialGuidedContent(existingDiscussion?.guidedContent)
  ));

  const discussionDraft = useMemo(() => buildDiscussionDraft({
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent,
    guidedContent
  }), [mode, validStart, validEnd, forecasterName, diyContent, guidedContent]);

  const compiledText = useMemo(
    () => compileDiscussionToText(discussionDraft, currentDay),
    [discussionDraft, currentDay]
  );

  // Saves the current discussion draft to the active forecast day and closes the modal.
  const handleSave = () => {
    dispatch(updateDiscussion({ day: currentDay, discussion: discussionDraft }));
    onClose();
  };

  // Exports the current discussion draft as a text file for external sharing.
  const handleExport = () => {
    exportDiscussionToFile(discussionDraft, currentDay);
  };

  // Formats ISO timestamps into a local, user-friendly date/time string.
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

  // Activates the edit tab.
  const handleViewTabEdit = () => {
    setViewTab('edit');
  };

  // Activates the preview tab.
  const handleViewTabPreview = () => {
    setViewTab('preview');
  };

  // Updates the valid-start timestamp from the datetime input field.
  const handleValidStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidStart(e.target.value);
  };

  // Updates the valid-end timestamp from the datetime input field.
  const handleValidEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidEnd(e.target.value);
  };

  // Updates the displayed forecaster name.
  const handleForecasterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForecasterName(e.target.value);
  };

  // Switches the editor into free-form DIY mode.
  const handleSetModeDiy = () => {
    setMode('diy');
  };

  // Note: When switching modes, we currently keep the content separate for each mode. This allows the user to switch back and forth without losing their work. However, in a real implementation, you might want to add a confirmation dialog when switching modes if there is unsaved content in the other mode, to prevent accidental loss of work.
  // Switches the editor into structured guided mode.
  const handleSetModeGuided = () => {
    setMode('guided');
  };

  return {
    currentDay,
    viewTab,
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent,
    guidedContent,
    compiledText,
    handleSave,
    handleExport,
    formatDateTime,
    handleViewTabEdit,
    handleViewTabPreview,
    handleValidStartChange,
    handleValidEndChange,
    handleForecasterNameChange,
    handleSetModeDiy,
    handleSetModeGuided,
    setDiyContent,
    setGuidedContent
  };
};

// Main component for editing and previewing the forecast discussion for a specific forecast day. It allows users to input discussion content in either a free-form DIY editor or a structured guided builder, and provides a preview of the compiled discussion text that can be exported. The component manages local state for the discussion content and interacts with the Redux store to save updates to the discussion data for the current forecast day.
const DiscussionEditor: React.FC<DiscussionEditorProps> = ({ onClose }) => {
  const {
    currentDay,
    viewTab,
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent,
    guidedContent,
    compiledText,
    handleSave,
    handleExport,
    formatDateTime,
    handleViewTabEdit,
    handleViewTabPreview,
    handleValidStartChange,
    handleValidEndChange,
    handleForecasterNameChange,
    handleSetModeDiy,
    handleSetModeGuided,
    setDiyContent,
    setGuidedContent
  } = useDiscussionEditorModel(onClose);

  return (
    <div className="discussion-editor-overlay">
      <div className="discussion-editor-modal">
        <div className="discussion-editor-header">
          <h2>Forecast Discussion - Day {currentDay}</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <TabNavigation
          viewTab={viewTab}
          onViewEdit={handleViewTabEdit}
          onViewPreview={handleViewTabPreview}
        />

        <div className="discussion-editor-content">
          {viewTab === 'edit' ? (
            <EditorContent
              mode={mode}
              validStart={validStart}
              validEnd={validEnd}
              forecasterName={forecasterName}
              diyContent={diyContent}
              guidedContent={guidedContent}
              onValidStartChange={handleValidStartChange}
              onValidEndChange={handleValidEndChange}
              onForecasterNameChange={handleForecasterNameChange}
              onSetModeDiy={handleSetModeDiy}
              onSetModeGuided={handleSetModeGuided}
              onDiyContentChange={setDiyContent}
              onGuidedContentChange={setGuidedContent}
              formatDateTime={formatDateTime}
            />
          ) : (
            <PreviewSection compiledText={compiledText} onExport={handleExport} />
          )}
        </div>

        {/* Action Buttons */}
        <div className="discussion-editor-actions">
          <button onClick={onClose} className="cancel-button">Cancel</button>
          <button onClick={handleSave} className="save-button">Save Discussion</button>
        </div>
      </div>
    </div>
  );
};

export default DiscussionEditor;
