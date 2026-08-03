import { act, renderHook } from '@testing-library/react';
import useDiscussionFormState from './useDiscussionFormState';
import type { DiscussionData } from '../types/outlooks';

const loadedDiscussion: DiscussionData = {
  mode: 'diy',
  validStart: '2026-07-13T00:00',
  validEnd: '2026-07-14T00:00',
  forecasterName: 'Loaded forecaster',
  diyContent: 'Loaded discussion text',
  lastModified: '2026-07-13T00:00:00.000Z',
};

describe('useDiscussionFormState', () => {
  test('does not arm autosave when a discussion scope is loaded, but does after an edit', () => {
    jest.useFakeTimers();
    const dispatch = jest.fn();
    const { result, rerender } = renderHook(
      ({ discussionKey, existingDiscussion }: { discussionKey: string; existingDiscussion?: DiscussionData }) =>
        useDiscussionFormState({
          discussionKey,
          existingDiscussion,
          defaultForecasterName: 'Default forecaster',
          dispatch,
        }),
      { initialProps: { discussionKey: 'group-a', existingDiscussion: undefined } },
    );

    rerender({ discussionKey: 'group-b', existingDiscussion: loadedDiscussion });

    expect(result.current.hasUnsavedChanges).toBe(false);
    jest.advanceTimersByTime(6000);
    expect(dispatch).not.toHaveBeenCalled();

    act(() => result.current.handleDiy('Edited discussion text'));

    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
