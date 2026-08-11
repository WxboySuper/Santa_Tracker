import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractArtifactBundles,
  fetchArtifactBundles,
  verifyArtifactBundlesResponse,
} from './sentry-artifact-bundle-verification.mjs';
import {
  buildReleaseName,
  evaluateSentryConfig,
  extractFiles,
  fetchReleaseFiles,
  findMissingLocalMaps,
  normalizeProjectSlug,
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

  describe('normalizeProjectSlug', () => {
    it('normalizes configured project names for the Sentry API', () => {
      assert.equal(normalizeProjectSlug(' GFC-WEB '), 'gfc-web');
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

  describe('verifyArtifactBundlesResponse', () => {
    const release = 'graphical-forecast-creator@1.7.0-beta.111';

    it('accepts a published bundle associated with the exact release', () => {
      const result = verifyArtifactBundlesResponse({
        release,
        status: 200,
        body: [{
          bundleId: 'bundle-1',
          associations: [{ release }],
          fileCount: 91,
        }],
        minimumFileCount: 45,
      });
      assert.equal(result.ok, true);
    });

    it('rejects a bundle for a different release or with too few files', () => {
      const result = verifyArtifactBundlesResponse({
        release,
        status: 200,
        body: [{
          associations: [{ release: 'graphical-forecast-creator@1.7.0-beta.110' }],
          fileCount: 91,
        }, {
          associations: [{ release }],
          fileCount: 2,
        }],
        minimumFileCount: 45,
      });
      assert.equal(result.ok, false);
      assert.match(result.reason, /no published artifact bundle/);
    });
  });

  describe('extractArtifactBundles', () => {
    it('accepts the API array response', () => {
      assert.deepEqual(extractArtifactBundles([{ bundleId: 'a' }]), [{ bundleId: 'a' }]);
    });

    it('returns an empty list for malformed responses', () => {
      assert.deepEqual(extractArtifactBundles({ error: 'x' }), []);
    });
  });

  describe('fetchReleaseFiles', () => {
    it('returns the parsed files envelope from the API', async () => {
      const fetchFn = async () => ({
        status: 200,
        headers: { get: () => null },
        json: async () => ({ files: [{ name: 'assets/index-abc.js' }] }),
      });
      const result = await fetchReleaseFiles({
        token: 't', org: 'o', project: 'p', release: 'r', fetchFn,
      });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.files, [{ name: 'assets/index-abc.js' }]);
    });

    it('follows pagination Link headers and aggregates every page', async () => {
      const responses = [
        { status: 200, headers: { get: () => '</next?cursor=2>; rel="next"' }, json: async () => ({ files: [{ name: 'a.js' }] }) },
        { status: 200, headers: { get: () => null }, json: async () => ({ files: [{ name: 'b.js' }, { name: 'b.js.map' }] }) },
      ];
      let calls = 0;
      const fetchFn = async () => responses[calls++];
      const result = await fetchReleaseFiles({
        token: 't', org: 'o', project: 'p', release: 'r', fetchFn,
      });
      assert.equal(calls, 2);
      assert.deepEqual(result.body.files, [{ name: 'a.js' }, { name: 'b.js' }, { name: 'b.js.map' }]);
    });

    it('stops pagination on a non-2xx response', async () => {
      let calls = 0;
      const fetchFn = async () => {
        calls += 1;
        return {
          status: 403,
          headers: { get: () => '</next?cursor=2>; rel="next"' },
          json: async () => ({ detail: 'denied' }),
        };
      };
      const result = await fetchReleaseFiles({
        token: 't', org: 'o', project: 'p', release: 'r', fetchFn,
      });
      assert.equal(calls, 1);
      assert.equal(result.status, 403);
    });
  });

  describe('fetchArtifactBundles', () => {
    it('uses the normalized project slug and follows pagination', async () => {
      const requestedUrls = [];
      const responses = [
        { status: 200, headers: { get: () => '</next?cursor=2>; rel="next"' }, json: async () => [{ bundleId: 'a' }] },
        { status: 200, headers: { get: () => null }, json: async () => [{ bundleId: 'b' }] },
      ];
      const fetchFn = async (url) => {
        requestedUrls.push(url);
        return responses[requestedUrls.length - 1];
      };
      const result = await fetchArtifactBundles({
        token: 't', org: 'o', project: 'GFC-WEB', release: 'r', fetchFn,
      });
      assert.equal(requestedUrls[0], 'https://sentry.io/api/0/projects/o/gfc-web/files/artifact-bundles/');
      assert.deepEqual(result.body, [{ bundleId: 'a' }, { bundleId: 'b' }]);
    });
  });

  describe('findMissingLocalMaps', () => {
    it('reports no missing maps when every local basename is published', () => {
      const remoteFiles = [{ name: 'assets/a.js' }, { name: 'assets/a.js.map' }, { name: 'assets/b.js.map' }];
      const { missing } = findMissingLocalMaps({ remoteFiles, localMapBasenames: ['a.js.map', 'b.js.map'] });
      assert.deepEqual(missing, []);
    });

    it('reports local maps that were not published remotely', () => {
      const remoteFiles = [{ name: 'assets/a.js' }, { name: 'assets/a.js.map' }];
      const { missing } = findMissingLocalMaps({ remoteFiles, localMapBasenames: ['a.js.map', 'b.js.map', 'c.js.map'] });
      assert.deepEqual(missing, ['b.js.map', 'c.js.map']);
    });
  });
});
