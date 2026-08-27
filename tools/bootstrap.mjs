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
  const direct = spawnSync(executable(name), ['--version'], { stdio: 'ignore' });
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

function checkDocker() {
  const compose = run('docker', ['compose', 'version']);
  if (compose.status !== 0) {
    return 'Docker Desktop with the Compose plugin is required. Install or start Docker Desktop, then rerun `pnpm bootstrap`.';
  }
  const engine = run('docker', ['info']);
  return engine.status !== 0
    ? 'The Docker engine is not running. Start Docker Desktop or the Docker service, then rerun `pnpm bootstrap`.'
    : null;
}

function requiredChecks({ skipDocker = false } = {}) {
  const failures = [checkNodeVersion(), checkPnpmVersion()];
  if (!skipDocker) failures.push(checkDocker());
  return failures.filter((failure) => failure !== null);
}

function printFailures(failures) {
  console.error('Bootstrap cannot continue:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('See docs/DEVELOPMENT.md for setup instructions.');
}

function printHelp() {
  console.log('Usage: pnpm bootstrap [--check] [--skip-docker]');
  console.log(
    'Starts PostgreSQL with Docker Compose, waits for it, then starts the Next.js dev server.',
  );
}

function command(commandName, args) {
  const [program, commandArgs] = toolCommand(commandName, args);
  return spawn(program, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = run('docker', [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_isready',
      '-U',
      'santa',
      '-d',
      'santa_tracker',
    ]);
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'PostgreSQL did not become ready within 30 seconds. Check `docker compose logs postgres`.',
  );
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
  const database = command('docker', ['compose', 'up', '-d', 'postgres']);
  const databaseExit = await new Promise((resolve) => database.on('close', resolve));
  if (databaseExit !== 0) {
    process.exitCode = 1;
    return;
  }

  let app;
  let stopping = false;
  const forwardSignal = (signal) => {
    if (stopping) {
      app?.kill('SIGKILL');
      return;
    }
    stopping = true;
    app?.kill(signal);
  };
  const onSigint = () => forwardSignal('SIGINT');
  const onSigterm = () => forwardSignal('SIGTERM');

  try {
    await waitForDatabase();
    console.log('PostgreSQL is ready at postgresql://santa:santa@localhost:5432/santa_tracker');

    app = command('pnpm', ['dev']);
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    const appExit = await new Promise((resolve) => app.on('close', resolve));
    process.exitCode = appExit ?? 1;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    const cleanup = command('docker', ['compose', 'stop', 'postgres']);
    const cleanupExit = await new Promise((resolve) => cleanup.on('close', resolve));
    if (cleanupExit !== 0 && process.exitCode === 0) process.exitCode = 1;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) return printHelp();

  const failures = requiredChecks({ skipDocker: args.has('--skip-docker') });
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
