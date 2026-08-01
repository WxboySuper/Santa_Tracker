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

const isPromotionBranch = (head) => head.startsWith('release/') || head.startsWith('promotion/');

/** @param {string} base @param {string} head @returns {Set<string>} */
const promotionLabels = (base, head) => {
  if (base !== 'main' || !isPromotionBranch(head)) return new Set();
  return new Set(['promotion']);
};

/**
 * Branch routing and integration priority labels.
 *
 * @param {RoutingContext} context
 * @returns {Set<string>}
 */
export const routingLabels = ({ head, base }) => {
  return new Set([...branchKindLabels(head), ...promotionLabels(base, head)]);
};
