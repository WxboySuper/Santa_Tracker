/** @typedef {{ head: string; base: string }} RoutingContext */

/** @type {Array<[prefix: string, label: string]>} */
const BRANCH_KIND_LABELS = [
  ['feature/', 'feature'],
  ['fix/', 'fix'],
  ['hotfix/', 'hotfix'],
  ['release/', 'release'],
  ['port/', 'port'],
  ['refactor/', 'refactor'],
];

/**
 * @param {string} head
 * @returns {Set<string>}
 */
const branchKindLabels = (head) => {
  const labels = new Set();
  for (const [prefix, label] of BRANCH_KIND_LABELS) {
    if (head.startsWith(prefix)) labels.add(label);
  }
  return labels;
};

/**
 * @param {string} head
 * @returns {Set<string>}
 */
/**
 * Branch routing and integration priority labels.
 *
 * @param {RoutingContext} context
 * @returns {Set<string>}
 */
export const routingLabels = ({ head, base }) => {
  const labels = branchKindLabels(head);
  if (base === 'main' && (head.startsWith('release/') || head.startsWith('promotion/'))) labels.add('promotion');
  return labels;
};
