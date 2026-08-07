import { descriptiveLabels } from './pr-label-content.mjs';
import { exposureLabels } from './pr-label-exposure.mjs';
import { routingLabels } from './pr-label-routing.mjs';

export { CONTENT_MANAGED_LABELS, CI_MANAGED_LABELS, MANAGED_LABELS } from './pr-label-managed.mjs';
export { routingLabels } from './pr-label-routing.mjs';
export { descriptiveLabels } from './pr-label-content.mjs';
export { exposureLabels } from './pr-label-exposure.mjs';

/**
 * @param {{
 *   head: string;
 *   base: string;
 *   changedFiles: string[];
 *   mergeable: boolean | null;
 *   draft: boolean;
 *   changelog: { ok: boolean; skipped?: boolean };
 * }} context
 * @returns {string[]}
 */
export const computePrLabels = ({ head, base, changedFiles, mergeable, draft, changelog }) => {
  const labels = new Set([
    ...routingLabels({ head, base }),
    ...descriptiveLabels({ changedFiles, head }),
    ...exposureLabels({ changedFiles }),
  ]);

  if (mergeable === false) labels.add('has conflicts');
  if (draft) labels.add('draft');
  if (!changelog.ok) {
    labels.add('changelog:missing');
  } else if (changelog.skipped) {
    labels.add('changelog:skip');
  } else {
    labels.add('changelog:ok');
  }

  return [...labels].sort();
};
