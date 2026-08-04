import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT = path.join(ROOT, 'docs', 'personal', 'site');
const SKIP = new Set(['node_modules', '.git', 'build', 'coverage', 'site']);
const ROOT_MARKDOWN = ['README.md', 'ROADMAP.md', 'CHANGELOG.md'];

/** Escape text before placing it in generated HTML. */
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

/** Return whether a Markdown destination is safe to emit as a URL. */
function isSafeDestination(destination) {
  const trimmed = destination.trim();
  return trimmed.startsWith('#') || (trimmed.startsWith('/') && !trimmed.startsWith('//')) || /^(?:https?:|mailto:)/i.test(trimmed) || !/^[a-z][a-z\d+.-]*:/i.test(trimmed);
}

/** Return whether the destination should remain unchanged during rendering. */
function shouldPreserveDestination(destination, context, resolveMarkdownLink) {
  return !resolveMarkdownLink || !context?.sourcePath || !context.pageMap || destination.startsWith('#') || /^(?:https?:|mailto:)/i.test(destination) || destination.startsWith('/');
}

/** Resolve a local Markdown link to its generated page, preserving fragments. */
function resolveDestination(destination, context, resolveMarkdownLink) {
  const trimmed = destination.trim();
  if (!isSafeDestination(trimmed)) return '#';
  if (shouldPreserveDestination(trimmed, context, resolveMarkdownLink)) return trimmed;
  const [target, fragment] = trimmed.split('#', 2);
  if (!target.toLowerCase().endsWith('.md')) return trimmed;
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(context.sourcePath), target));
  const page = context.pageMap.get(normalized);
  return page ? `${page}${fragment === undefined ? '' : `#${fragment}`}` : trimmed;
}

/** Render inline Markdown emphasis, code, images, and links. */
function inlineMarkdown(value, context = {}) {
  const tokens = [];
  /** Protect rendered links while escaping the surrounding Markdown text. */
  const protect = (html) => { const token = `__GFC_LINK_${tokens.length}__`; tokens.push(html); return token; };
  let source = value.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, destination) => protect(`<img alt="${escapeHtml(alt)}" src="${escapeHtml(resolveDestination(destination, context, false))}">`));
  source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, destination) => protect(`<a href="${escapeHtml(resolveDestination(destination, context, true))}">${escapeHtml(label)}</a>`));
  const html = escapeHtml(source).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html.replace(/__GFC_LINK_(\d+)__/gu, (_, index) => tokens[Number(index)]);
}

/** Identify a Markdown table row. */
function isTableRow(line) { return line.trim().startsWith('|') && line.trim().endsWith('|'); }

/** Identify a Markdown table separator row. */
function isTableDivider(line) { return isTableRow(line) && /^\|(?:\s*:?-+:?\s*\|)+$/.test(line.trim()); }

/** Render a Markdown table block. */
function renderTable(lines, context) {
  const rows = lines.filter((line) => !isTableDivider(line)).map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
  if (!rows.length) return '';
  const [header, ...body] = rows;
  /** Render one table row with the requested cell tag. */
  const renderCells = (row, tag) => row.map((cell) => `<${tag}>${inlineMarkdown(cell, context)}</${tag}>`).join('');
  return `<table><thead><tr>${renderCells(header, 'th')}</tr></thead><tbody>${body.map((row) => `<tr>${renderCells(row, 'td')}</tr>`).join('')}</tbody></table>`;
}

/** Create mutable state for one Markdown document. */
function createState(context) { return { html: [], paragraph: [], list: null, fence: null, fenceLines: [], context }; }

/** Flush the current paragraph into rendered output. */
function flushParagraph(state) { if (state.paragraph.length) { state.html.push(`<p>${state.paragraph.map((line) => inlineMarkdown(line, state.context)).join(' ')}</p>`); state.paragraph = []; } }

/** Flush the current list into rendered output. */
function flushList(state) { if (state.list) { state.html.push(`<${state.list.type}>${state.list.items.join('')}</${state.list.type}>`); state.list = null; } }

/** Flush the current fenced code block into rendered output. */
function flushFence(state) { if (state.fence) { const content = escapeHtml(state.fenceLines.join('\n')); const rendered = state.fence === 'mermaid' ? `<pre class="mermaid">${content}</pre>` : `<pre><code class="language-${escapeHtml(state.fence)}">${content}</code></pre>`; state.html.push(rendered); state.fence = null; state.fenceLines = []; } }

