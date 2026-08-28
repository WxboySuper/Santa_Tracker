import type { OutlookType } from '../../types/outlooks';
import type { PaintBucketEditAction, PaintBucketMode, PaintBucketStepDirection } from './types';

const PAINT_BUCKET_OUTLOOK_TYPES = new Set<OutlookType>([
  'tornado',
  'wind',
  'hail',
  'totalSevere',
  'day4-8',
]);

/** Paint bucket applies to probabilistic outlook layers only (not categorical). */
export const isPaintBucketOutlookType = (outlookType: string): outlookType is OutlookType =>
  PAINT_BUCKET_OUTLOOK_TYPES.has(outlookType as OutlookType);

/** Maps a toolbar mode plus modifiers to the edit action dispatched to Redux. */
export const resolvePaintBucketEditAction = (
  mode: PaintBucketMode,
  shiftKey: boolean,
  stepDirection: PaintBucketStepDirection = 'up',
): PaintBucketEditAction => {
  if (mode === 'assign') {
    return 'recategorize';
  }
  return shiftKey || stepDirection === 'down' ? 'step-down' : 'step-up';
};
