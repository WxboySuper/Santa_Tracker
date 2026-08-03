import type { DiscussionData, DiscussionGrouping, DayType, ForecastCycle, GuidedDiscussionData } from '../types/outlooks';
import type { StandardGrouping, WorkflowMetadata } from '../types/workflow';

export const STANDARD_DISCUSSION_GROUPINGS: readonly DiscussionGrouping[] = [
  { id: 'day1', label: 'Day 1', days: [1], discussionDay: 1 },
  { id: 'day2', label: 'Day 2', days: [2], discussionDay: 2 },
  { id: 'day3', label: 'Day 3', days: [3], discussionDay: 3 },
  { id: 'day4-8', label: 'Days 4–8', days: [4, 5, 6, 7, 8], discussionDay: 4 },
];

const STANDARD_GROUPING_IDS = new Set(STANDARD_DISCUSSION_GROUPINGS.map(({ id }) => id));

/** Returns true when a value is one of the supported forecast day numbers. */
/** @internal */
const isDayType = (value: unknown): value is DayType =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;

/** Returns true when a discussion has user-authored content. */
export const hasDiscussionContent = (discussion: DiscussionData | undefined): boolean => {
  if (!discussion) return false;
  if (discussion.mode === 'diy') return Boolean(discussion.diyContent?.trim());
  return Boolean(
    discussion.guidedContent
      && Object.values(discussion.guidedContent).some((value) => value.trim().length > 0),
  );
};

const EMPTY_GUIDED_CONTENT: GuidedDiscussionData = {
  synopsis: '',
  meteorologicalSetup: '',
  severeWeatherExpectations: '',
  timing: '',
  regionalBreakdown: '',
  additionalConsiderations: '',
};

/** Orders drafts so the preferred scope draft is merged first. */
const orderDiscussionDrafts = (drafts: DiscussionData[], preferredDraft?: DiscussionData): DiscussionData[] => {
  const filtered = drafts.filter(Boolean);
  if (!preferredDraft) return filtered;
  return [preferredDraft, ...filtered.filter((draft) => draft !== preferredDraft)];
};

/** Combines DIY drafts into one DIY draft. */
const mergeDiyDiscussionDrafts = (primary: DiscussionData, drafts: DiscussionData[]): DiscussionData => ({
  ...primary,
  mode: 'diy',
  diyContent: drafts.map((draft) => draft.diyContent?.trim()).filter(Boolean).join('\n\n'),
  guidedContent: undefined,
  lastModified: new Date().toISOString(),
});

/** Combines guided drafts by filling the first empty field for each section. */
const mergeGuidedDiscussionDrafts = (primary: DiscussionData, drafts: DiscussionData[]): DiscussionData => {
  const guidedContent = { ...EMPTY_GUIDED_CONTENT };
  drafts.forEach((draft) => {
    if (!draft.guidedContent) return;
    (Object.keys(guidedContent) as Array<keyof GuidedDiscussionData>).forEach((key) => {
      const value = draft.guidedContent?.[key]?.trim();
      if (value && !guidedContent[key].trim()) guidedContent[key] = value;
    });
  });
  return { ...primary, mode: 'guided', guidedContent, diyContent: undefined, lastModified: new Date().toISOString() };
};

/** Serializes guided sections into plain text for mixed-mode merges. */
const serializeGuidedDraft = (draft: DiscussionData): string | undefined => {
  if (draft.mode !== 'guided' || !draft.guidedContent) return undefined;
  const text = Object.values(draft.guidedContent).map((value) => value.trim()).filter(Boolean).join('\n\n');
  return text || undefined;
};

/** Preserves both DIY and guided draft text when scopes used different editor modes. */
const mergeMixedDiscussionDrafts = (primary: DiscussionData, drafts: DiscussionData[]): DiscussionData => {
  const textParts = drafts.flatMap((draft) => {
    if (draft.mode === 'diy') {
      const diyContent = draft.diyContent?.trim();
      return diyContent ? [diyContent] : [];
    }
    const guidedText = serializeGuidedDraft(draft);
    return guidedText ? [guidedText] : [];
  });
  return mergeDiyDiscussionDrafts(primary, [{ ...primary, mode: 'diy', diyContent: textParts.join('\n\n') }]);
};

/** Merges multiple unpublished drafts into one combined-scope draft. */
export const mergeDiscussionDrafts = (
  drafts: DiscussionData[],
  preferredDraft?: DiscussionData,
): DiscussionData | undefined => {
  const ordered = orderDiscussionDrafts(drafts, preferredDraft);
  if (ordered.length === 0) return undefined;

  const primary = ordered[0];
  if (ordered.every((draft) => draft.mode === 'diy')) return mergeDiyDiscussionDrafts(primary, ordered);
  if (ordered.every((draft) => draft.mode === 'guided')) return mergeGuidedDiscussionDrafts(primary, ordered);
  return mergeMixedDiscussionDrafts(primary, ordered);
};

/** Returns the standard discussion grouping for one workflow grouping. */
export const discussionGroupingForStandard = (
  grouping: StandardGrouping,
): DiscussionGrouping => STANDARD_DISCUSSION_GROUPINGS.find(({ id }) => id === grouping)
  ?? STANDARD_DISCUSSION_GROUPINGS[0];

/** Creates one discussion grouping for a standalone day route. */
export const standaloneDiscussionGrouping = (day: DayType): DiscussionGrouping => ({
  id: `day-${day}`,
  label: `Day ${day}`,
  days: [day],
  discussionDay: day,
});

/**
 * Validates persisted grouping data without silently repairing it.
 * Invalid scopes must not control export or completion behavior because a malformed
 * id, day list, or overlap can hide a legacy day discussion.
 */
