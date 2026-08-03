const PORT_HEAD_PATTERN = /^port\/(\d+)-to-(.+)$/;
const STABLE_LINE_PATTERN = /^stable\/\d+\.\d+\.x$/;

/** @param {string} headRef */
export const parsePortBranch = (headRef) => {
  const match = headRef.match(PORT_HEAD_PATTERN);
  if (!match) return null;
  return { sourcePrNumber: Number(match[1]), targetSlug: match[2] };
};

/** @param {string} slug */
export const targetBranchFromSlug = (slug) => {
  if (slug === 'main') return slug;
  for (const prefix of ['feature', 'hotfix', 'release', 'stable']) {
    const marker = `${prefix}-`;
    if (slug.startsWith(marker)) return `${prefix}/${slug.slice(marker.length)}`;
  }
  return slug;
};

/**
 * A port PR is now only the reviewable forward-port of a merged stable-line
 * PR into the next-major integration line. Main is intentionally not copied
 * back into stable: it can contain unreleased work that must never reach prod.
 */
export const evaluatePortPrPolicy = ({
  headRef,
  baseRef,
  targetBranch,
  sourcePrBaseRef,
  sourcePrNumber,
}) => {
  if (!parsePortBranch(headRef)) return { ok: true };

  if (baseRef !== 'main' || targetBranch !== 'main') {
    return {
      ok: false,
      message: `Port PR ${headRef} must target main, got ${targetBranch || baseRef || 'unknown'}.`,
    };
  }

  if (!STABLE_LINE_PATTERN.test(sourcePrBaseRef)) {
    return {
      ok: false,
      message: `Port PR ${headRef} must originate from a stable/X.Y.x PR; source base was ${sourcePrBaseRef || 'unknown'}.`,
    };
  }

  return { ok: true, message: `Stable PR #${sourcePrNumber} is eligible for forward-port review.` };
};
