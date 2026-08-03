import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderMarkdown } from './build-local-docs.mjs';

describe('local documentation renderer', () => {
  test('renders headings, tasks, tables, and Mermaid fences', () => {
    const html = renderMarkdown('# Title\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```mermaid\nflowchart LR\n```');
    assert.match(html, /<h1>Title<\/h1>/);
    assert.match(html, /checked/);
    assert.match(html, /<table>/);
    assert.match(html, /class="mermaid"/);
  });
});
