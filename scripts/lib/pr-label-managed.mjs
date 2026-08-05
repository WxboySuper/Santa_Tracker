/** CI labels owned by check-run aggregation (not touched on pull_request sync). */
export const CI_MANAGED_LABELS = ['ci:pending', 'ci:passing', 'ci:failing'];

/** Labels recomputed on pull_request events (routing, changelog, descriptive). */
export const CONTENT_MANAGED_LABELS = [
  'promotion',
  'feature',
  'fix',
  'hotfix',
  'release',
  'port',
  'refactor',
  'integration:primary',
  'integration:other',
  'has conflicts',
  'draft',
  'changelog:ok',
  'changelog:missing',
  'changelog:skip',
  'Documentation',
  'Enhancement',
  'Bug',
  'Refactor',
  'javascript',
  'dependencies',
  'quality',
  'e2e-validated',
  'porting',
  'Component: Map',
  'Component: Outlooks',
  'Component: Drawing-Tools',
  'Component: Export',
  'Component: UI',
  'Component: Storage',
  'exposure:production',
  'exposure:server-backed',
  'exposure:registry-change',
];

/** @deprecated Use CONTENT_MANAGED_LABELS or CI_MANAGED_LABELS */
export const MANAGED_LABELS = [...CONTENT_MANAGED_LABELS, ...CI_MANAGED_LABELS];
