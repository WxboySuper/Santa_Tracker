import type { BuildTarget } from './buildTarget';
import { getBuildTarget } from './buildTarget';
import { isFeatureExposedOnTarget, type FeatureKey } from './featureExposure';

export type AppNavigationItem = {
  id: string;
  to: string;
  label: string;
  shortcutKey?: string;
  shortcutLabel?: string;
  end?: boolean;
  feature?: FeatureKey;
};

/** Primary navbar destinations. Items with a feature key render only when that feature is exposed. */
const RAW_APP_NAVIGATION_ITEMS = [
  { id: 'home', to: '/', label: 'Home', shortcutKey: 'h', shortcutLabel: '⌃H', end: true },
  { id: 'forecast', to: '/forecast', label: 'Forecast', shortcutKey: '1', shortcutLabel: '⌃1' },
  { id: 'discussion', to: '/discussion', label: 'Discussion', shortcutKey: '2', shortcutLabel: '⌃2' },
  { id: 'verification', to: '/verification', label: 'Verification', shortcutKey: '3', shortcutLabel: '⌃3' },
  { id: 'monitor', to: '/monitor', label: 'Monitor', shortcutKey: '4', shortcutLabel: '⌃4' },
  {
    id: 'tropical-workspace',
    to: '/tropical',
    label: 'Tropical',
    shortcutKey: '5',
    shortcutLabel: '⌃5',
    feature: 'tropicalWorkspace',
  },
  {
    id: 'collaboration-room',
    to: '/collaborate',
    label: 'Collaborate',
    shortcutKey: '6',
    shortcutLabel: '⌃6',
    feature: 'collaborationRoom',
  },
] as const satisfies readonly AppNavigationItem[];

export const APP_NAVIGATION_ITEMS: readonly AppNavigationItem[] = RAW_APP_NAVIGATION_ITEMS;
export type AppNavigationItemId = (typeof RAW_APP_NAVIGATION_ITEMS)[number]['id'];

export type AppNavigationItemWithId = AppNavigationItem & { id: AppNavigationItemId };

/** Returns navbar items visible for the given deployment target. */
export const getVisibleNavigationItems = (
  target: BuildTarget = getBuildTarget()
): AppNavigationItemWithId[] =>
  APP_NAVIGATION_ITEMS.filter(
    (item) => !item.feature || isFeatureExposedOnTarget(item.feature, target)
  ) as AppNavigationItemWithId[];

/** Builds Ctrl/Cmd navigation shortcuts for visible navbar destinations. */
export const getNavigationKeyboardShortcuts = (
  navigate: (path: string) => void,
  target: BuildTarget = getBuildTarget()
): Record<string, () => void> => {
  const shortcuts: Record<string, () => void> = {
    d: () => document.documentElement.classList.toggle('dark-mode'),
  };

  for (const item of getVisibleNavigationItems(target)) {
    if (item.shortcutKey) {
      shortcuts[item.shortcutKey] = () => navigate(item.to);
    }
  }

  return shortcuts;
};
