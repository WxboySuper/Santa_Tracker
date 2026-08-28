import type { OutlookType } from '../../types/outlooks';

/** First-class paint-bucket interaction modes exposed in the map toolbar. */
export type PaintBucketMode = 'step' | 'assign';
export type PaintBucketStepDirection = 'up' | 'down';

export const PAINT_BUCKET_MODES: readonly PaintBucketMode[] = ['step', 'assign'] as const;

/** Internal edit actions applied to one polygon feature. */
export type PaintBucketEditAction = 'recategorize' | 'step-up' | 'step-down';

export interface PaintBucketEditRequest {
  outlookType: OutlookType;
  featureId: string;
  fromProbability: string;
  action: PaintBucketEditAction;
  activeProbability: string;
  probabilityList: readonly string[];
}

export interface PaintBucketEditResult {
  changed: boolean;
  targetProbability?: string;
  map: Map<string, import('geojson').Feature[]>;
}
