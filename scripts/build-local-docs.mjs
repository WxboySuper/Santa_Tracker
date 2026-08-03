import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const OUTPUT = path.join(ROOT, 'docs', 'personal', 'site');
const SKIP = new Set(['node_modules', '.git', 'build', 'coverage', 'site']);
const ROOT_MARKDOWN = ['README.md', 'ROADMAP.md', 'CHANGELOG.md'];

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

function isTableRow(line) { return line.trim().startsWith('|') && line.trim().endsWith('|'); }
function isTableDivider(line) { return isTableRow(line) && /^\|(?:\s*:?-+:?\s*\|)+$/.test(line.trim()); }

function renderTable(lines) {
  const rows = lines.filter((line) => !isTableDivider(line)).map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
  if (!rows.length) return '';
  const [header, ...body] = rows;
  return `<table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** Render the Markdown subset used by repository documentation. */
export function renderMarkdown(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html = [];
  let paragraph = [];
  let list = null;
  let fence = null;
  let fenceLines = [];
  const flushParagraph = () => { if (paragraph.length) { html.push(`<p>${paragraph.map(inlineMarkdown).join(' ')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { html.push(`<${list.type}>${list.items.join('')}</${list.type}>`); list = null; } };
  const flushFence = () => { if (fence) { const content = escapeHtml(fenceLines.join('\n')); html.push(fence === 'mermaid' ? `<pre class="mermaid">${content}</pre>` : `<pre><code class="language-${escapeHtml(fence)}">${content}</code></pre>`); fence = null; fenceLines = []; } };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceStart = line.match(/^```(.*)$/);
    if (fenceStart) { if (fence) flushFence(); else { flushParagraph(); flushList(); fence = fenceStart[1].trim() || 'text'; } continue; }
    if (fence) { fenceLines.push(line); continue; }
    if (isTableRow(line) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushParagraph(); flushList(); const tableLines = [line]; index += 1;
      while (index + 1 < lines.length && isTableRow(lines[index + 1])) { index += 1; tableLines.push(lines[index]); }
      html.push(renderTable(tableLines)); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flushParagraph(); flushList(); const level = heading[1].length; html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (task || bullet || numbered) {
      flushParagraph(); const type = numbered ? 'ol' : 'ul'; if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      if (task) list.items.push(`<li><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inlineMarkdown(task[2])}</li>`);
      else list.items.push(`<li>${inlineMarkdown((bullet || numbered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    paragraph.push(line.trim());
  }
  flushFence(); flushParagraph(); flushList();
  return html.join('\n');
}

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

async function sourceFiles() {
  const files = [];
  for (const file of ROOT_MARKDOWN) {
    try { files.push({ absolute: path.join(ROOT, file), relative: file }); } catch { /* optional root docs */ }
  }
  files.push(...await walkMarkdown(path.join(ROOT, 'docs'), 'docs'));
  const unique = new Map();
  for (const file of files) if (!unique.has(file.relative)) unique.set(file.relative, file);
  return [...unique.values()].filter(async (file) => (await fs.stat(file.absolute)).isFile());
}

function pageSlug(relativePath) { return `${relativePath.replace(/\.md$/i, '').replaceAll('/', '__').replaceAll(/[^a-zA-Z0-9_-]/g, '-')}.html`; }

function pageHtml(title, relativePath, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · GFC docs</title><link rel="stylesheet" href="site.css"></head><body><header><a href="index.html">GFC local docs</a><span>${escapeHtml(relativePath)}</span></header><main><article>${body}</article></main><script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'; mermaid.initialize({startOnLoad:true,securityLevel:'strict'});</script></body></html>`;
}

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
