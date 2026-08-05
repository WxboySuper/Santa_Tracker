import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { evaluateChangelogPolicy, isChangelogSkip } from './changelog-policy.mjs';

export const CHANGELOG_PATH = 'CHANGELOG.md';

/**
 * Reads a file from a remote ref, falling back to the checked-out file.
 * @param {string} ref
 * @param {string} path
 * @returns {string}
 */
export const readRefFile = (ref, path) => {
  try {
    return execFileSync('git', ['show', `origin/${ref}:${path}`], { encoding: 'utf8' });
  } catch {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  }
};

/**
 * Fetches the live PR body so automated changelog edits are validated immediately.
 * @param {{ repository: string; prNumber: number; ghToken: string; fallbackBody: string }} context
 * @returns {string}
 */
const fetchLivePrBody = ({ repository, prNumber, ghToken, fallbackBody }) => {
  if (!ghToken) return fallbackBody;
  try {
    return execFileSync(
      'gh',
      ['api', `repos/${repository}/pulls/${prNumber}`, '--jq', '.body'],
      { encoding: 'utf8' },
    );
  } catch {
    return fallbackBody;
  }
};

/**
 * Evaluates the changelog policy against the real head/base changelogs, mirroring
 * the enforcement in check-changelog-pr.mjs so labels never disagree with the check.
 *
 * @param {{
 *   baseRef: string;
 *   headRef: string;
 *   changedFiles: string[];
 *   body: string;
 *   repository?: string;
 *   prNumber?: number;
 *   ghToken?: string;
 * }} context
 * @returns {{ ok: boolean; reason: string; impact?: ChangelogImpact; skipped?: boolean }}
 */
export const evaluatePrChangelog = ({
  baseRef,
  headRef,
  changedFiles,
  body,
  repository = '',
  prNumber = 0,
  ghToken = '',
}) => {
  const result = evaluateChangelogPolicy({
    baseRef,
    changedFiles,
    body: fetchLivePrBody({ repository, prNumber, ghToken, fallbackBody: body }),
    changelog: readRefFile(headRef, CHANGELOG_PATH),
    baseChangelog: readRefFile(baseRef, CHANGELOG_PATH),
  });
  return { ...result, skipped: isChangelogSkip(result.impact) };
};
