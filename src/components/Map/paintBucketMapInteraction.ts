import type OLMap from 'ol/Map';
import type VectorLayer from 'ol/layer/Vector';
import type { AppDispatch } from '../../store';
import { applyPaintBucketEdit } from '../../store/forecastSlice';
import type { DayType, OutlookType } from '../../types/outlooks';
import { getAvailableProbabilities } from '../OutlookPanel/outlookPanelUtils';
import {
  isPaintBucketOutlookType,
  resolvePaintBucketEditAction,
  type PaintBucketMode,
} from '../../utils/paintBucket';
import { getFeatureIdentity } from './openLayersMapStyles';
import type { EditableOutlookType } from './openLayersMapStyles';
import { pickTopmostPaintBucketFeature } from './pickTopmostPaintBucketFeature';

interface PaintBucketClickInput {
  map: OLMap;
  pixel: number[];
  vectorLayer: VectorLayer | null;
  dispatch: AppDispatch;
  outlookType: OutlookType;
  currentDay: DayType;
  mode: PaintBucketMode;
  shiftKey: boolean;
  stepDirection?: 'up' | 'down';
  activeProbability: string;
  onNoOp?: () => void;
}

interface PaintBucketEditTarget {
  identity: { featureId: string; outlookType: string; probability: string };
  probabilityList: readonly string[];
}

const resolvePaintBucketEditTarget = ({
  map,
  pixel,
  vectorLayer,
  outlookType,
  currentDay,
}: Pick<PaintBucketClickInput, 'map' | 'pixel' | 'vectorLayer' | 'outlookType' | 'currentDay'>): PaintBucketEditTarget | null => {
  if (!isPaintBucketOutlookType(outlookType)) {
    return null;
  }

  const feature = pickTopmostPaintBucketFeature(map, pixel, vectorLayer);
  if (!feature) {
    return null;
  }

  const identity = getFeatureIdentity(feature);
  if (!identity || !isPaintBucketOutlookType(identity.outlookType)) {
    return null;
  }

  const probabilityList = getAvailableProbabilities(outlookType, currentDay);
  return probabilityList.length > 0 ? { identity, probabilityList } : null;
};

/** Handles a paint-bucket click on an existing probabilistic polygon. */
export const handlePaintBucketMapClick = ({
  map,
  pixel,
  vectorLayer,
  dispatch,
  outlookType,
  currentDay,
  mode,
  shiftKey,
  stepDirection = 'up',
  activeProbability,
  onNoOp,
}: PaintBucketClickInput): boolean => {
  const target = resolvePaintBucketEditTarget({
    map,
    pixel,
    vectorLayer,
    outlookType,
    currentDay,
  });
  if (!target) {
    return false;
  }

  if (mode === 'assign' && target.identity.probability === activeProbability) {
    onNoOp?.();
    return false;
  }

  dispatch(applyPaintBucketEdit({
    outlookType: target.identity.outlookType as EditableOutlookType,
    featureId: target.identity.featureId,
    fromProbability: target.identity.probability,
    action: resolvePaintBucketEditAction(mode, shiftKey, stepDirection),
    probabilityList: target.probabilityList,
  }));

  return true;
};
