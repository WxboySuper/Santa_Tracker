import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const OUTPUT = path.join(ROOT, 'docs', 'personal', 'site');
const SKIP = new Set(['node_modules', '.git', 'build', 'coverage', 'site']);
const ROOT_MARKDOWN = ['README.md', 'ROADMAP.md', 'CHANGELOG.md'];

/** Escape text before placing it in generated HTML. */
function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** Render inline Markdown emphasis, code, images, and links. */
function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

/** Identify a Markdown table row. */
function isTableRow(line) { return line.trim().startsWith('|') && line.trim().endsWith('|'); }

/** Identify a Markdown table separator row. */
function isTableDivider(line) { return isTableRow(line) && /^\|(?:\s*:?-+:?\s*\|)+$/.test(line.trim()); }

/** Render a Markdown table block. */
function renderTable(lines) {
  const rows = lines.filter((line) => !isTableDivider(line)).map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
  if (!rows.length) return '';
  const [header, ...body] = rows;
  return `<table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** Create mutable state for one Markdown document. */
function createRenderState() { return { html: [], paragraph: [], list: null, fence: null, fenceLines: [] }; }

/** Flush the current paragraph into rendered output. */
function flushParagraph(state) { if (state.paragraph.length) { state.html.push(`<p>${state.paragraph.map(inlineMarkdown).join(' ')}</p>`); state.paragraph = []; } }

/** Flush the current list into rendered output. */
function flushList(state) { if (state.list) { state.html.push(`<${state.list.type}>${state.list.items.join('')}</${state.list.type}>`); state.list = null; } }

/** Flush the current fenced code block into rendered output. */
function flushFence(state) { if (state.fence) { const content = escapeHtml(state.fenceLines.join('\n')); const rendered = state.fence === 'mermaid' ? `<pre class="mermaid">${content}</pre>` : `<pre><code class="language-${escapeHtml(state.fence)}">${content}</code></pre>`; state.html.push(rendered); state.fence = null; state.fenceLines = []; } }

/** Consume a fence line and return whether the parser is inside a fence. */
function consumeFence(state, line) {
  if (state.fence) { if (line.startsWith('```')) flushFence(state); else state.fenceLines.push(line); return true; }
  const fenceStart = line.match(/^```(.*)$/);
  if (!fenceStart) return false;
  flushParagraph(state); flushList(state); state.fence = fenceStart[1].trim() || 'text'; return true;
}

/** Consume a table starting at the given line, returning the next index. */
function consumeTable(state, lines, index) {
  if (!isTableRow(lines[index]) || index + 1 >= lines.length || !isTableDivider(lines[index + 1])) return null;
  flushParagraph(state); flushList(state); const tableLines = [lines[index]]; let nextIndex = index + 2;
  while (nextIndex < lines.length && isTableRow(lines[nextIndex])) { tableLines.push(lines[nextIndex]); nextIndex += 1; }
  state.html.push(renderTable(tableLines)); return nextIndex;
}

/** Consume a heading line. */
function consumeHeading(state, line) {
  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (!heading) return false;
  flushParagraph(state); flushList(state); const level = heading[1].length; state.html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); return true;
}

/** Append a parsed list item to the current list state. */
function appendListItem(state, task, bullet, numbered) {
  flushParagraph(state); const type = numbered ? 'ol' : 'ul'; if (!state.list || state.list.type !== type) { flushList(state); state.list = { type, items: [] }; }
  const content = task ? `<input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inlineMarkdown(task[2])}` : inlineMarkdown((bullet || numbered)[1]); state.list.items.push(`<li>${content}</li>`);
}

/** Consume a bullet, numbered, or task list line. */
function consumeListItem(state, line) {
  const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
  if (!task && !bullet && !numbered) return false;
  appendListItem(state, task, bullet, numbered); return true;
}

/** Consume a blank or paragraph line. */
function consumeText(state, line) {
  if (consumeHeading(state, line) || consumeListItem(state, line)) return;
  if (!line.trim()) { flushParagraph(state); flushList(state); return; }
  state.paragraph.push(line.trim());
}

/** Render the Markdown subset used by repository documentation. */
export function renderMarkdown(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n'); const state = createRenderState(); let index = 0;
  while (index < lines.length) {
    if (consumeFence(state, lines[index])) { index += 1; continue; }
    const nextIndex = consumeTable(state, lines, index);
    if (nextIndex !== null) { index = nextIndex; continue; }
    consumeText(state, lines[index]); index += 1;
  }
  flushFence(state); flushParagraph(state); flushList(state); return state.html.join('\n');
}

/** Walk a documentation directory and return Markdown source files. */
async function walkMarkdown(directory, relative = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdown(absolute, nextRelative));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push({ absolute, relative: nextRelative.split(path.sep).join('/') });
  }
  return files;
}

/** Collect root and docs Markdown, including ignored local planning files. */
async function sourceFiles() {
  const files = [];
  for (const file of ROOT_MARKDOWN) {
    try { files.push({ absolute: path.join(ROOT, file), relative: file }); } catch { /* optional root docs */ }
  }
  files.push(...await walkMarkdown(path.join(ROOT, 'docs'), 'docs'));
  const unique = new Map();
  for (const file of files) if (!unique.has(file.relative)) unique.set(file.relative, file);
  return [...unique.values()];
}

/** Convert a source path into a stable output filename. */
function pageSlug(relativePath) { return `${relativePath.replace(/\.md$/i, '').replaceAll('/', '__').replaceAll(/[^a-zA-Z0-9_-]/g, '-')}.html`; }

/** Wrap rendered Markdown in a standalone HTML page. */
function pageHtml(title, relativePath, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · GFC docs</title><link rel="stylesheet" href="site.css"></head><body><header><a href="index.html">GFC local docs</a><span>${escapeHtml(relativePath)}</span></header><main><article>${body}</article></main><script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'; mermaid.initialize({startOnLoad:true,securityLevel:'strict'});</script></body></html>`;
}

