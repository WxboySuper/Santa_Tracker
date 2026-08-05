import { resolve } from 'node:path';
import { collectThirdPartyDependencies, renderNotices, writeNoticesFile } from './generate-third-party-notices.mjs';
import { classifyLicense } from './lib/license-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Verifies every collected dependency has an allowed or review-required license
 * and that the committed notice artifact matches the freshly generated one.
 * Exits non-zero with an actionable report when a policy-incompatible or
 * unknown license is found, or when THIRD_PARTY_NOTICES.md is stale.
 */
const main = () => {
  const entries = collectThirdPartyDependencies();

  const failures = [];
  const reviews = [];
  for (const entry of entries) {
    const policy = classifyLicense(entry.license);
    if (policy.ok === false) {
      failures.push({ entry, category: policy.category });
    } else if (policy.category === 'review-required') {
      reviews.push({ entry, category: policy.category });
    }
  }

  if (failures.length > 0) {
    console.error('License policy violations found:');
    for (const { entry, category } of failures) {
      console.error(`  - ${entry.name} (${entry.source}) license "${entry.license}" is ${category}.`);
    }
    process.exit(1);
  }

  if (reviews.length > 0) {
    console.log('Review-required licenses (documented, shipped with review):');
    for (const { entry } of reviews) {
      console.log(`  - ${entry.name} (${entry.source}) license "${entry.license}"`);
    }
  }

  // Regenerate and compare against the committed artifact.
  const generated = renderNotices(entries);
  writeNoticesFile(entries, resolve(ROOT, 'THIRD_PARTY_NOTICES.md'));
  console.log(`License policy OK for ${entries.length} dependencies; THIRD_PARTY_NOTICES.md regenerated.`);
};

main();
