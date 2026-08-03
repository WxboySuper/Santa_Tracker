import type { Feature, Polygon } from 'geojson';
import type { DayType } from '../types/outlooks';
import type { WorkflowMetadata } from '../types/workflow';
import reducer, {
  addFeature,
  applyAutoCategoricalSync,
  copyFeaturesFromPrevious,
  importForecastCycle,
  importWorkflowPackage,
  restoreForecastCycle,
  redoLastEdit,
  replaceTstmFeatures,
  resetForecasts,
  selectCanRedo,
  selectCanUndo,
  setForecastDay,
  toggleLowProbability,
  undoLastEdit,
  updateFeature,
  removeFeature,
  completeCycle,
  completeWithOmissions,
  markAsSaved,
  omitDay,
  validateCompletion,
  startBlankCycle,
  resumeIncompleteCycle,
  createOutlookUpdate,
  startFromPreviousCycle,
  saveCurrentCycle,
  updateDiscussion,
  updateDiscussionDraft,
  migrateDiscussionDrafts,
} from './forecastSlice';

const createPolygon = (offset: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[
    [offset, offset],
    [offset + 1, offset],
    [offset + 1, offset + 1],
    [offset, offset + 1],
    [offset, offset],
  ]],
});

interface FeatureOptions {
  outlookType: string;
  probability: string;
  extras?: Record<string, unknown>;
}

const createBaseFeature = (
  id: string,
  offset: number,
  options: FeatureOptions
): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: {
    ...options,
    isSignificant: false,
    ...options.extras,
  },
});

const createFeature = (id: string, offset: number): Feature =>
  createBaseFeature(id, offset, { outlookType: 'tornado', probability: '2%' });

const createCategoricalFeature = (id: string, offset: number): Feature =>
  createBaseFeature(id, offset, {
    outlookType: 'categorical',
    probability: 'ENH',
    extras: { derivedFrom: 'auto-generated' },
  });

const createTstmFeature = (id: string, offset: number): Feature =>
  createBaseFeature(id, offset, {
    outlookType: 'categorical',
    probability: 'TSTM',
  });

const createStateWithCategoricalFeatures = () => {
  let state = reducer(undefined, setForecastDay(1));
  state = reducer(
    state,
    applyAutoCategoricalSync({
      map: new Map([
        ['TSTM', [createTstmFeature('old-tstm', 0)]],
        ['ENH', [createCategoricalFeature('enh', 2)]],
      ]),
    })
  );
  return state;
};

const getCategoricalFeatureId = (
  state: ReturnType<typeof reducer>,
  probability: string
) => state.forecastCycle.days[1]?.data.categorical?.get(probability)?.[0].id;

const createOutlookFeature = (
  id: string,
  offset: number,
  outlookType: 'tornado' | 'totalSevere' | 'day4-8',
  probability: '2%' | '15%' | '30%'
): Feature => createBaseFeature(id, offset, { outlookType, probability });

interface CopyTestSetup {
  sourceDay: DayType;
  sourceType: string;
  sourceProb: string;
  targetDay: DayType;
  targetType: string;
  targetProb: string;
}

interface CopyExpectations {
  state: ReturnType<typeof reducer>;
  day: DayType;
  outlookType: string;
  probability: string;
  expectedLength: number;
  expectedId?: string;
}

const createCopyTestSetup = ({
  sourceDay,
  sourceType,
  sourceProb,
  targetDay,
  targetType,
  targetProb,
}: CopyTestSetup) => {
  let sourceState = reducer(undefined, setForecastDay(sourceDay));
  sourceState = reducer(
    sourceState,
    addFeature({ feature: createOutlookFeature('source', sourceDay, sourceType as never, sourceProb as never) })
  );

  let targetState = reducer(undefined, setForecastDay(targetDay));
  targetState = reducer(
    targetState,
    addFeature({ feature: createOutlookFeature('stale', targetDay + 5, targetType as never, targetProb as never) })
  );

  return { sourceState, targetState };
};

const expectCopyResult = ({
  state,
  day,
  outlookType,
  probability,
  expectedLength,
  expectedId,
}: CopyExpectations) => {
  const data = state.forecastCycle.days[day]?.data as Record<string, Map<string, Feature[]> | undefined>;
  const features = data[outlookType]?.get(probability);
  expect(features).toHaveLength(expectedLength);
  if (expectedId) {
    expect(features?.[0].id).toBe(expectedId);
  }
};

