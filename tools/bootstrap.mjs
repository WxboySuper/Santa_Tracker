import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const MIN_NODE = [22, 13, 0];

function compareVersions(actual, required) {
  for (let index = 0; index < required.length; index += 1) {
    const difference = (actual[index] ?? 0) - required[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function versionParts(value) {
  return value
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function executable(name) {
  return process.platform === 'win32' && ['corepack', 'pnpm'].includes(name) ? `${name}.cmd` : name;
}

function toolCommand(name, args = []) {
  if (name !== 'pnpm') return [executable(name), args];
  const direct = spawnSync(executable(name), ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return direct.error ? [executable('corepack'), ['pnpm', ...args]] : [executable(name), args];
}

function run(command, args, options = {}) {
  const [program, commandArgs] = toolCommand(command, args);
  return spawnSync(program, commandArgs, {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
    ...options,
  });
}

function checkNodeVersion() {
  if (compareVersions(versionParts(process.versions.node), MIN_NODE) < 0) {
    return `Node.js 22.13 or newer is required (found ${process.versions.node}).`;
  }
  return null;
}

function checkPnpmVersion() {
  const pnpm = run('pnpm', ['--version']);
  if (pnpm.status !== 0) {
    return 'pnpm 10 or newer is required. Install it with `corepack enable` or `npm install --global pnpm`.';
  }
  const version = pnpm.stdout.trim();
  return compareVersions(versionParts(version), [10, 0, 0]) < 0
    ? `pnpm 10 or newer is required (found ${version}).`
    : null;
}

function requiredChecks() {
  const failures = [checkNodeVersion(), checkPnpmVersion()];
  return failures.filter((failure) => failure !== null);
}

function printFailures(failures) {
  console.error('Bootstrap cannot continue:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('See docs/DEVELOPMENT.md for setup instructions.');
}

function printHelp() {
  console.log('Usage: pnpm bootstrap [--check]');
  console.log('Checks Node.js and pnpm, then starts the Next.js dev server.');
}

function command(commandName, args) {
  const [program, commandArgs] = toolCommand(commandName, args);
  return spawn(program, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
}

function reportCheck(failures) {
  if (failures.length > 0) {
    printFailures(failures);
    process.exitCode = 1;
    return;
  }
  console.log('Bootstrap prerequisites are available.');
}

async function startStack() {
  const app = command('pnpm', ['dev']);
  const onSigint = () => app.kill('SIGINT');
  const onSigterm = () => app.kill('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    const appExit = await new Promise((resolve) => app.on('close', resolve));
    process.exitCode = appExit ?? 1;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) return printHelp();

  const failures = requiredChecks();
  if (args.has('--check')) return reportCheck(failures);
  if (failures.length > 0) {
    printFailures(failures);
    process.exitCode = 1;
    return;
  }
  await startStack();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { compareVersions, requiredChecks, versionParts };
