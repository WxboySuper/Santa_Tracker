import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pageHtml, pageSlug, renderMarkdown } from './build-local-docs.mjs';

describe('local documentation renderer', () => {
  test('renders headings, tasks, tables, and Mermaid fences', () => {
    const html = renderMarkdown('# Title\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```mermaid\nflowchart LR\n```');
    assert.match(html, /<h1>Title<\/h1>/);
    assert.match(html, /checked/);
    assert.match(html, /<table>/);
    assert.match(html, /class="mermaid"/);
  });

  test('rejects unsafe destinations before emitting HTML', () => {
    const html = renderMarkdown('[unsafe](javascript:alert(1)) [safe](https://example.com)');
    assert.doesNotMatch(html, /javascript:/i);
    assert.match(html, /href="https:\/\/example\.com"/);
  });

  test('resolves local Markdown links and preserves fragments', () => {
    const html = renderMarkdown('[target](../guide.md#setup)', {
      sourcePath: 'docs/plans/today.md',
      pageMap: new Map([['docs/guide.md', 'docs__guide.html']]),
    });
    assert.match(html, /href="docs__guide\.html#setup"/);
  });

  test('uses collision-free page slugs and loads Mermaid only when needed', () => {
    assert.notEqual(pageSlug('docs/a-b.md'), pageSlug('docs/a b.md'));
    assert.doesNotMatch(pageHtml('Plain', 'plain.md', '<p>Text</p>'), /mermaid\.esm/);
    assert.match(pageHtml('Diagram', 'diagram.md', '<pre class="mermaid">graph TD</pre>'), /mermaid\.esm/);
  });
});