/** Consume a fence line and return whether the parser is inside a fence. */
function consumeFence(state, line) {
  if (state.fence) { if (line.startsWith('```')) flushFence(state); else state.fenceLines.push(line); return true; }
  const match = line.match(/^```(.*)$/);
  if (!match) return false;
  flushParagraph(state); flushList(state); state.fence = match[1].trim() || 'text'; return true;
}

/** Consume a table starting at the given line, returning the next index. */
function consumeTable(state, lines, index) {
  if (!isTableRow(lines[index])) return null;
  if (!isTableDivider(lines[index + 1] ?? '')) return null;
  flushParagraph(state); flushList(state); const tableLines = [lines[index]]; let nextIndex = index + 2;
  while (nextIndex < lines.length && isTableRow(lines[nextIndex])) { tableLines.push(lines[nextIndex]); nextIndex += 1; }
  state.html.push(renderTable(tableLines, state.context)); return nextIndex;
}

/** Consume a heading line. */
function consumeHeading(state, line) {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return false;
  flushParagraph(state); flushList(state); const level = match[1].length; state.html.push(`<h${level}>${inlineMarkdown(match[2], state.context)}</h${level}>`); return true;
}

/** Append a parsed list item to the current list state. */
function appendListItem(state, task, bullet, numbered) {
  flushParagraph(state); const type = numbered ? 'ol' : 'ul'; if (!state.list || state.list.type !== type) { flushList(state); state.list = { type, items: [] }; }
  const content = task ? `<input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inlineMarkdown(task[2], state.context)}` : inlineMarkdown((bullet || numbered)[1], state.context); state.list.items.push(`<li>${content}</li>`);
}

/** Consume a bullet, numbered, or task list line. */
function consumeListItem(state, line) {
  const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
  const match = task ?? bullet ?? numbered;
  if (!match) return false;
  appendListItem(state, task, bullet, numbered); return true;
}

/** Consume a blank or paragraph line. */
function consumeText(state, line) {
  if (consumeHeading(state, line) || consumeListItem(state, line)) return;
  if (!line.trim()) { flushParagraph(state); flushList(state); return; }
  state.paragraph.push(line.trim());
}

/** Render the Markdown subset used by repository documentation. */
export function renderMarkdown(markdown, context = {}) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n'); const state = createState(context); let index = 0;
  while (index < lines.length) { if (consumeFence(state, lines[index])) { index += 1; continue; } const nextIndex = consumeTable(state, lines, index); if (nextIndex !== null) { index = nextIndex; continue; } consumeText(state, lines[index]); index += 1; }
  flushFence(state); flushParagraph(state); flushList(state); return state.html.join('\n');
}

/** Walk a documentation directory and return Markdown source files. */
async function walkMarkdown(directory, relative = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true }); const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name); const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdown(absolute, next));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push({ absolute, relative: next.split(path.sep).join('/') });
  }
  return files;
}

/** Collect root and docs Markdown, including ignored local planning files. */
async function sourceFiles() {
  const files = [];
  for (const file of ROOT_MARKDOWN) { try { await fs.access(path.join(ROOT, file)); files.push({ absolute: path.join(ROOT, file), relative: file }); } catch { /* optional root document */ } }
  files.push(...await walkMarkdown(path.join(ROOT, 'docs'), 'docs'));
  const unique = new Map(files.map((file) => [file.relative, file]));
  return [...unique.values()];
}

/** Convert a source path into a stable output filename. */
export function pageSlug(relativePath) { return `${relativePath.replace(/\.md$/i, '').split('/').map(encodeURIComponent).join('__')}.html`; }

/** Wrap rendered Markdown in a standalone HTML page. */
export function pageHtml(title, relativePath, body) { const mermaid = body.includes('<pre class="mermaid">') ? '<script type="module">import mermaid from \'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs\'; mermaid.initialize({startOnLoad:true,securityLevel:\'strict\'});</script>' : ''; return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · GFC docs</title><link rel="stylesheet" href="site.css"></head><body><header><a href="index.html">GFC local docs</a><span>${escapeHtml(relativePath)}</span></header><main><article>${body}</article></main>${mermaid}</body></html>`; }

/** Build the ignored local documentation site. */
async function main() {
  const files = await sourceFiles(); const pageMap = new Map(files.map((file) => [file.relative, pageSlug(file.relative)])); await fs.rm(OUTPUT, { recursive: true, force: true }); await fs.mkdir(OUTPUT, { recursive: true }); const pages = [];
  for (const file of files) { const title = file.relative.replace(/\.md$/i, '').split('/').pop(); const slug = pageSlug(file.relative); const context = { sourcePath: file.relative, pageMap }; await fs.writeFile(path.join(OUTPUT, slug), pageHtml(title, file.relative, renderMarkdown(await fs.readFile(file.absolute, 'utf8'), context))); pages.push({ title, path: file.relative, href: slug }); }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  const items = pages.map((page) => `<li><a href="${page.href}" data-search="${escapeHtml(`${page.title} ${page.path}`.toLowerCase())}">${escapeHtml(page.title)} <small>${escapeHtml(page.path)}</small></a></li>`).join('');
  const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GFC local docs</title><link rel="stylesheet" href="site.css"></head><body><header><strong>GFC local docs</strong><span>Generated from Markdown sources</span></header><main><section class="intro"><p>Local-only documentation, architecture notes, planning data, and generated inventory views.</p><label for="search">Search</label><input id="search" type="search" placeholder="Filter documentation"><p id="count"></p></section><ul class="nav" id="nav">${items}</ul></main><script>const input=document.querySelector('#search');const links=[...document.querySelectorAll('#nav a')];const count=document.querySelector('#count');function filter(){const query=input.value.toLowerCase();let visible=0;for(const link of links){const show=link.dataset.search.includes(query);link.parentElement.hidden=!show;if(show)visible+=1;}count.textContent=visible+' document'+(visible===1?'':'s');}input.addEventListener('input',filter);filter();</script></body></html>`;
  await fs.writeFile(path.join(OUTPUT, 'index.html'), index); await fs.copyFile(path.join(SCRIPT_DIR, 'local-docs.css'), path.join(OUTPUT, 'site.css')); console.log(`Built ${pages.length} local documentation pages in docs/personal/site.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) await main();
