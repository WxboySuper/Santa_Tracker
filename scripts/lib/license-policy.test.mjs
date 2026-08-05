import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyLicense } from './license-policy.mjs';

describe('license policy', () => {
  it('allows common permissive licenses', () => {
    for (const license of ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', '0BSD']) {
      const result = classifyLicense(license);
      assert.equal(result.ok, true, license);
      assert.equal(result.category, 'allowed');
    }
  });

  it('allows public-domain markers', () => {
    assert.equal(classifyLicense('Public domain').category, 'allowed');
    assert.equal(classifyLicense('CC0-1.0').category, 'allowed');
  });

  it('requires review for copyleft licenses', () => {
    assert.equal(classifyLicense('MPL-2.0').category, 'review-required');
    assert.equal(classifyLicense('GPL-3.0-only').category, 'review-required');
  });

  it('rejects prohibited licenses', () => {
    const result = classifyLicense('BUSL-1.1');
    assert.equal(result.ok, false);
    assert.equal(result.category, 'prohibited');
  });

  it('rejects unknown or missing licenses', () => {
    assert.equal(classifyLicense('').ok, false);
    assert.equal(classifyLicense('SEE LICENSE IN LICENSE').ok, false);
    assert.equal(classifyLicense('custom-proprietary').ok, false);
  });

  it('treats parenthesized identifiers like bare ones', () => {
    assert.equal(classifyLicense('(MIT)').category, 'allowed');
    assert.equal(classifyLicense('(Apache-2.0)').category, 'allowed');
  });

  it('accepts an SPDX dual license when any alternative is allowed', () => {
    assert.equal(classifyLicense('(MIT OR GPL-3.0-or-later)').category, 'allowed');
    assert.equal(classifyLicense('MIT OR Apache-2.0').category, 'allowed');
  });

  it('flags a dual license to review when the best alternative is copyleft', () => {
    assert.equal(classifyLicense('(MPL-2.0 OR GPL-3.0-only)').category, 'review-required');
  });
});
