import {
  assertNavigationHidden,
  mockFeatureExposureOnTarget,
  runWithBuildTarget,
  singleTargetOn,
} from '../testing/featureExposure/harness';
import {
  APP_NAVIGATION_ITEMS,
  getNavigationKeyboardShortcuts,
  getVisibleNavigationItems,
} from './featureNavigation';

describe('featureNavigation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps core navigation visible when gated features are disabled', () => {
    runWithBuildTarget('production', () => {
      expect(getVisibleNavigationItems('production').map((item) => item.id)).toEqual([
        'home',
        'forecast',
        'discussion',
        'verification',
        'monitor',
      ]);
      assertNavigationHidden('tropicalWorkspace', ['production']);
      assertNavigationHidden('collaborationRoom', ['production']);
    });
  });

  test('includes gated navigation only when the feature is exposed on the target', () => {
    const exposureSpy = mockFeatureExposureOnTarget('tropicalWorkspace', singleTargetOn('local'));

    expect(getVisibleNavigationItems('local').map((item) => item.id)).toContain('tropical-workspace');
    expect(getVisibleNavigationItems('production').map((item) => item.id)).not.toContain(
      'tropical-workspace'
    );

    exposureSpy.mockRestore();
  });

  test('omits keyboard shortcuts for hidden gated destinations', () => {
    const navigate = jest.fn();
    const shortcuts = getNavigationKeyboardShortcuts(navigate, 'production');

    expect(Object.keys(shortcuts).sort()).toEqual(['1', '2', '3', '4', 'd', 'h']);
    expect(shortcuts['5']).toBeUndefined();
    expect(shortcuts['6']).toBeUndefined();
  });

  test('declares every navigation item with a stable id', () => {
    const ids = APP_NAVIGATION_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
