import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
function validCard(id, note, topic = 'winter-market') {
  return { place_id: id, note, sources: ['https://example.org/source'], topic_key: topic, country: 'Exampleland', photo: null, review_status: 'draft' };
}
async function validate(cards) {
  const dir = await mkdtemp(resolve(tmpdir(), 'santa-cards-'));
  try {
    const path = resolve(dir, 'cards.json');
    await writeFile(path, JSON.stringify(cards));
    return spawnSync(process.execPath, [resolve(root, 'tools/validate-stop-cards.mjs'), path], { encoding: 'utf8' });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
describe('stop card validation', () => {
  it('accepts distinct sourced notes and null photos', async () => {
    const result = await validate([validCard('Q1', 'This town holds a winter market each December, drawing visitors to its old central square.', 'market'), validCard('Q2', 'The local museum preserves a collection of regional textiles and records their makers.', 'textiles')]);
    expect(result.status).toBe(0);
  });
  it('rejects missing sources, repeated topics, and near-duplicate notes', async () => {
    const a = validCard('Q1', 'This town holds a winter market each December, drawing visitors to its old central square.', 'market');
    const b = validCard('Q2', 'This town holds a winter market each December, drawing visitors to its old central square.', 'market');
    b.sources = [];
    const result = await validate([a, b]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('source URL');
    expect(result.stderr).toContain('closely matches');
    expect(result.stderr).toContain('already used');
  });
  it('rejects unsupported or unattributed photos', async () => {
    const card = validCard('Q3', null);
    card.photo = { url: 'https://example.org/photo.jpg', width: 800, height: 600, author: '', license: 'All rights reserved', license_url: 'https://example.org/license', source_page: 'https://example.org/page' };
    const result = await validate([card]);
    expect(result.stderr).toContain('unsupported photo license');
    expect(result.stderr).toContain('attribution is required');
  });
  it('reports malformed records without crashing and checks required country and topic keys', async () => {
    const card = validCard('Q4', null);
    card.country = '';
    card.topic_key = 'Bad Topic';
    const result = await validate([null, card]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('place_id is required');
    expect(result.stderr).toContain('country is required');
    expect(result.stderr).toContain('topic_key');
  });
});
