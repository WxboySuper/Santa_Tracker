import type { ActivityId } from '@santa-tracker/contracts/ids';

/** A pure, synchronous single-version step for upgrading one activity's saved payload. */
export type ActivitySaveMigration = {
  activityId: ActivityId;
  fromVersion: number;
  toVersion: number;
  migrate: (payload: unknown) => unknown;
};
