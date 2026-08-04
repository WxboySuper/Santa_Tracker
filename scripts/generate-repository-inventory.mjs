import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_DIR = path.join(REPOSITORY_ROOT, 'docs', 'personal');
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'build', 'coverage', 'docs/personal', 'dist', 'playwright-report', 'test-results']);
const CODE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);
const BOUNDARY_ROOTS = new Set(['src', 'server', 'scripts', 'docs', '.github', 'deploy', 'e2e']);
const BOUNDARY_READMES = ['src/README.md', 'src/auth/README.md', 'src/billing/README.md', 'src/components/README.md', 'src/content/README.md', 'src/features/README.md', 'src/hooks/README.md', 'src/lib/README.md', 'src/maps/README.md', 'src/metrics/README.md', 'src/monitor/README.md', 'src/pages/README.md', 'src/routing/README.md', 'src/store/README.md', 'src/testing/README.md', 'src/types/README.md', 'src/utils/README.md', 'server/README.md', 'server/lib/README.md', 'server/release/README.md', 'server/weather/README.md', 'server/testing/README.md', 'scripts/README.md', 'scripts/lib/README.md'];
const PURPOSES = new Map([
  ['src', 'Browser application source'], ['src/components', 'Feature UI and shared presentation'], ['src/pages', 'Route-level composition'], ['src/hooks', 'Reusable React workflows'], ['src/store', 'Redux state and transitions'], ['src/utils', 'Pure transformations and browser helpers'], ['src/config', 'Build target and exposure policy'], ['src/features', 'Feature exposure boundaries'], ['src/monitor', 'Monitor domain and upstream adapters'], ['src/types', 'Shared TypeScript contracts'], ['src/maps', 'Map adapter contracts'],
  ['server', 'Hosted Express server and services'], ['server/lib', 'Reusable server policy helpers'], ['server/release', 'VPS release helpers'], ['server/weather', 'Weather generation support'], ['server/testing', 'Server test fixtures'], ['scripts', 'Repository automation entry points'], ['scripts/lib', 'Reusable automation libraries'], ['docs', 'Human-facing repository documentation'], ['.github', 'GitHub workflows and templates'],
]);

/** Return a repository-relative path with stable POSIX separators. */
export function toRepositoryPath(filePath, root = REPOSITORY_ROOT) { return path.relative(root, filePath).split(path.sep).join('/'); }

/** Categorize a repository path for the generated inventory. */
export function classifyPath(repositoryPath) {
  if (repositoryPath.startsWith('src/')) return 'frontend';
  if (repositoryPath.startsWith('server/')) return 'server';
  if (repositoryPath.startsWith('scripts/')) return 'automation';
  if (repositoryPath.startsWith('docs/')) return 'documentation';
  if (repositoryPath.startsWith('.github/')) return 'ci';
  return 'repository';
}

/** Read a quoted JavaScript string and return its value and end offset. */
function readString(source, start) {
  const quote = source[start];
  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') { value += source[index + 1] ?? ''; index += 1; continue; }
    if (source[index] === quote) return { value, end: index + 1 };
    value += source[index];
  }
  return { value, end: source.length };
}

/** Skip a template literal without treating its contents as module syntax. */
function skipTemplate(source, start) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (source[index] === '`') return index + 1;
  }
  return source.length;
}

/** Return the end offset for a comment or whitespace token. */
function skipTrivia(source, start) {
  if (/\s/.test(source[start])) return start + 1;
  if (source.startsWith('//', start)) { const end = source.indexOf('\n', start + 2); return end === -1 ? source.length : end; }
  if (source.startsWith('/*', start)) { const end = source.indexOf('*/', start + 2); return end === -1 ? source.length : end + 2; }
  return null;
}

/** Read one lexical token, excluding comments and string/template contents. */
function readToken(source, start) {
  const triviaEnd = skipTrivia(source, start);
  if (triviaEnd !== null) return { end: triviaEnd };
  if (['"', "'"].includes(source[start])) { const string = readString(source, start); return { type: 'string', value: string.value, end: string.end }; }
  if (source[start] === '`') return { end: skipTemplate(source, start) };
  const identifier = source.slice(start).match(/^[A-Za-z_$][\w$]*/);
  if (identifier) return { type: 'identifier', value: identifier[0], end: start + identifier[0].length };
  return { type: 'punctuation', value: source[start], end: start + 1 };
}

/** Tokenize code while ignoring comments and string/template contents. */
function tokenize(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const token = readToken(source, index);
    if (token.type) tokens.push({ type: token.type, value: token.value });
    index = token.end;
  }
  return tokens;
}

/** Return whether a module specifier is relative. */
function isRelativeSpecifier(specifier) { return specifier.startsWith('./') || specifier.startsWith('../'); }

