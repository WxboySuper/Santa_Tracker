import { execFileSync } from 'node:child_process';
import { isDeletablePortBranch } from './lib/port-pr-policy.mjs';

const portBranch = process.env.PORT_BRANCH ?? '';
const prNumber = process.env.PR_NUMBER ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';

if (!portBranch || !repository) {
  console.error('cleanup-port-branch: PORT_BRANCH and GITHUB_REPOSITORY are required.');
  process.exit(1);
}

if (!isDeletablePortBranch(portBranch)) {
  console.log(
    `Skipping cleanup for "${portBranch}" from PR #${prNumber}: not an automation port branch.`,
  );
  process.exit(0);
}

console.log(`Cleaning up remote port branch ${portBranch} from PR #${prNumber}`);

try {
  execFileSync(
    'gh',
    ['api', '-X', 'DELETE', `repos/${repository}/git/refs/heads/${portBranch}`],
    {
      encoding: 'utf8',
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  console.log(`Deleted port branch ${portBranch}.`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const stdout =
    err && typeof err === 'object' && 'stdout' in err ? String(err.stdout) : '';
  const combined = message + stdout;
  if (
    combined.includes('404') ||
    combined.includes('422') ||
    combined.includes('Reference does not exist')
  ) {
    console.log(`Port branch ${portBranch} was already removed or is protected.`);
    process.exit(0);
  }
  console.error(`Failed to delete port branch ${portBranch}: ${message}`);
  process.exit(1);
}
