import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  migrateDiscussionDrafts,
  resetDiscussionGroupings,
  setDiscussionGroupings,
  setForecastDay,
} from '../store/forecastSlice';
import type { DayType, DiscussionGrouping, ForecastCycle } from '../types/outlooks';
import { getDiscussionOwnerDay, standaloneDiscussionGrouping } from '../utils/discussionGrouping';

/** Combines selected discussion scopes into one custom grouping. */
const combineDiscussionGroupings = (
  selected: DiscussionGrouping[],
  label: string,
  forecastCycle: ForecastCycle,
): DiscussionGrouping => ({
  id: `custom-${Date.now()}`,
  label,
  days: Array.from(new Set(selected.flatMap(({ days }) => days))).sort((a, b) => a - b) as DayType[],
  discussionDay: getDiscussionOwnerDay(forecastCycle, selected[0]),
});

/** Builds draft migrations from removed scope ids to one combined scope. */
const buildCombineDraftMigrations = (
  selected: DiscussionGrouping[],
  combinedScopeId: string,
): Record<string, string> => Object.fromEntries(selected.map(({ id }) => [id, combinedScopeId]));

/** Builds draft migrations from custom scopes back to their default owner scopes. */
const buildResetDraftMigrations = (
  groupings: DiscussionGrouping[],
  defaultGroupings: DiscussionGrouping[],
): Record<string, string> => {
  const migrations: Record<string, string> = {};
  groupings.forEach((grouping) => {
    const target = defaultGroupings.find((defaultGrouping) => defaultGrouping.days.includes(grouping.discussionDay))
      ?? standaloneDiscussionGrouping(grouping.discussionDay);
    if (grouping.id !== target.id) migrations[grouping.id] = target.id;
  });
  return migrations;
};

interface DiscussionGroupingActionsOptions {
  forecastCycle: ForecastCycle;
  groupings: DiscussionGrouping[];
  defaultGroupings: DiscussionGrouping[];
  currentDay: DayType;
  selectedGroupingId: string;
  persistDraft?: () => void;
}

/** Provides navigation and reset actions for discussion scopes. */
export const useDiscussionGroupingActions = ({
  forecastCycle,
  groupings,
  defaultGroupings,
  currentDay,
  selectedGroupingId,
  persistDraft,
}: DiscussionGroupingActionsOptions) => {
  const dispatch = useDispatch();
  const [, setSearchParams] = useSearchParams();

  const handleCombine = useCallback((selected: DiscussionGrouping[], label: string) => {
    if (selected.length < 2) return;
    persistDraft?.();
    const selectedIds = new Set(selected.map(({ id }) => id));
    const combined = combineDiscussionGroupings(selected, label, forecastCycle);
    dispatch(migrateDiscussionDrafts({
      migrations: buildCombineDraftMigrations(selected, combined.id),
      preferScopeId: selectedIds.has(selectedGroupingId) ? selectedGroupingId : undefined,
    }));
    dispatch(setDiscussionGroupings([
      ...groupings.filter(({ id }) => !selectedIds.has(id)),
      combined,
    ]));
    dispatch(setForecastDay(combined.discussionDay));
    setSearchParams({ group: combined.id });
  }, [dispatch, forecastCycle, groupings, persistDraft, selectedGroupingId, setSearchParams]);

  const handleReset = useCallback(() => {
    persistDraft?.();
    dispatch(migrateDiscussionDrafts({ migrations: buildResetDraftMigrations(groupings, defaultGroupings) }));
    dispatch(resetDiscussionGroupings());
    const currentDefault = defaultGroupings.find(({ days }) => days.includes(currentDay)) ?? defaultGroupings[0];
    setSearchParams({ group: currentDefault?.id ?? `day-${currentDay}` });
  }, [currentDay, defaultGroupings, dispatch, groupings, persistDraft, setSearchParams]);

  return { handleCombine, handleReset } as const;
};
