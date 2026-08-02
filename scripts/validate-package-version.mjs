import { readFileSync } from 'node:fs';
import { evaluateVersionPolicy } from './lib/package-version.mjs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const eventName = process.env.GITHUB_EVENT_NAME ?? '';
const baseRef = process.env.GITHUB_BASE_REF ?? '';
const refName = process.env.GITHUB_REF_NAME ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';

const targetBranch = eventName === 'pull_request' ? baseRef : refName;

if (!targetBranch) {
  console.log('No target branch resolved; skipping package version policy check.');
  process.exit(0);
}

const result = evaluateVersionPolicy({
  version,
  targetBranch,
});

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(`package.json version "${version}" satisfies policy for branch "${targetBranch}".`);
