import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReleaseName,
  evaluateSentryConfig,
  extractFiles,
  verifyReleaseFilesResponse,
} from './sentry-sourcemap-verification.mjs';

describe('sentry sourcemap verification', () => {
  describe('evaluateSentryConfig', () => {
    it('reports configured when all required env vars are present', () => {
      assert.deepEqual(
        evaluateSentryConfig({
          SENTRY_AUTH_TOKEN: 'token',
          SENTRY_ORG: 'org',
          SENTRY_PROJECT: 'project',
        }),
        { configured: true, missing: [] }
      );
    });

    it('lists every missing required variable', () => {
      const result = evaluateSentryConfig({ SENTRY_ORG: 'org' });
      assert.equal(result.configured, false);
      assert.deepEqual(result.missing, ['SENTRY_AUTH_TOKEN', 'SENTRY_PROJECT']);
    });

    it('treats empty strings as missing', () => {
      const result = evaluateSentryConfig({
        SENTRY_AUTH_TOKEN: '',
        SENTRY_ORG: '',
        SENTRY_PROJECT: '',
      });
      assert.equal(result.configured, false);
    });
  });

  describe('buildReleaseName', () => {
    it('prefixes the package version with the app release prefix', () => {
      assert.equal(buildReleaseName({ version: '1.7.0-beta.106' }), 'graphical-forecast-creator@1.7.0-beta.106');
      assert.equal(buildReleaseName({ version: '1.6.6' }), 'graphical-forecast-creator@1.6.6');
    });
  });

  describe('verifyReleaseFilesResponse', () => {
    const release = 'graphical-forecast-creator@1.7.0-beta.106';

    it('accepts a release with both sourcemaps and bundles', () => {
      const result = verifyReleaseFilesResponse({
        release,
        status: 200,
        body: {
          files: [
            { name: 'assets/index-abc.js' },
            { name: 'assets/index-abc.js.map' },
          ],
        },
      });
      assert.equal(result.ok, true);
    });

    it('rejects invalid credentials', () => {
      for (const status of [401, 403]) {
        const result = verifyReleaseFilesResponse({ release, status, body: null });
        assert.equal(result.ok, false);
        assert.match(result.reason, /auth token/i);
      }
    });

    it('rejects a missing release', () => {
      const result = verifyReleaseFilesResponse({ release, status: 404, body: null });
      assert.equal(result.ok, false);
      assert.match(result.reason, /was not found/);
    });

    it('rejects other non-2xx responses', () => {
      const result = verifyReleaseFilesResponse({ release, status: 500, body: null });
      assert.equal(result.ok, false);
      assert.match(result.reason, /HTTP 500/);
    });

    it('rejects an empty file list', () => {
      const result = verifyReleaseFilesResponse({ release, status: 200, body: { files: [] } });
      assert.equal(result.ok, false);
      assert.match(result.reason, /no uploaded artifacts/);
    });

    it('rejects a release missing sourcemaps or bundles', () => {
      const onlyMaps = verifyReleaseFilesResponse({
        release,
        status: 200,
        body: { files: [{ name: 'assets/index-abc.js.map' }] },
      });
      assert.equal(onlyMaps.ok, false);
      assert.match(onlyMaps.reason, /missing sourcemap coverage/);

      const onlyBundles = verifyReleaseFilesResponse({
        release,
        status: 200,
        body: { files: [{ name: 'assets/index-abc.js' }] },
      });
      assert.equal(onlyBundles.ok, false);
      assert.match(onlyBundles.reason, /missing sourcemap coverage/);
    });

    it('rejects artifacts from a stale release with no matching bundle/map pair', () => {
      const result = verifyReleaseFilesResponse({
        release,
        status: 200,
        body: {
          files: [
            { name: 'assets/index-old.js' },
            { name: 'assets/index-new.js.map' },
          ],
        },
      });
      assert.equal(result.ok, false);
      assert.match(result.reason, /no bundle with a matching sourcemap/);
    });
  });

  describe('extractFiles', () => {
    it('accepts a raw array', () => {
      assert.deepEqual(extractFiles([{ name: 'a.js' }]), [{ name: 'a.js' }]);
    });

    it('accepts a files envelope', () => {
      assert.deepEqual(extractFiles({ files: [{ name: 'a.js' }] }), [{ name: 'a.js' }]);
    });

    it('returns null for non-array bodies', () => {
      assert.equal(extractFiles({ error: 'x' }), null);
      assert.equal(extractFiles('nope'), null);
    });
  });
});
