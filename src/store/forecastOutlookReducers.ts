import type { PayloadAction } from '@reduxjs/toolkit';
import type { Feature } from 'geojson';
import { original } from 'immer';
import type {
  DayType,
  OutlookData,
  OutlookDay,
  OutlookType,
  Probability,
} from '../types/outlooks';
import type { ForecastState } from './forecastSlice';

interface PendingFeatureUpdate {
  outlookType: OutlookType;
  probability: string;
  index: number;
  feature: Feature;
}

interface ForecastOutlookReducerDeps {
  getCurrentOutlook: (state: ForecastState) => OutlookData;
  computeOutlookType: (feature: Feature, state: ForecastState) => OutlookType;
  computeProbability: (feature: Feature, state: ForecastState) => string;
  buildFeatureWithProps: (
    feature: Feature,
    outlookType: OutlookType,
    probability: string,
    isSignificant: boolean,
  ) => Feature;
  collectPendingFeatureUpdates: (
    state: ForecastState,
    incoming: Feature[],
  ) => PendingFeatureUpdate[];
  applyPendingFeatureUpdates: (
    state: ForecastState,
    pendingUpdates: PendingFeatureUpdate[],
  ) => void;
  pushUndoSnapshot: (state: ForecastState) => void;
  invalidateCompletionAcknowledgement: (state: ForecastState) => void;
  createEmptyDay: (day: DayType, timestamp: string) => OutlookDay;
  readActionTimestamp: <T>(action: PayloadAction<T>) => string;
  areTstmFeaturesEqual: (left: Feature[], right: Feature[]) => boolean;
}

const DEFAULT_PROBABILITIES: Partial<Record<OutlookType, Probability>> = {
  tornado: '2%',
  wind: '5%',
  hail: '5%',
  totalSevere: '5%',
  'day4-8': '15%',
  categorical: 'MRGL',
};

const applyFeatureUpdates = (
  deps: ForecastOutlookReducerDeps,
  state: ForecastState,
  incoming: Feature[],
) => {
  const pendingUpdates = deps.collectPendingFeatureUpdates(state, incoming);
  if (pendingUpdates.length === 0) return;
  deps.pushUndoSnapshot(state);
  deps.applyPendingFeatureUpdates(state, pendingUpdates);
  deps.invalidateCompletionAcknowledgement(state);
  state.isSaved = false;
};