const expectOutlookTypeEmpty = (
  state: ReturnType<typeof reducer>,
  day: DayType,
  outlookType: string
) => {
  const data = state.forecastCycle.days[day]?.data as Record<string, Map<string, Feature[]> | undefined>;
  expect(data[outlookType]?.size ?? 0).toBe(0);
};

interface DeepCloneCheck {
  copiedFeature: Feature | undefined;
  sourceFeature: Feature | undefined;
}

const expectDeepCloned = ({ copiedFeature, sourceFeature }: DeepCloneCheck) => {
  expect(copiedFeature).not.toBe(sourceFeature);
};

interface CopyVerificationInput {
  state: ReturnType<typeof reducer>;
  sourceState: ReturnType<typeof reducer>;
  targetDay: DayType;
  expectedTornadoId: string;
  expectedCategoricalId: string;
}

const expectCopyVerification = ({
  state,
  sourceState,
  targetDay,
  expectedTornadoId,
  expectedCategoricalId,
}: CopyVerificationInput) => {
  const copiedTornado = state.forecastCycle.days[targetDay]?.data.tornado?.get('2%')?.[0];
  const copiedCategorical = state.forecastCycle.days[targetDay]?.data.categorical?.get('ENH')?.[0];
  const sourceTornado = sourceState.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0];

  expect(copiedTornado?.id).toBe(expectedTornadoId);
  expect(copiedCategorical?.id).toBe(expectedCategoricalId);
  expect(state.forecastCycle.days[targetDay]?.data.tornado?.get('2%')).toHaveLength(1);
  expectDeepCloned({ copiedFeature: copiedTornado, sourceFeature: sourceTornado });
};

const createSourceWithFeatures = (id1: string, id2: string) => {
  let state = reducer(undefined, addFeature({ feature: createFeature(id1, 0) }));
  state = reducer(state, addFeature({ feature: createCategoricalFeature(id2, 1) }));
  return state;
};

const createTargetWithFeature = (day: DayType, id: string, offset: number) => {
  let state = reducer(undefined, setForecastDay(day));
  state = reducer(state, addFeature({ feature: createFeature(id, offset) }));
  return state;
};

const getTornadoFeatures = (state: ReturnType<typeof reducer>) =>
  state.forecastCycle.days[state.forecastCycle.currentDay]?.data.tornado?.get('2%') || [];

const getUndoStack = (state: ReturnType<typeof reducer>, day: DayType) =>
  state.historyByDay[day]?.undoStack || [];

const getRedoStack = (state: ReturnType<typeof reducer>, day: DayType) =>
  state.historyByDay[day]?.redoStack || [];

