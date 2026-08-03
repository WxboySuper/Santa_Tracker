import type { ForecastCycle } from '../types/outlooks';
import {
  getDiscussionForGrouping,
  getDiscussionGroupings,
  getDiscussionOwnerDay,
  getValidationDiscussionGroupings,
  hasDiscussionContent,
  isValidDiscussionGroupings,
  mergeDiscussionDrafts,
  normalizeDiscussionGroupings,
} from './discussionGrouping';

const discussion = {
  mode: 'diy' as const,
  validStart: '2026-07-13T00:00',
  validEnd: '2026-07-14T00:00',
  forecasterName: 'Forecaster',
  diyContent: 'One canonical discussion',
  lastModified: '2026-07-13T00:00:00.000Z',
};

const cycle = (days: ForecastCycle['days'], discussionGroupings?: ForecastCycle['discussionGroupings']): ForecastCycle => ({
  days,
  currentDay: 4,
  cycleDate: '2026-07-13',
  discussionGroupings,
});

describe('discussionGrouping', () => {
  test('uses one canonical day for a multi-day grouping without copying content', () => {
    const forecastCycle = cycle({
      4: { day: 4, data: { 'day4-8': new Map() }, metadata: { issueDate: '', validDate: '', issuanceTime: '', createdAt: '', lastModified: '' }, discussion },
      5: { day: 5, data: { 'day4-8': new Map() }, metadata: { issueDate: '', validDate: '', issuanceTime: '', createdAt: '', lastModified: '' } },
    });
    const grouping = getDiscussionGroupings(forecastCycle, { id: 'convective-outlook', label: 'Full', groupings: ['day4-8'] })[0];

    expect(getDiscussionOwnerDay(forecastCycle, grouping)).toBe(4);
    expect(getDiscussionForGrouping(forecastCycle, grouping)).toBe(discussion);
    expect(forecastCycle.days[5]?.discussion).toBeUndefined();
  });

  test('preserves custom scopes and treats their canonical discussion as completion content', () => {
    const custom = { id: 'custom-full', label: 'Full outlook', days: [1, 2, 3], discussionDay: 1 as const };
    const forecastCycle = cycle({
      1: { day: 1, data: {}, metadata: { issueDate: '', validDate: '', issuanceTime: '', createdAt: '', lastModified: '' }, discussion },
    }, [custom]);

    expect(getDiscussionGroupings(forecastCycle)).toEqual([custom]);
    expect(hasDiscussionContent(getDiscussionForGrouping(forecastCycle, custom))).toBe(true);
    expect(getValidationDiscussionGroupings(forecastCycle)).toEqual([custom]);
  });

  test('rejects malformed, duplicate, and overlapping scopes instead of silently repairing them', () => {
    expect(isValidDiscussionGroupings([
      { id: 'one', label: 'One', days: [1, 2], discussionDay: 1 },
      { id: 'two', label: 'Two', days: [2, 3], discussionDay: 3 },
    ])).toBe(false);
    expect(isValidDiscussionGroupings([
      { id: 'duplicate', label: 'One', days: [1], discussionDay: 1 },
      { id: 'duplicate', label: 'Two', days: [2], discussionDay: 2 },
    ])).toBe(false);
    expect(isValidDiscussionGroupings([
      { id: 'bad', label: ' ', days: [1], discussionDay: 1 },
    ])).toBe(false);
    expect(normalizeDiscussionGroupings([
      { id: 'bad', label: ' ', days: [1], discussionDay: 1 },
    ])).toEqual([]);
  });

  test('merges mixed DIY and guided drafts into one DIY draft', () => {
    const diyDraft = { ...discussion, diyContent: 'DIY scope text' };
    const guidedDraft = {
      ...discussion,
      mode: 'guided' as const,
      diyContent: undefined,
      guidedContent: {
        synopsis: 'Guided synopsis',
        meteorologicalSetup: '',
        severeWeatherExpectations: '',
        timing: '',
        regionalBreakdown: '',
        additionalConsiderations: '',
      },
    };

    const merged = mergeDiscussionDrafts([diyDraft, guidedDraft], diyDraft);

    expect(merged?.mode).toBe('diy');
    expect(merged?.diyContent).toBe('DIY scope text\n\nGuided synopsis');
  });
});
