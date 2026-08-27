import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bootstrap = path.join(repositoryRoot, 'tools', 'bootstrap.mjs');

describe('developer bootstrap', () => {
  it('exposes help without requiring Docker', () => {
    const output = execFileSync(process.execPath, [bootstrap, '--help'], { encoding: 'utf8' });
    expect(output).toContain('pnpm bootstrap');
  });

  it('checks the local Node and pnpm toolchain without Docker', () => {
    const output = execFileSync(process.execPath, [bootstrap, '--check', '--skip-docker'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(output).toContain('Bootstrap prerequisites are available.');
  });
});
