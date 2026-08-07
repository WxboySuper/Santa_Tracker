import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LABEL_DEFS } from './pr-label-defs.mjs';
import { CI_LABELS, ciLabelFromCheckRuns, diffCiLabels, parsePrNumbers } from './pr-ci-label-state.mjs';

describe('parsePrNumbers', () => {
  it('parses a comma-separated PR number list', () => {
    assert.deepEqual(parsePrNumbers('863, 22, 7'), [863, 22, 7]);
  });

  it('returns an empty list for empty, blank, or malformed input', () => {
    assert.deepEqual(parsePrNumbers(''), []);
    assert.deepEqual(parsePrNumbers('   '), []);
    assert.deepEqual(parsePrNumbers('abc, -3, 0'), []);
  });

  it('falls back to a single PR_NUMBER value', () => {
    assert.deepEqual(parsePrNumbers('863'), [863]);
  });
});

describe('CI_LABELS palette contract', () => {
  it('derives the CI labels from the canonical palette', () => {
    assert.deepEqual(
      CI_LABELS,
      LABEL_DEFS.filter(([name]) => name.startsWith('ci:')).map(([name]) => name),
    );
    assert.deepEqual(CI_LABELS, ['ci:pending', 'ci:passing', 'ci:failing']);
  });
});

describe('ciLabelFromCheckRuns', () => {
  it('returns pending when there are no check runs', () => {
    assert.equal(ciLabelFromCheckRuns([]), 'ci:pending');
  });

  it('returns pending while any check is still running', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'in_progress', conclusion: null },
      ]),
      'ci:pending',
    );
  });

  it('returns failing when any completed check failed', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'failure' },
      ]),
      'ci:failing',
    );
  });

  it('returns passing only when every check completed successfully', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'skipped' },
      ]),
      'ci:passing',
    );
  });

  it('returns pending when a completed check has a null conclusion', () => {
    assert.equal(
      ciLabelFromCheckRuns([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: null },
      ]),
      'ci:pending',
    );
  });
});

describe('diffCiLabels', () => {
  it('adds desired label and removes stale ci labels', () => {
    const result = diffCiLabels(['ci:failing', 'Bug'], 'ci:passing');
    assert.deepEqual(result.remove, ['ci:failing']);
    assert.deepEqual(result.add, ['ci:passing']);
  });

  it('makes no changes when desired label is already present', () => {
    const result = diffCiLabels(['ci:passing', 'Bug'], 'ci:passing');
    assert.deepEqual(result.remove, []);
    assert.deepEqual(result.add, []);
  });
});