/** Returns whether one persisted grouping has valid fields and day coverage. */
const hasNonEmptyText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Checks that a grouping covers unique supported days including its owner day. */
const hasUniqueDayCoverage = (days: unknown[], discussionDay: unknown): discussionDay is DayType =>
  days.length > 0
  && days.every(isDayType)
  && new Set(days).size === days.length
  && isDayType(discussionDay)
  && days.includes(discussionDay);

/** Checks the scalar fields and day list shape of one persisted grouping. */
const hasValidGroupingShape = (candidate: Partial<DiscussionGrouping>): candidate is DiscussionGrouping =>
  hasNonEmptyText(candidate.id)
  && hasNonEmptyText(candidate.label)
  && Array.isArray(candidate.days)
  && hasUniqueDayCoverage(candidate.days, candidate.discussionDay);

/** Validates one grouping and records its ids and covered days. */
const isValidDiscussionGrouping = (
  value: unknown,
  ids: Set<string>,
  coveredDays: Set<DayType>,
): value is DiscussionGrouping => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DiscussionGrouping>;
  if (!hasValidGroupingShape(candidate)) return false;
  const id = candidate.id.trim();
  const typedDays = candidate.days;
  if (ids.has(id) || typedDays.some((day) => coveredDays.has(day))) return false;
  ids.add(id);
  typedDays.forEach((day) => coveredDays.add(day));
  return true;
};

/** Validates persisted grouping data without silently repairing it. */
export const isValidDiscussionGroupings = (value: unknown): value is DiscussionGrouping[] => {
  if (!Array.isArray(value) || value.length === 0) return false;
  const ids = new Set<string>();
  const coveredDays = new Set<DayType>();
  return value.every((grouping) => isValidDiscussionGrouping(grouping, ids, coveredDays));
};

/** Normalizes valid persisted grouping data while preserving its explicit scope boundaries. */
export const normalizeDiscussionGroupings = (
  groupings: unknown,
): DiscussionGrouping[] => {
  if (!isValidDiscussionGroupings(groupings)) return [];
  return groupings.map((grouping) => ({
    id: grouping.id.trim(),
    label: grouping.label.trim(),
    days: [...grouping.days],
    discussionDay: grouping.discussionDay,
  }));
};

/** Returns the default scopes implied by a workflow template or standalone route. */
export const getDefaultDiscussionGroupings = (
  workflowTemplate?: WorkflowMetadata,
  currentDay: DayType = 1,
): DiscussionGrouping[] => {
  const workflowGroupings = (workflowTemplate?.groupings ?? [])
    .filter((grouping): grouping is StandardGrouping => STANDARD_GROUPING_IDS.has(grouping));
  if (workflowGroupings.length > 0) return workflowGroupings.map(discussionGroupingForStandard);
  return [standaloneDiscussionGrouping(currentDay)];
};

/** Resolves persisted custom scopes, workflow defaults, or standalone day scope. */
export const getDiscussionGroupings = (
  forecastCycle: ForecastCycle,
  workflowTemplate?: WorkflowMetadata,
  currentDay: DayType = forecastCycle.currentDay,
): DiscussionGrouping[] => {
  const persisted = normalizeDiscussionGroupings(forecastCycle.discussionGroupings);
  if (persisted.length > 0) return persisted;
  return getDefaultDiscussionGroupings(workflowTemplate, currentDay);
};

/** Returns the configured grouping that owns a day, preferring an exact one-day match. */
export const getDiscussionGroupingForDay = (
  groupings: DiscussionGrouping[],
  day: DayType,
): DiscussionGrouping | undefined => groupings.find((grouping) => grouping.days.length === 1 && grouping.days[0] === day)
  ?? groupings.find((grouping) => grouping.days.includes(day));

/** Returns the grouping selected by id, falling back to the grouping containing the active day. */
export const resolveDiscussionGrouping = (
  groupings: DiscussionGrouping[],
  id: string | null | undefined,
  day: DayType,
): DiscussionGrouping => groupings.find((grouping) => grouping.id === id)
  ?? getDiscussionGroupingForDay(groupings, day)
  ?? groupings[0]
  ?? standaloneDiscussionGrouping(day);

/** Chooses the canonical legacy day that stores a grouping discussion, without copying content. */
export const getDiscussionOwnerDay = (
  forecastCycle: ForecastCycle,
  grouping: DiscussionGrouping,
): DayType => {
  if (hasDiscussionContent(forecastCycle.days[grouping.discussionDay]?.discussion)) {
    return grouping.discussionDay;
  }

  const existingDay = grouping.days.find((day) => hasDiscussionContent(forecastCycle.days[day]?.discussion));
  return existingDay ?? grouping.discussionDay;
};

/** Reads one grouping discussion from its canonical legacy day slot. */
export const getDiscussionForGrouping = (
  forecastCycle: ForecastCycle,
  grouping: DiscussionGrouping,
): DiscussionData | undefined => forecastCycle.days[getDiscussionOwnerDay(forecastCycle, grouping)]?.discussion;

/** Builds the configured/default grouping set used by completion validation. */
export const getValidationDiscussionGroupings = (
  forecastCycle: ForecastCycle,
  expectedGroupings?: StandardGrouping[],
): DiscussionGrouping[] => {
  const persisted = normalizeDiscussionGroupings(forecastCycle.discussionGroupings);
  if (persisted.length > 0) return persisted;

  const groupings = expectedGroupings ?? ['day1', 'day2', 'day3', 'day4-8'];
  return groupings.map(discussionGroupingForStandard);
};

/** Returns a stable path query value for deep-linking to a workflow discussion. */
export const discussionPathForGrouping = (grouping: DiscussionGrouping): string =>
  `/discussion?group=${encodeURIComponent(grouping.id)}`;
