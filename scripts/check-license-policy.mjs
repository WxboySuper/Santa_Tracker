import { collectThirdPartyDependencies } from './generate-third-party-notices.mjs';
import { classifyLicense } from './lib/license-policy.mjs';

const main = () => {
  const entries = collectThirdPartyDependencies();
  const violations = entries.filter((entry) => !classifyLicense(entry.license).ok);

  if (violations.length === 0) {
    console.log(`License policy OK: ${entries.length} dependencies are allowed or review-required.`);
    process.exit(0);
  }

  console.error(`License policy FAILED: ${violations.length} dependency/dataset license(s) need review.`);
  for (const entry of violations) {
    const policy = classifyLicense(entry.license);
    console.error(`  - ${entry.name} (${entry.source}) license "${entry.license}" is ${policy.category}.`);
  }
  process.exit(1);
};

main();