/** Return whether a module specifier has no query or fragment suffix. */
function hasNoSpecifierSuffix(specifier) { return !/[?#]/.test(specifier); }

/** Return whether a module specifier points to a code file we can resolve. */
function isCodeSpecifier(specifier) {
  if (!isRelativeSpecifier(specifier)) return false;
  if (!hasNoSpecifierSuffix(specifier)) return false;
  const extension = path.extname(specifier);
  return !extension || CODE_EXTENSIONS.has(extension);
}

/** Add a relative string token to the import set. */
function addSpecifier(imports, token) { if (token?.type === 'string' && isCodeSpecifier(token.value)) imports.add(token.value); }

/** Find a from-clause string after an import or export keyword. */
function addFromSpecifier(imports, tokens, start) {
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].value === ';') return;
    if (tokens[index].type === 'identifier' && tokens[index].value === 'from') { addSpecifier(imports, tokens[index + 1]); return; }
  }
}

/** Collect a CommonJS require specifier at a token position. */
function collectRequireSpecifier(imports, tokens, index) {
  if (tokens[index + 1]?.value === '(') addSpecifier(imports, tokens[index + 2]);
}

/** Collect a static or dynamic import specifier at a token position. */
function collectImportSpecifier(imports, tokens, index) {
  if (tokens[index + 1]?.value === '(') { addSpecifier(imports, tokens[index + 2]); return; }
  if (tokens[index + 1]?.type === 'string') { addSpecifier(imports, tokens[index + 1]); return; }
  addFromSpecifier(imports, tokens, index + 1);
}

/** Collect a module specifier introduced by an import-like keyword. */
function collectKeywordSpecifier(imports, tokens, index) {
  const keyword = tokens[index].value;
  if (keyword === 'require') collectRequireSpecifier(imports, tokens, index);
  if (keyword === 'import') collectImportSpecifier(imports, tokens, index);
  if (keyword === 'export') addFromSpecifier(imports, tokens, index + 1);
}

/** Extract relative module specifiers without matching comments or fixture strings. */
export function extractRelativeImports(source) {
  const imports = new Set();
  const tokens = tokenize(source);
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type === 'identifier') collectKeywordSpecifier(imports, tokens, index);
  }
  return [...imports].sort();
}

/** Walk source directories in stable order while skipping generated artifacts. */
async function walk(directory, root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const repositoryPath = toRepositoryPath(absolutePath, root);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(repositoryPath)) files.push(...await walk(absolutePath, root));
    } else if (entry.isFile()) files.push({ absolutePath, path: toRepositoryPath(absolutePath, root) });
  }
  return files;
}

/** Map a file to its first meaningful ownership boundary. */
export function boundaryFor(repositoryPath) {
  const parts = repositoryPath.split('/');
  if (!BOUNDARY_ROOTS.has(parts[0])) return null;
  if (['src', 'server', 'scripts'].includes(parts[0])) return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  return parts[0];
}

/** Return candidate files for a relative import. */
function importCandidates(importerPath, specifier, root = REPOSITORY_ROOT) {
  const base = path.resolve(path.dirname(path.join(root, importerPath)), specifier);
  return [base, ...[...CODE_EXTENSIONS].map((extension) => `${base}${extension}`), ...[...CODE_EXTENSIONS].map((extension) => path.join(base, `index${extension}`))];
}

/** Find the first import candidate present in the repository. */
function firstKnownPath(candidates, knownFiles, root = REPOSITORY_ROOT) {
  for (const candidate of candidates) {
    const repositoryPath = toRepositoryPath(candidate, root);
    if (knownFiles.has(repositoryPath)) return repositoryPath;
  }
  return null;
}

/** Resolve a relative import to a repository file, when possible. */
export function resolveImport(importerPath, specifier, knownFiles, root = REPOSITORY_ROOT) {
  const candidates = importCandidates(importerPath, specifier, root);
  return firstKnownPath(candidates, knownFiles, root);
}

/** Add a cross-boundary edge when both files belong to meaningful boundaries. */
function addBoundaryEdge(edges, fromPath, toPath) {
  const fromBoundary = boundaryFor(fromPath);
  const toBoundary = boundaryFor(toPath);
  if (!fromBoundary) return;
  if (!toBoundary) return;
  if (fromBoundary === toBoundary) return;
  edges.add(`${fromBoundary}|${toBoundary}`);
}

/** Inspect one source file for cross-boundary imports and unresolved paths. */
async function inspectFile(file, knownFiles, root) {
  if (!CODE_EXTENSIONS.has(path.extname(file.path))) return { edges: [], unresolved: [] };
  const imports = extractRelativeImports(await fs.readFile(file.absolutePath, 'utf8'));
  const edges = new Set();
  const unresolved = [];
  for (const specifier of imports) {
    const target = resolveImport(file.path, specifier, knownFiles, root);
    if (!target) { unresolved.push({ from: file.path, specifier }); continue; }
    addBoundaryEdge(edges, file.path, target);
  }
  return { edges: [...edges], unresolved };
}

