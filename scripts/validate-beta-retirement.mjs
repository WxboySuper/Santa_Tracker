import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  '.github/workflows/deploy-beta.yml',
  '.github/workflows/release-beta.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/release-stable.yml',
  '.github/workflows/forward-port-stable-fix.yml',
];

for (const path of requiredFiles) {
  if (!existsSync(path)) {
    console.error(`Missing required post-migration workflow: ${path}`);
    process.exit(1);
  }
}

const betaDeploy = readFileSync('.github/workflows/deploy-beta.yml', 'utf8');
if (!betaDeploy.includes("github.event.release.target_commitish == 'main'")) {
  console.error('Deploy Beta must accept releases from main.');
  process.exit(1);
}
if (betaDeploy.includes("target_commitish == 'beta'")) {
  console.error('Deploy Beta still accepts a release targeted at the retired beta branch.');
  process.exit(1);
}

console.log('Beta retirement readiness checks passed. Delete the legacy beta branch manually after external ruleset review.');
