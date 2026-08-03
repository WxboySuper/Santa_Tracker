import { anyFileMatches, pathMatches } from './glob-match.mjs';

/** @typedef {{ changedFiles: string[]; head: string }} ContentContext */

/** @type {Array<{ label: string; patterns: string[] }>} */
const CONTENT_LABEL_RULES = [
  { label: 'Component: Map', patterns: ['src/components/Map/**', 'src/maps/**', 'src/monitor/**', 'src/components/Monitor/**'] },
  {
    label: 'Component: Outlooks',
    patterns: [
      'src/components/OutlookPanel/**',
      'src/components/OutlookSelector/**',
      'src/components/OutlookDaySelector/**',
      'src/components/DaySelector/**',
      'src/utils/outlookUtils.*',
    ],
  },
  { label: 'Component: Drawing-Tools', patterns: ['src/components/DrawingTools/**'] },
  { label: 'Component: Export', patterns: ['src/utils/exportUtils.*', 'src/components/DrawingTools/useExportMap.*'] },
  {
    label: 'Component: Storage',
    patterns: [
      'src/components/CloudCycleManager/**',
      'src/components/CycleManager/**',
      'src/hooks/useCloud*/**',
      'src/hooks/useAutoSave.*',
      'src/hooks/useFileLoader.*',
      'src/lib/cloudCyclesService.*',
      'src/lib/firebase.*',
      'src/utils/fileUtils.*',
      'src/utils/cycleHistoryPersistence.*',
      'src/pages/CloudLibraryPage.*',
      'src/auth/**',
      'server/firebase-admin.js',
    ],
  },
  {
    label: 'Component: UI',
    patterns: [
      'src/components/ui/**',
      'src/components/Layout/**',
      'src/components/IntegratedToolbar/**',
      'src/components/Toolbar/**',
      'src/**/*.css',
      'src/App.*',
      'src/index.*',
    ],
  },
  { label: 'Documentation', patterns: ['docs/**', '**/*.md', 'src/components/Documentation/**'] },
  { label: 'dependencies', patterns: ['package.json', 'pnpm-lock.yaml', 'server/package.json', 'server/package-lock.json'] },
  { label: 'e2e-validated', patterns: ['e2e/**'] },
  { label: 'porting', patterns: ['.github/workflows/forward-port-stable-fix.yml', 'scripts/lib/port-targets.mjs', 'scripts/lib/port-conflicts.mjs'] },
  { label: 'quality', patterns: ['.github/workflows/**', 'scripts/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**'] },
  { label: 'javascript', patterns: ['src/**', 'server/**', 'vite.config.*', 'tsconfig*.json', 'playwright.config.*'] },
];

const DOC_ONLY_PATTERNS = ['docs/**', '**/*.md', '.github/**/*.md', 'CHANGELOG.md'];

/**
 * @param {string} head
 * @returns {string | null}
 */
const branchTypeLabel = (head) => {
  if (head.startsWith('hotfix/') || head.startsWith('fix/')) return 'Bug';
  if (head.startsWith('feature/')) return 'Enhancement';
  if (head.startsWith('refactor/')) return 'Refactor';
  return null;
};

/**
 * @param {string[]} changedFiles
 */
const isDocsOnlyChange = (changedFiles) =>
  changedFiles.length > 0 &&
  changedFiles.every((file) => DOC_ONLY_PATTERNS.some((pattern) => pathMatches(file, pattern)));

/**
 * @param {string[]} changedFiles
 * @returns {Set<string>}
 */
const contentLabelsFromDiff = (changedFiles) => {
  const labels = new Set();
  for (const rule of CONTENT_LABEL_RULES) {
    if (rule.patterns.some((pattern) => anyFileMatches(changedFiles, pattern))) {
      labels.add(rule.label);
    }
  }
  return labels;
};

/**
 * Descriptive labels from branch name and changed paths.
 *
 * @param {ContentContext} context
 * @returns {Set<string>}
 */
export const descriptiveLabels = ({ changedFiles, head }) => {
  const labels = new Set();

  const typeLabel = branchTypeLabel(head);
  if (typeLabel) labels.add(typeLabel);

  if (head.startsWith('feature/release-') || head.startsWith('port/')) {
    labels.add('quality');
  }

  if (isDocsOnlyChange(changedFiles)) {
    labels.add('Documentation');
    return labels;
  }

  for (const label of contentLabelsFromDiff(changedFiles)) {
    labels.add(label);
  }

  return labels;
};
