import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const viteConfig = await readFile(join(repoRoot, 'vite.config.ts'), 'utf8');

assert.match(viteConfig, /server:\s*\{[\s\S]*?host:\s*['"]127\.0\.0\.1['"]/);
assert.doesNotMatch(viteConfig, /host:\s*['"]0\.0\.0\.0['"]/);