/** Build the ignored local documentation site. */
async function main() {
  const files = await sourceFiles();
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT, { recursive: true });
  const pages = [];
  for (const file of files) {
    const title = file.relative.replace(/\.md$/i, '').split('/').pop();
    const html = renderMarkdown(await fs.readFile(file.absolute, 'utf8'));
    const slug = pageSlug(file.relative);
    await fs.writeFile(path.join(OUTPUT, slug), pageHtml(title, file.relative, html));
    pages.push({ title, path: file.relative, href: slug });
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  const items = pages.map((page) => `<li><a href="${page.href}" data-search="${escapeHtml(`${page.title} ${page.path}`.toLowerCase())}">${escapeHtml(page.title)} <small>${escapeHtml(page.path)}</small></a></li>`).join('');
  const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GFC local docs</title><link rel="stylesheet" href="site.css"></head><body><header><strong>GFC local docs</strong><span>Generated from Markdown sources</span></header><main><section class="intro"><p>Local-only documentation, architecture notes, planning data, and generated inventory views.</p><label for="search">Search</label><input id="search" type="search" placeholder="Filter documentation"><p id="count"></p></section><ul class="nav" id="nav">${items}</ul></main><script>const input=document.querySelector('#search');const links=[...document.querySelectorAll('#nav a')];const count=document.querySelector('#count');function filter(){const query=input.value.toLowerCase();let visible=0;for(const link of links){const show=link.dataset.search.includes(query);link.parentElement.hidden=!show;if(show)visible+=1;}count.textContent=visible+' document'+(visible===1?'':'s');}input.addEventListener('input',filter);filter();</script></body></html>`;
  await fs.writeFile(path.join(OUTPUT, 'index.html'), index);
  await fs.writeFile(path.join(OUTPUT, 'site.css'), `:root{color-scheme:light dark;font:16px/1.6 system-ui,sans-serif;--bg:#101722;--panel:#182333;--ink:#e9f0f7;--muted:#9db0c4;--accent:#72c7ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}header{display:flex;justify-content:space-between;gap:1rem;padding:1rem max(1rem,calc((100vw - 1100px)/2));border-bottom:1px solid #304057;position:sticky;top:0;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(8px)}header a,header strong{color:var(--accent);font-weight:700;text-decoration:none}header span{color:var(--muted);overflow:hidden;text-overflow:ellipsis}main{max-width:1100px;margin:0 auto;padding:2rem 1rem}article,.intro{background:var(--panel);border:1px solid #304057;border-radius:16px;padding:clamp(1rem,3vw,2.5rem)}article{overflow:auto}h1,h2,h3{line-height:1.2}a{color:var(--accent)}code,pre{background:#0a1019;border-radius:6px}code{padding:.1rem .3rem}pre{padding:1rem;overflow:auto}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #40536c;padding:.5rem;text-align:left;vertical-align:top}th{background:#24344b}.nav{list-style:none;padding:0;display:grid;gap:.5rem;margin-top:1rem}.nav li{background:var(--panel);border:1px solid #304057;border-radius:10px;padding:.65rem 1rem}.nav small{color:var(--muted);margin-left:.5rem}input{display:block;width:100%;padding:.7rem;border-radius:8px;border:1px solid #40536c;background:#0a1019;color:var(--ink);margin:.35rem 0}.mermaid{background:#0a1019}`);
  console.log(`Built ${pages.length} local documentation pages in docs/personal/site.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) await main();
