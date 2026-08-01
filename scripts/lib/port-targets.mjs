import { PORTING_MANUAL_LABEL } from './porting-constants.mjs';

export { PORTING_MANUAL_LABEL } from './porting-constants.mjs';

/** @param {string | undefined} json */
export const parseOpenPortPrsJson = (json) => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** @deprecated Use parseOpenPortPrsJson. */
export const parseOpenBetaPrsJson = parseOpenPortPrsJson;

/**
 * Stable merges are the only merges that need a forward-port target. Main
 * merges intentionally have no reverse target because main contains work that
 * is not approved for the current production line.
 */
export const resolvePortTargets = ({ baseBranch }) =>
  /^stable\/\d+\.\d+\.x$/.test(baseBranch) ? ['main'] : [];

/** @param {string} text @param {number} sourcePrNumber @returns {boolean} */
const referencesSourcePr = (text, sourcePrNumber) =>
  new RegExp(`\\b(?:port|backport|forward[- ]port)\\s+(?:of\\s+)?(?:PR\\s*)?#${sourcePrNumber}(?!\\d)`, 'i').test(text ?? '');

/** @param {{ headRefName: string; title?: string; body?: string }} pr @param {number} sourcePrNumber */
export const isManualForwardPortPr = (pr, sourcePrNumber) =>
  !pr.headRefName.startsWith('port/') &&
  (referencesSourcePr(pr.title ?? '', sourcePrNumber) || referencesSourcePr(pr.body ?? '', sourcePrNumber));

/** @param {{ labels?: string[]; openPortPrs?: Array<{ number: number; headRefName: string; title?: string; body?: string; url?: string }>; sourcePrNumber: number }} context */
export const shouldSkipPorting = ({ labels = [], openPortPrs = [], sourcePrNumber }) => {
  if (labels.includes(PORTING_MANUAL_LABEL)) {
    return { skip: true, reason: `Source PR has \`${PORTING_MANUAL_LABEL}\` label; automated porting skipped.` };
  }
  const manualPr = openPortPrs.find((pr) => isManualForwardPortPr(pr, sourcePrNumber));
  if (manualPr) {
    return { skip: true, reason: `Open manual forward-port PR #${manualPr.number} already exists.`, manualPr };
  }
  return { skip: false };
};
