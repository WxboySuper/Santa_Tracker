import { useCallback, useEffect, useRef, useState } from 'react';
import { updateDiscussionDraft } from '../store/forecastSlice';
import type { DiscussionData, DiscussionMode } from '../types/outlooks';

export type GuidedContentState = NonNullable<DiscussionData['guidedContent']>;

export interface DiscussionFormDefaults {
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: GuidedContentState;
}

export interface DiscussionFormStateOptions {
  existingDiscussion: DiscussionData | undefined;
  defaultForecasterName: string;
  discussionKey: string;
  dispatch: ReturnType<typeof import('react-redux').useDispatch>;
}

/** Creates an empty guided-editor state for a new discussion. */
const createDefaultGuidedContent = (): GuidedContentState => ({
  synopsis: '', meteorologicalSetup: '', severeWeatherExpectations: '', timing: '',
  regionalBreakdown: '', additionalConsiderations: '',
});

/** Returns the existing valid-end time or a default 24-hour discussion window. */
const getInitialValidEnd = (existingDiscussion?: DiscussionData): string => {
  if (existingDiscussion?.validEnd) return existingDiscussion.validEnd;
  const end = new Date();
  end.setHours(end.getHours() + 24);
  return end.toISOString().slice(0, 16);
};

/** Builds initial form values from saved discussion data and editor defaults. */
export const getDiscussionFormDefaults = (existingDiscussion?: DiscussionData): DiscussionFormDefaults => ({
  mode: existingDiscussion?.mode ?? 'diy',
  validStart: existingDiscussion?.validStart ?? new Date().toISOString().slice(0, 16),
  validEnd: getInitialValidEnd(existingDiscussion),
  forecasterName: existingDiscussion?.forecasterName ?? '',
  diyContent: existingDiscussion?.diyContent ?? '',
  guidedContent: existingDiscussion?.guidedContent ?? createDefaultGuidedContent(),
});

/** Converts form fields into the persisted discussion shape for the active editor mode. */
export const buildDiscussionDataFrom = (fields: DiscussionFormDefaults): DiscussionData => ({
  ...fields,
  diyContent: fields.mode === 'diy' ? fields.diyContent : undefined,
  guidedContent: fields.mode === 'guided' ? fields.guidedContent : undefined,
  lastModified: new Date().toISOString(),
});

/** Keeps unsaved discussion fields isolated while the user changes discussion scope. */
const useDiscussionScopeDrafts = (options: {
  discussionKey: string;
  existingDiscussion?: DiscussionData;
  defaultForecasterName: string;
  fields: DiscussionFormDefaults;
  hasUnsavedChanges: boolean;
  applyFields: (fields: DiscussionFormDefaults, hasChanges: boolean) => void;
}) => {
  const { discussionKey, existingDiscussion, defaultForecasterName, fields, hasUnsavedChanges, applyFields } = options;
  const previousKeyRef = useRef(discussionKey);
  const scopeChangedRef = useRef(false);
  const draftsRef = useRef(new Map<string, DiscussionFormDefaults>());

  useEffect(() => {
    const previousKey = previousKeyRef.current;
    if (previousKey === discussionKey) return;
    scopeChangedRef.current = true;
    if (hasUnsavedChanges) draftsRef.current.set(previousKey, fields);
    const saved = draftsRef.current.get(discussionKey);
    const defaults = getDiscussionFormDefaults(existingDiscussion);
    // Loading a saved scope restores its fields, but does not make them edited.
    // Only an explicit field handler should arm autosave.
    applyFields(saved ?? { ...defaults, forecasterName: existingDiscussion?.forecasterName ?? defaultForecasterName }, false);
    previousKeyRef.current = discussionKey;
  }, [discussionKey, existingDiscussion, defaultForecasterName, hasUnsavedChanges, fields, applyFields]);

  useEffect(() => {
    if (scopeChangedRef.current) { scopeChangedRef.current = false; return; }
    if (previousKeyRef.current === discussionKey && hasUnsavedChanges) draftsRef.current.set(discussionKey, fields);
  }, [discussionKey, hasUnsavedChanges, fields]);
};

/** Manages editable discussion fields and persists changes for the active scope. */
const useDiscussionFormState = ({ existingDiscussion, defaultForecasterName, discussionKey, dispatch }: DiscussionFormStateOptions) => {
  const defaults = getDiscussionFormDefaults(existingDiscussion);
  const initial = { ...defaults, forecasterName: existingDiscussion?.forecasterName ?? defaultForecasterName };
  const [mode, setMode] = useState<DiscussionMode>(initial.mode);
  const [validStart, setValidStart] = useState(initial.validStart);
  const [validEnd, setValidEnd] = useState(initial.validEnd);
  const [forecasterName, setForecasterName] = useState(initial.forecasterName);
  const [diyContent, setDiyContent] = useState(initial.diyContent);
  const [guidedContent, setGuidedContent] = useState<GuidedContentState>(initial.guidedContent);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fields = { mode, validStart, validEnd, forecasterName, diyContent, guidedContent };
  const applyFields = useCallback((next: DiscussionFormDefaults, hasChanges: boolean) => {
    setMode(next.mode); setValidStart(next.validStart); setValidEnd(next.validEnd);
    setForecasterName(next.forecasterName); setDiyContent(next.diyContent); setGuidedContent(next.guidedContent);
    setHasUnsavedChanges(hasChanges);
  }, []);
  useDiscussionScopeDrafts({ discussionKey, existingDiscussion, defaultForecasterName, fields, hasUnsavedChanges, applyFields });

  const persist = useCallback((next: DiscussionFormDefaults) => dispatch(updateDiscussionDraft({ scopeId: discussionKey, draft: {
    ...next, diyContent: next.mode === 'diy' ? next.diyContent : undefined,
    guidedContent: next.mode === 'guided' ? next.guidedContent : undefined, lastModified: new Date().toISOString(),
  } })), [discussionKey, dispatch]);
  const update = useCallback((next: DiscussionFormDefaults) => { setHasUnsavedChanges(true); persist(next); }, [persist]);
  const handleModeChange = useCallback((value: string) => { const next = { ...fields, mode: value as DiscussionMode }; setMode(next.mode); update(next); }, [fields, update]);
  const handleValidStart = useCallback((value: string) => { const next = { ...fields, validStart: value }; setValidStart(value); update(next); }, [fields, update]);
  const handleValidEnd = useCallback((value: string) => { const next = { ...fields, validEnd: value }; setValidEnd(value); update(next); }, [fields, update]);
  const handleForecasterName = useCallback((value: string) => { const next = { ...fields, forecasterName: value }; setForecasterName(value); update(next); }, [fields, update]);
  const handleDiy = useCallback((value: string) => { const next = { ...fields, diyContent: value }; setDiyContent(value); update(next); }, [fields, update]);
  const handleGuided = useCallback((value: GuidedContentState) => { const next = { ...fields, guidedContent: value }; setGuidedContent(value); update(next); }, [fields, update]);
  return { mode, validStart, validEnd, forecasterName, diyContent, guidedContent, hasUnsavedChanges, setHasUnsavedChanges,
    handleModeChange, handleValidStart, handleValidEnd, handleForecasterName, handleDiy, handleGuided } as const;
};

export default useDiscussionFormState;