/** Collect cross-boundary dependency edges and unresolved import notices. */
async function collectDependencies(files, knownFiles, root) {
  const dependencyEdges = new Set();
  const unresolvedImports = [];
  for (const file of files) {
    const result = await inspectFile(file, knownFiles, root);
    result.edges.forEach((edge) => dependencyEdges.add(edge));
    unresolvedImports.push(...result.unresolved);
  }
  return { dependencyEdges, unresolvedImports };
}

/** Build deterministic inventory data from the current checkout. */
export async function buildInventory(root = REPOSITORY_ROOT) {
  const files = await walk(root, root);
  const knownFiles = new Set(files.map((file) => file.path));
  const entries = files.map(({ path: filePath }) => ({ path: filePath, category: classifyPath(filePath), boundary: boundaryFor(filePath) }));
  const { dependencyEdges, unresolvedImports } = await collectDependencies(files, knownFiles, root);
  const edges = [...dependencyEdges].sort().map((edge) => { const [from, to] = edge.split('|'); return { from, to }; });
  const edgePairs = new Set(edges.map(({ from, to }) => `${to}|${from}`));
  return {
    generatedBy: 'pnpm run docs:inventory',
    files: entries,
    boundaries: [...new Set(entries.map((entry) => entry.boundary).filter(Boolean))].sort().map((name) => ({ name, purpose: PURPOSES.get(name) ?? 'See the boundary README for ownership.', files: entries.filter((entry) => entry.boundary === name).length })),
    dependencyEdges: edges,
    anomalies: { unresolvedImports, mutualEdges: edges.filter(({ from, to }) => edgePairs.has(`${from}|${to}`)), missingBoundaryReadmes: BOUNDARY_READMES.filter((filePath) => !knownFiles.has(filePath)) },
  };
}

/** Render inventory data as human-readable Markdown. */
function markdownFor(inventory) {
  const lines = ['# Generated repository inventory', '', '> Generated by `pnpm run docs:inventory`. Do not edit this file; it is ignored local documentation.', '', `Files indexed: **${inventory.files.length}**`, '', '## Boundaries', '', '| Boundary | Purpose | Files |', '| --- | --- | ---: |', ...inventory.boundaries.map(({ name, purpose, files }) => `| \`${name}\` | ${purpose} | ${files} |`), '', '## Dependency views', '', 'Cross-boundary relative imports are summarized in `repository-dependencies.mmd`.', '', '| From | To |', '| --- | --- |', ...inventory.dependencyEdges.map(({ from, to }) => `| \`${from}\` | \`${to}\` |`), '', '## Anomalies', '', `- Unresolved relative imports: **${inventory.anomalies.unresolvedImports.length}**`, `- Mutual boundary edges: **${inventory.anomalies.mutualEdges.length}**`, `- Missing expected boundary READMEs: **${inventory.anomalies.missingBoundaryReadmes.length}**`, '', 'Unresolved imports and mutual edges are review leads, not automatic defects. Inspect them before a move or ownership change.', '', '## File listing', '', ...inventory.files.map(({ path: filePath, category, boundary }) => `- \`${filePath}\` — ${category}; ${boundary ?? 'unclassified'}`), ''];
  return `${lines.join('\n')}`;
}

/** Convert a boundary label into a Mermaid-safe identifier. */
function mermaidId(name) { return name.replaceAll('/', '_').replaceAll('-', '_'); }

/** Render inventory edges as a Mermaid flowchart. */
function mermaidFor(inventory) {
  return ['%% Generated by pnpm run docs:inventory. Do not edit.', 'flowchart LR', ...inventory.boundaries.map(({ name }) => `  ${mermaidId(name)}["${name}"]`), ...inventory.dependencyEdges.map(({ from, to }) => `  ${mermaidId(from)} --> ${mermaidId(to)}`), ''].join('\n');
}

/** Write all local inventory views. */
async function main() {
  const inventory = await buildInventory();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([fs.writeFile(path.join(OUTPUT_DIR, 'repository-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`), fs.writeFile(path.join(OUTPUT_DIR, 'repository-inventory.md'), markdownFor(inventory)), fs.writeFile(path.join(OUTPUT_DIR, 'repository-dependencies.mmd'), mermaidFor(inventory))]);
  console.log(`Generated ${inventory.files.length} files, ${inventory.dependencyEdges.length} boundary edges, and ${inventory.anomalies.unresolvedImports.length} unresolved import notices.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) await main();