describe('forecastSlice undo/redo', () => {
  test('undoes and redoes added features', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('one', 0) }));

    expect(getTornadoFeatures(state)).toHaveLength(1);
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);

    state = reducer(state, redoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(1);
  });

  test('undoes and redoes feature modifications', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));

    state = reducer(state, updateFeature({
      feature: {
        ...createFeature('feature-1', 3),
        properties: {
          outlookType: 'tornado',
          probability: '2%',
          isSignificant: false,
        },
      },
    }));

    expect((getTornadoFeatures(state)[0].geometry as Polygon).coordinates[0][0]).toEqual([3, 3]);

    state = reducer(state, undoLastEdit());
    expect((getTornadoFeatures(state)[0].geometry as Polygon).coordinates[0][0]).toEqual([0, 0]);

    state = reducer(state, redoLastEdit());
    expect((getTornadoFeatures(state)[0].geometry as Polygon).coordinates[0][0]).toEqual([3, 3]);
  });

  test('undo restores deleted features', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));

    state = reducer(state, removeFeature({
      outlookType: 'tornado',
      probability: '2%',
      featureId: 'feature-1',
    }));

    expect(getTornadoFeatures(state)).toHaveLength(0);

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(1);
  });

  test('undo and redo restore low probability metadata and features', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));

    state = reducer(state, toggleLowProbability());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.metadata.lowProbabilityOutlooks).toContain('tornado');

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.metadata.lowProbabilityOutlooks).not.toContain('tornado');

    state = reducer(state, redoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.metadata.lowProbabilityOutlooks).toContain('tornado');
  });

  test('new edits clear redo history', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    state = reducer(state, undoLastEdit());

    expect(selectCanRedo({ forecast: state } as never)).toBe(true);

    state = reducer(state, addFeature({ feature: createFeature('feature-2', 2) }));
    expect(selectCanRedo({ forecast: state } as never)).toBe(false);
  });

  test('history stack is capped at 50 entries', () => {
    let state = reducer(undefined, { type: '@@INIT' });

    for (let index = 0; index < 55; index += 1) {
      state = reducer(state, addFeature({ feature: createFeature(`feature-${index}`, index) }));
    }

    expect(getUndoStack(state, 1)).toHaveLength(50);
  });

  test('history stays with each day when switching days', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);

    state = reducer(state, setForecastDay(2));
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);

    state = reducer(state, addFeature({ feature: createFeature('feature-2', 1) }));
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);
    expect(getUndoStack(state, 1)).toHaveLength(1);
    expect(getUndoStack(state, 2)).toHaveLength(1);

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);

    state = reducer(state, setForecastDay(1));
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);
    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);
  });

  test('auto categorical sync updates state without adding its own undo entry', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    expect(getUndoStack(state, 1)).toHaveLength(1);

    state = reducer(
      state,
      applyAutoCategoricalSync({
        map: new Map([['ENH', [createCategoricalFeature('categorical-1', 5)]]]),
      })
    );

    expect(getUndoStack(state, 1)).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.data.categorical?.get('ENH')).toHaveLength(1);

    state = reducer(state, undoLastEdit());

    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.data.categorical?.size ?? 0).toBe(0);
  });

  test('replaces only TSTM features and keeps generated categorical risks', () => {
    const state = reducer(
      createStateWithCategoricalFeatures(),
      replaceTstmFeatures({ features: [createTstmFeature('new-tstm', 4)] })
    );

    expect(getCategoricalFeatureId(state, 'TSTM')).toBe('new-tstm');
    expect(getCategoricalFeatureId(state, 'ENH')).toBe('enh');
  });

  test('records generated TSTM replacement as one undoable edit', () => {
    const replacedState = reducer(
      createStateWithCategoricalFeatures(),
      replaceTstmFeatures({ features: [createTstmFeature('new-tstm', 4)] })
    );

    expect(selectCanUndo({ forecast: replacedState } as never)).toBe(true);

    const restoredState = reducer(replacedState, undoLastEdit());
    expect(getCategoricalFeatureId(restoredState, 'TSTM')).toBe('old-tstm');
    expect(getCategoricalFeatureId(restoredState, 'ENH')).toBe('enh');
  });

  test('does not add an undo entry for logically identical TSTM features', () => {
    const firstFeature = createTstmFeature('generated-tstm', 0);
    const secondFeature = createTstmFeature('generated-tstm', 0);
    secondFeature.properties = {
      originalProbability: 'TSTM',
      derivedFrom: 'categorical',
      probability: 'TSTM',
      outlookType: 'categorical',
      isSignificant: false,
    };

    let state = reducer(
      reducer(undefined, setForecastDay(1)),
      replaceTstmFeatures({ features: [firstFeature] })
    );
    state = reducer(state, replaceTstmFeatures({ features: [secondFeature] }));

    state = reducer(state, undoLastEdit());
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(getCategoricalFeatureId(state, 'TSTM')).toBeUndefined();
  });

  test('importing and resetting clear all per-day history', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    state = reducer(state, setForecastDay(2));
    state = reducer(state, addFeature({ feature: createFeature('feature-2', 1) }));

    state = reducer(state, importForecastCycle(state.forecastCycle));
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(getUndoStack(state, 1)).toHaveLength(0);
    expect(getUndoStack(state, 2)).toHaveLength(0);
    expect(getRedoStack(state, 1)).toHaveLength(0);
    expect(getRedoStack(state, 2)).toHaveLength(0);

    state = reducer(state, addFeature({ feature: createFeature('feature-3', 2) }));
    state = reducer(state, resetForecasts());
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(selectCanRedo({ forecast: state } as never)).toBe(false);
  });

  test('restoring a cycle clears drafts from the previous cycle', () => {
    const draft = {
      mode: 'diy' as const,
      validStart: '2026-07-04T12:00',
      validEnd: '2026-07-05T12:00',
      forecasterName: 'Draft author',
      diyContent: 'Unsaved text',
      lastModified: '2026-07-04T12:00:00.000Z',
    };
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft }));
    expect(state.discussionDraftsByScope.day1).toEqual(draft);

    state = reducer(state, restoreForecastCycle(state.forecastCycle));

    expect(state.discussionDraftsByScope).toEqual({});
  });

  test('same-session restore preserves unpublished discussion drafts', () => {
    const draft = {
      mode: 'diy' as const,
      validStart: '2026-07-04T12:00',
      validEnd: '2026-07-05T12:00',
      forecasterName: 'Draft author',
      diyContent: 'Unsaved text survives local restore',
      lastModified: '2026-07-04T12:00:00.000Z',
    };
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft }));

    state = reducer(state, restoreForecastCycle(state.forecastCycle, true));

    expect(state.discussionDraftsByScope.day1).toEqual(draft);
  });

  test('importing a workflow package clears drafts from the replaced cycle', () => {
    const draft = {
      mode: 'diy' as const,
      validStart: '2026-07-04T12:00',
      validEnd: '2026-07-05T12:00',
      forecasterName: 'Draft author',
      diyContent: 'Stale imported-cycle draft',
      lastModified: '2026-07-04T12:00:00.000Z',
    };
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft }));

    state = reducer(state, importWorkflowPackage({
      metadata: {
        workflowId: 'severe-day1',
        cycleId: 'cycle-2026-07-04',
        version: 1,
        status: 'in-progress',
        includesDiscussions: true,
        includesStyleSnapshots: false,
      },
      cycles: [{
        id: 'cycle-2026-07-04',
        workflowId: 'severe-day1',
        cycleDate: '2026-07-04',
        status: 'in-progress',
        outlookVersions: [],
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T12:00:00.000Z',
      }],
    }));

    expect(state.discussionDraftsByScope).toEqual({});
  });

  test('saving a discussion draft does not publish it until updateDiscussion', () => {
    const draft = {
      mode: 'diy' as const,
      validStart: '2026-07-04T12:00',
      validEnd: '2026-07-05T12:00',
      forecasterName: 'Draft author',
      diyContent: 'Unsaved text',
      lastModified: '2026-07-04T12:00:00.000Z',
    };
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft }));

    expect(state.forecastCycle.days[1]?.discussion).toBeUndefined();
    expect(state.discussionDraftsByScope.day1).toEqual(draft);

    state = reducer(state, updateDiscussion({ day: 1, scopeId: 'day1', discussion: draft }));
    expect(state.forecastCycle.days[1]?.discussion).toEqual(draft);
    expect(state.discussionDraftsByScope.day1).toBeUndefined();
  });

  test('keeps drafts for distinct scopes that share an owner day', () => {
    const firstDraft = { mode: 'diy' as const, diyContent: 'First scope' } as DiscussionData;
    const secondDraft = { mode: 'diy' as const, diyContent: 'Second scope' } as DiscussionData;
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'combined-a', draft: firstDraft }));
    state = reducer(state, updateDiscussionDraft({ scopeId: 'combined-b', draft: secondDraft }));

    expect(state.discussionDraftsByScope).toEqual({ 'combined-a': firstDraft, 'combined-b': secondDraft });
  });

  test('migrates combined scope drafts onto the new combined scope id', () => {
    const dayOneDraft = { mode: 'diy' as const, diyContent: 'Day 1 draft' } as DiscussionData;
    const dayTwoDraft = { mode: 'diy' as const, diyContent: 'Day 2 draft' } as DiscussionData;
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft: dayOneDraft }));
    state = reducer(state, updateDiscussionDraft({ scopeId: 'day2', draft: dayTwoDraft }));

    state = reducer(state, migrateDiscussionDrafts({
      migrations: { day1: 'custom-combined', day2: 'custom-combined' },
      preferScopeId: 'day1',
    }));

    expect(state.discussionDraftsByScope['custom-combined']?.diyContent).toBe('Day 1 draft\n\nDay 2 draft');
  });

  test('migrates custom scope drafts back to default scope ids on reset', () => {
    const customDraft = { mode: 'diy' as const, diyContent: 'Custom scope draft' } as DiscussionData;
    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'custom-1', draft: customDraft }));

    state = reducer(state, migrateDiscussionDrafts({
      migrations: { 'custom-1': 'day1' },
    }));

    expect(state.discussionDraftsByScope.day1?.diyContent).toBe('Custom scope draft');
    expect(state.discussionDraftsByScope['custom-1']).toBeUndefined();
  });

  test('copies compatible day 4-8 features into day 3 total severe and clears old target data', () => {
    const { sourceState, targetState } = createCopyTestSetup({
      sourceDay: 4,
      sourceType: 'day4-8',
      sourceProb: '15%',
      targetDay: 3,
      targetType: 'totalSevere',
      targetProb: '30%',
    });

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 4,
        targetDay: 3,
      })
    );

    expectCopyResult({
      state: nextState,
      day: 3,
      outlookType: 'totalSevere',
      probability: '15%',
      expectedLength: 1,
      expectedId: 'source',
    });
    expect(nextState.forecastCycle.days[3]?.data.totalSevere?.get('30%') || []).toHaveLength(0);
  });

  test('copies direct day 1 outlooks into day 2 and deep-clones the features', () => {
    const sourceState = createSourceWithFeatures('source-day1', 'source-categorical');
    const targetState = createTargetWithFeature(2, 'stale-target', 5);

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 1,
        targetDay: 2,
      })
    );

    expectCopyVerification({
      state: nextState,
      sourceState,
      targetDay: 2,
      expectedTornadoId: 'source-day1',
      expectedCategoricalId: 'source-categorical',
    });
  });

  test('copies only categorical outlooks from day 3 into day 1', () => {
    let sourceState = reducer(undefined, setForecastDay(3));
    sourceState = reducer(
      sourceState,
      addFeature({ feature: createOutlookFeature('source-total-severe', 3, 'totalSevere', '15%') })
    );
    sourceState = reducer(
      sourceState,
      addFeature({ feature: createCategoricalFeature('source-categorical', 4) })
    );

    const targetState = reducer(undefined, addFeature({ feature: createFeature('stale-target', 8) }));

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 3,
        targetDay: 1,
      })
    );

    expectCopyResult({
      state: nextState,
      day: 1,
      outlookType: 'categorical',
      probability: 'ENH',
      expectedLength: 1,
      expectedId: 'source-categorical',
    });
    expectOutlookTypeEmpty(nextState, 1, 'tornado');
    expectOutlookTypeEmpty(nextState, 1, 'wind');
    expectOutlookTypeEmpty(nextState, 1, 'hail');
  });

  test('clears incompatible target data when copying from day 1 to day 4', () => {
    const sourceState = reducer(undefined, addFeature({ feature: createFeature('source-day1', 0) }));

    let targetState = reducer(undefined, setForecastDay(4));
    targetState = reducer(
      targetState,
      addFeature({ feature: createOutlookFeature('existing-day48', 6, 'day4-8', '15%') })
    );

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 1,
        targetDay: 4,
      })
    );

    expect(nextState.forecastCycle.days[4]?.data['day4-8']?.size ?? 0).toBe(0);
  });

  it('completeCycle persists acknowledgement metadata without omission reasons', () => {
    let state = reducer(undefined, markAsSaved());
    state = reducer(state, validateCompletion());

    const nextState = reducer(state, completeCycle());

    expect(nextState.forecastCycle.completionAcknowledgedAt).toEqual(expect.any(String));
    expect(nextState.forecastCycle.omittedDayReasons).toBeUndefined();
    expect(nextState.workflowMetadata).toBeUndefined();
    expect(nextState.isSaved).toBe(false);
  });

  it('marks workflow metadata completed so awareness does not recommend it again', () => {
    let state = reducer(undefined, startBlankCycle({
      workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
      cycleDate: '2026-07-13',
    }));

    const nextState = reducer(state, completeCycle());

    expect(nextState.workflowMetadata?.status).toBe('completed');
    expect(nextState.workflowMetadata?.outlookVersions[0].status).toBe('completed');
  });

  it('completeWithOmissions persists acknowledgement metadata and marks the forecast unsaved', () => {
    let state = reducer(undefined, markAsSaved());
    state = reducer(state, validateCompletion());
    state = reducer(state, omitDay({ day: 3, reason: 'No severe weather expected' }));

    expect(state.completionValidation.showCompletionModal).toBe(true);

    const nextState = reducer(state, completeWithOmissions());

    expect(nextState.completionValidation.showCompletionModal).toBe(false);
    expect(nextState.completionValidation.lastResult).toBeNull();
    expect(nextState.forecastCycle.completionAcknowledgedAt).toEqual(expect.any(String));
    expect(nextState.forecastCycle.omittedDayReasons).toEqual({ 3: 'No severe weather expected' });
    expect(nextState.isSaved).toBe(false);
    expect(nextState.completionValidation.omittedDays).toEqual({});
  });

  it('invalidates completed package acknowledgement when an outlook is edited', () => {
    let state = reducer(undefined, startBlankCycle({
      workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
      cycleDate: '2026-07-04',
    }));
    state = reducer(state, addFeature({ feature: createBaseFeature('tor-1', 0, { outlookType: 'tornado', probability: '2%' }) }));
    state = reducer(state, addFeature({ feature: createBaseFeature('wind-1', 2, { outlookType: 'wind', probability: '5%' }) }));
    state = reducer(state, addFeature({ feature: createBaseFeature('hail-1', 4, { outlookType: 'hail', probability: '5%' }) }));
    state = reducer(state, addFeature({ feature: createBaseFeature('cat-1', 6, { outlookType: 'categorical', probability: 'SLGT' }) }));
    state = reducer(state, updateDiscussion({
      day: 1,
      discussion: {
        mode: 'diy',
        validStart: '2026-07-04T12:00',
        validEnd: '2026-07-05T12:00',
        forecasterName: 'Test',
        diyContent: 'Severe storms possible.',
        lastModified: '2026-07-04T12:00:00.000Z',
      },
    }));
    state = reducer(state, validateCompletion());
    state = reducer(state, completeCycle());

    expect(state.forecastCycle.completionAcknowledgedAt).toEqual(expect.any(String));

    state = reducer(state, removeFeature({
      outlookType: 'tornado',
      probability: '2%',
      featureId: 'tor-1',
    }));

    expect(state.forecastCycle.completionAcknowledgedAt).toBeUndefined();

    state = reducer(state, validateCompletion());

    expect(state.completionValidation.lastResult?.isComplete).toBe(false);
    expect(state.completionValidation.lastResult?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          day: 'day1',
          outlookType: 'tornado',
          type: 'missing-polygon',
          severity: 'critical',
        }),
      ]),
    );
  });

  describe('WF-04: Workflow entry, resume, update, and base-cycle actions', () => {
    const testWorkflowTemplate: WorkflowMetadata = {
      id: 'severe-day1',
      label: 'Severe Convective Day 1',
      groupings: ['day1'],
    };

    beforeEach(() => {
      localStorage.clear();
    });

    describe('startBlankCycle', () => {
      it('starts a blank cycle without workflow metadata', () => {
        const state = reducer(undefined, startBlankCycle({}));
        
        expect(state.forecastCycle.days[1]).toBeDefined();
        expect(state.forecastCycle.currentDay).toBe(1);
        expect(state.isSaved).toBe(false);
        expect(state.outlookVersionSnapshots).toEqual([]);
        expect(state.workflowMetadata).toBeUndefined();
        expect(state.workflowTemplate).toBeUndefined();
      });

      it('starts a blank cycle with workflow metadata', () => {
        const state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
          cycleDate: '2026-07-04',
        }));
        
        expect(state.forecastCycle.cycleDate).toBe('2026-07-04');
        expect(state.workflowTemplate).toEqual(testWorkflowTemplate);
        expect(state.workflowMetadata).toBeDefined();
        expect(state.workflowMetadata?.workflowId).toBe('severe-day1');
        expect(state.workflowMetadata?.cycleDate).toBe('2026-07-04');
        expect(state.workflowMetadata?.status).toBe('in-progress');
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(1);
        expect(state.workflowMetadata?.outlookVersions[0].version).toBe(1);
        expect(state.workflowMetadata?.outlookVersions[0].status).toBe('in-progress');
        expect(state.isWorkflowActive).toBe(true);
        expect(localStorage.getItem('gfc-active-forecast-workflow')).toBe('true');
      });

      it('starts workflow templates on their matching forecast day', () => {
        const day2State = reducer(undefined, startBlankCycle({
          workflowTemplate: { id: 'severe-day2', label: 'Severe Convective Day 2', groupings: ['day2'] },
          cycleDate: '2026-07-04',
        }));
        const day48State = reducer(undefined, startBlankCycle({
          workflowTemplate: { id: 'severe-day4-8', label: 'Severe Convective Days 4-8', groupings: ['day4-8'] },
          cycleDate: '2026-07-04',
        }));

        expect(day2State.forecastCycle.currentDay).toBe(2);
        expect(day2State.forecastCycle.days[2]).toBeDefined();
        expect(day48State.forecastCycle.currentDay).toBe(4);
        expect(day48State.forecastCycle.days[4]).toBeDefined();
      });
    });

    it('validates completion against the active workflow groupings only', () => {
      let state = reducer(undefined, startBlankCycle({
        workflowTemplate: testWorkflowTemplate,
        cycleDate: '2026-07-04',
      }));

      state = reducer(state, validateCompletion());

      expect(state.completionValidation.lastResult?.missingGroupings).toEqual(['day1']);
      expect(state.completionValidation.lastResult?.issues.every((issue) => issue.day === 'day1')).toBe(true);
    });

    describe('resumeIncompleteCycle', () => {
      it('resumes a saved cycle and restores workflow metadata', () => {
        // First create a saved cycle with workflow metadata
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        state = reducer(state, markAsSaved());
        state = reducer(state, saveCurrentCycle({ label: 'Test Cycle' }));
        
        const savedCycleId = state.savedCycles[0].id;
        
        // Reset to a new cycle
        state = reducer(state, resetForecasts());
        expect(state.workflowMetadata).toBeUndefined();
        
        // Resume the saved cycle
        state = reducer(state, resumeIncompleteCycle({ cycleId: savedCycleId }));
        
        expect(state.workflowMetadata).toBeDefined();
        expect(state.workflowMetadata?.workflowId).toBe('severe-day1');
        expect(state.isSaved).toBe(true);
        expect(state.outlookVersionSnapshots).toEqual([]);
      });

      it('does nothing if cycle ID is not found', () => {
        const initialState = reducer(undefined, startBlankCycle({}));
        const state = reducer(initialState, resumeIncompleteCycle({ cycleId: 'nonexistent' }));
        
        expect(state).toEqual(initialState);
      });
    });

    describe('createOutlookUpdate', () => {
      it('creates a new outlook version within the current cycle', () => {
        // Start a workflow cycle
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(1);
        expect(state.workflowMetadata?.outlookVersions[0].version).toBe(1);
        
        // Create an update
        state = reducer(state, createOutlookUpdate());
        
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(2);
        expect(state.workflowMetadata?.outlookVersions[0].status).toBe('completed');
        expect(state.workflowMetadata?.outlookVersions[1].version).toBe(2);
        expect(state.workflowMetadata?.outlookVersions[1].status).toBe('in-progress');
        expect(state.workflowMetadata?.outlookVersions[1].derivedFrom).toBe(1);
        expect(state.forecastCycle.updateInProgressVersion).toBe(2);
        expect(state.isSaved).toBe(false);
      });

      it('clears reviewed package state when creating a same-day update', () => {
        let state = reducer(undefined, startBlankCycle({
          workflowTemplate: testWorkflowTemplate,
        }));
        state = reducer(state, completeCycle());

        expect(state.forecastCycle.completionAcknowledgedAt).toEqual(expect.any(String));

        state = reducer(state, createOutlookUpdate());

        expect(state.forecastCycle.completionAcknowledgedAt).toBeUndefined();
        expect(state.forecastCycle.updateInProgressVersion).toBe(2);
        expect(state.workflowMetadata?.status).toBe('in-progress');

        state = reducer(state, completeCycle());

        expect(state.forecastCycle.updateInProgressVersion).toBeUndefined();
      });

      it('creates multiple updates incrementing version numbers', () => {
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        
        state = reducer(state, createOutlookUpdate());
        state = reducer(state, createOutlookUpdate());
        state = reducer(state, createOutlookUpdate());
        
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(4);
        expect(state.workflowMetadata?.outlookVersions[3].version).toBe(4);
        expect(state.workflowMetadata?.outlookVersions[3].derivedFrom).toBe(3);
      });
    });

    describe('startFromPreviousCycle', () => {
      it('creates a new cycle derived from a previous cycle', () => {
        // Create and save a cycle with workflow metadata
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        state = reducer(state, addFeature({ feature: createFeature('previous-day-1', 0) }));
        state = reducer(state, markAsSaved());
        state = reducer(state, saveCurrentCycle({ label: 'Previous Cycle' }));
        
        const previousCycleId = state.savedCycles[0].id;
        
        // Start a new cycle from the previous one
        state = reducer(state, startFromPreviousCycle({
          sourceCycleId: previousCycleId,
          newCycleDate: '2026-07-05',
          workflowTemplate: testWorkflowTemplate,
        }));
        
        expect(state.forecastCycle.cycleDate).toBe('2026-07-05');
        expect(state.forecastCycle.currentDay).toBe(1);
        expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('previous-day-1');
        expect(state.forecastCycle.days[2]).toBeUndefined();
        expect(state.workflowMetadata).toBeDefined();
        expect(state.workflowMetadata?.workflowId).toBe('severe-day1');
        expect(state.workflowMetadata?.cycleDate).toBe('2026-07-05');
        expect(state.workflowMetadata?.status).toBe('in-progress');
        expect(state.isSaved).toBe(false);
        expect(state.outlookVersionSnapshots).toEqual([]);
      });

      it('copies the requested previous day into the requested target day', () => {
        let state = reducer(undefined, setForecastDay(2));
        state = reducer(state, addFeature({ feature: createFeature('previous-day-2', 0) }));
        state = reducer(state, saveCurrentCycle({ label: 'Yesterday Day 2' }));

        state = reducer(state, startFromPreviousCycle({
          sourceCycleId: state.savedCycles[0].id,
          sourceDay: 2,
          targetDay: 1,
          newCycleDate: '2026-07-05',
        }));

        expect(state.forecastCycle.cycleDate).toBe('2026-07-05');
        expect(state.forecastCycle.currentDay).toBe(1);
        expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('previous-day-2');
        expect(state.forecastCycle.days[2]).toBeUndefined();
      });

      it('does nothing if source cycle ID is not found', () => {
        const initialState = reducer(undefined, startBlankCycle({}));
        const state = reducer(initialState, startFromPreviousCycle({
          sourceCycleId: 'nonexistent',
        }));

        expect(state).toEqual(initialState);
      });

      it('leaves workflow inactive when the source is a plain (non-workflow) cycle and no template is passed', () => {
        let state = reducer(undefined, setForecastDay(1));
        state = reducer(state, addFeature({ feature: createFeature('plain-day-1', 0) }));
        state = reducer(state, markAsSaved());
        state = reducer(state, saveCurrentCycle({ label: 'Plain Previous Cycle' }));

        const plainSourceId = state.savedCycles[0].id;

        state = reducer(state, startFromPreviousCycle({
          sourceCycleId: plainSourceId,
          newCycleDate: '2026-07-05',
        }));

        expect(state.workflowMetadata).toBeUndefined();
        expect(state.isWorkflowActive).toBe(false);
        expect(state.workflowTemplate).toBeUndefined();
        expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('plain-day-1');
      });
    });

    describe('createOutlookUpdate snapshot scope', () => {
      it('snapshots every populated day, not only the current one', () => {
        let state = reducer(undefined, startBlankCycle({
          workflowTemplate: testWorkflowTemplate,
        }));
        state = reducer(state, setForecastDay(1));
        state = reducer(state, addFeature({ feature: createFeature('day-1-feature', 0) }));
        state = reducer(state, setForecastDay(2));
        state = reducer(state, addFeature({ feature: createFeature('day-2-feature', 0) }));
        state = reducer(state, setForecastDay(2));

        state = reducer(state, createOutlookUpdate());

        const snapshot = state.outlookVersionSnapshots[0];
        expect(snapshot).toBeDefined();
        expect(snapshot.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('day-1-feature');
        expect(snapshot.days[2]?.data.tornado?.get('2%')?.[0].id).toBe('day-2-feature');
      });
    });
  });
});
