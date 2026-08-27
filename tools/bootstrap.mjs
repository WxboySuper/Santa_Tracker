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
  return process.platform === 'win32' ? `${name}.cmd` : name;
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

function requiredChecks({ skipDocker = false } = {}) {
  const failures = [];
  if (compareVersions(versionParts(process.versions.node), MIN_NODE) < 0) {
    failures.push(`Node.js 22.13 or newer is required (found ${process.versions.node}).`);
  }

  const pnpm = run('pnpm', ['--version']);
  if (pnpm.status !== 0) {
    failures.push(
      'pnpm 10 or newer is required. Install it with `corepack enable` or `npm install --global pnpm`.',
    );
  } else if (compareVersions(versionParts(pnpm.stdout.trim()), [10, 0, 0]) < 0) {
    failures.push(`pnpm 10 or newer is required (found ${pnpm.stdout.trim()}).`);
  }

  if (!skipDocker) {
    const docker = run('docker', ['compose', 'version']);
    if (docker.status !== 0) {
      failures.push(
        'Docker Desktop with the Compose plugin is required. Install or start Docker Desktop, then rerun `pnpm bootstrap`.',
      );
    }
  }
  return failures;
}

function printFailures(failures) {
  console.error('Bootstrap cannot continue:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('See docs/DEVELOPMENT.md for setup instructions.');
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

async function main() {
  const args = new Set(process.argv.slice(2));
  const failures = requiredChecks({ skipDocker: args.has('--skip-docker') });
  if (args.has('--check')) {
    if (failures.length > 0) {
      printFailures(failures);
      process.exitCode = 1;
      return;
    }
    console.log('Bootstrap prerequisites are available.');
    return;
  }
  if (args.has('--help')) {
    console.log('Usage: pnpm bootstrap [--check] [--skip-docker]');
    console.log(
      'Starts PostgreSQL with Docker Compose, waits for it, then starts the Next.js dev server.',
    );
    return;
  }
  if (failures.length > 0) {
    printFailures(failures);
    process.exitCode = 1;
    return;
  }

  const database = command('docker', ['compose', 'up', '-d', 'postgres']);
  if ((await new Promise((resolve) => database.on('close', resolve))) !== 0) process.exit(1);
  await waitForDatabase();
  console.log('PostgreSQL is ready at postgresql://santa:santa@localhost:5432/santa_tracker');

  const app = command('pnpm', ['dev']);
  process.once('SIGINT', () => app.kill('SIGINT'));
  process.once('SIGTERM', () => app.kill('SIGTERM'));
  process.exitCode = await new Promise((resolve) => app.on('close', resolve));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { compareVersions, requiredChecks, versionParts };