export const createForecastOutlookReducers = (deps: ForecastOutlookReducerDeps) => ({

  setForecastDay: (state: ForecastState, action: PayloadAction<DayType>) => {
    const newDay = action.payload;
    if (!state.forecastCycle.days[newDay]) {
      state.forecastCycle.days[newDay] = deps.createEmptyDay(
        newDay,
        deps.readActionTimestamp(action),
      );
    }
    state.forecastCycle.currentDay = newDay;
    state.isSaved = false;
  },

  setCycleDate: (state: ForecastState, action: PayloadAction<string>) => {
    state.forecastCycle.cycleDate = action.payload;
    state.isSaved = false;
  },

  setActiveOutlookType: (state: ForecastState, action: PayloadAction<OutlookType>) => {
    state.drawingState.activeOutlookType = action.payload;
    const defaultProbability = DEFAULT_PROBABILITIES[action.payload];
    if (defaultProbability) {
      state.drawingState.activeProbability = defaultProbability;
    }
    state.isSaved = false;
  },

  setEmergencyMode: (state: ForecastState, action: PayloadAction<boolean>) => {
    state.emergencyMode = action.payload;
  },

  setActiveProbability: (state: ForecastState, action: PayloadAction<Probability>) => {
    state.drawingState.activeProbability = action.payload;
    if (typeof action.payload === 'string') {
      state.drawingState.isSignificant = action.payload.includes('#');
    }
    state.isSaved = false;
  },

  toggleSignificant: (state: ForecastState) => {
    state.drawingState.isSignificant = !state.drawingState.isSignificant;
    state.isSaved = false;
  },

  addFeature: (state: ForecastState, action: PayloadAction<{ feature: Feature }>) => {
    const feature = action.payload.feature;
    const outlookType = deps.computeOutlookType(feature, state);
    const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
    const outlookMap = dayData?.data[outlookType];
    if (!dayData || !outlookMap) {
      return;
    }

    const probability = deps.computeProbability(feature, state);
    deps.pushUndoSnapshot(state);
    if (dayData.metadata.lowProbabilityOutlooks) {
      dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
        (type) => type !== outlookType,
      );
    }

    const existingFeatures = outlookMap.get(probability) || [];
    outlookMap.set(probability, [
      ...existingFeatures,
      deps.buildFeatureWithProps(feature, outlookType, probability, state.drawingState.isSignificant),
    ]);
    deps.invalidateCompletionAcknowledgement(state);
    state.isSaved = false;
  },

  updateFeature: (state: ForecastState, action: PayloadAction<{ feature: Feature }>) => {
    applyFeatureUpdates(deps, state, [action.payload.feature]);
  },

  updateFeaturesBatch: (state: ForecastState, action: PayloadAction<{ features: Feature[] }>) => {
    applyFeatureUpdates(deps, state, action.payload.features);
  },

  removeFeature: (state: ForecastState, action: PayloadAction<{
    outlookType: OutlookType;
    probability: string;
    featureId: string;
  }>) => {
    const { outlookType, probability, featureId } = action.payload;
    const outlookMap = deps.getCurrentOutlook(state)[outlookType];
    const features = outlookMap?.get(probability);
    const featureIndex = features?.findIndex((feature) => feature.id === featureId) ?? -1;
    if (!outlookMap) return;
    if (!features) return;
    if (featureIndex === -1) return;

    deps.pushUndoSnapshot(state);
    const updatedFeatures = features.filter((feature) => feature.id !== featureId);
    if (updatedFeatures.length > 0) {
      outlookMap.set(probability, updatedFeatures);
    } else {
      outlookMap.delete(probability);
    }
    deps.invalidateCompletionAcknowledgement(state);
    state.isSaved = false;
  },

  resetCategorical: (state: ForecastState) => {
    const outlooks = deps.getCurrentOutlook(state);
    const categorical = outlooks.categorical;
    if (!categorical) {
      return;
    }
    const categoricalTypes = Array.from(categorical.keys());
    if (categoricalTypes.every((type) => type === 'TSTM')) {
      return;
    }

    const tstmFeatures = categorical.get('TSTM') || [];
    deps.pushUndoSnapshot(state);
    outlooks.categorical = new Map();
    if (tstmFeatures.length > 0) {
      outlooks.categorical.set('TSTM', tstmFeatures);
    }
    deps.invalidateCompletionAcknowledgement(state);
    state.isSaved = false;
  },

  setOutlookMap: (state: ForecastState, action: PayloadAction<{
    outlookType: OutlookType;
    map: Map<string, Feature[]>;
  }>) => {
    const { outlookType, map } = action.payload;
    const outlookData = deps.getCurrentOutlook(state);
    const currentMap = outlookData[outlookType];
    if (!currentMap || currentMap === map || original(currentMap) === map) {
      return;
    }

    deps.pushUndoSnapshot(state);
    outlookData[outlookType] = map;
    deps.invalidateCompletionAcknowledgement(state);
    state.isSaved = false;
  },

  applyAutoCategoricalSync: (
    state: ForecastState,
    action: PayloadAction<{ map: Map<string, Feature[]> }>,
  ) => {
    const outlookData = deps.getCurrentOutlook(state);
    if (!outlookData.categorical) {
      return;
    }
    outlookData.categorical = action.payload.map;
    deps.invalidateCompletionAcknowledgement(state);
    state.isSaved = false;
  },

  replaceTstmFeatures: (
    state: ForecastState,
    action: PayloadAction<{ features: Feature[] }>,
  ) => {
    const categorical = deps.getCurrentOutlook(state).categorical;
    if (!categorical) {
      return;
    }

    const normalizedFeatures = action.payload.features.map((feature) =>
      deps.buildFeatureWithProps(feature, 'categorical', 'TSTM', false),
    );
    const existingTstm = categorical.get('TSTM') || [];
    if (deps.areTstmFeaturesEqual(existingTstm, normalizedFeatures)) {
      return;
    }

    deps.pushUndoSnapshot(state);
    if (normalizedFeatures.length > 0) {
      categorical.set('TSTM', normalizedFeatures);
    } else {
      categorical.delete('TSTM');
    }
    deps.invalidateCompletionAcknowledgement(state);
    state.isSaved = false;
  },

  setMapView: (state: ForecastState, action: PayloadAction<{ center: [number, number]; zoom: number }>) => {
    state.currentMapView = action.payload;
  },
});
