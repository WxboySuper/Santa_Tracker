'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const {
  isTstmGenerationEnabled,
  registerTstmIngestion,
  registerTstmRoutes,
  runTstmGenerator,
} = require('./tstm');
const { allTargetsEnabledRouteOptions } = require('./testing/featureExposureTargetMatrix');

const startServer = (env, routeOptions = {}) => {
  const app = express();
  registerTstmRoutes(app, express, { env, ...routeOptions });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
};

const createFakeChild = () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit('close', null);
  return child;
};

const SAMPLE_CACHED_ROUTE = {
  run: '2026-06-13T12:00:00Z',
  day: 1,
  period: 'full',
  features: [{ type: 'Feature', id: 't-0', geometry: { type: 'Polygon', coordinates: [[[-100, 30], [-99, 30], [-99, 31], [-100, 31], [-100, 30]]] }, properties: {} }],
  effectiveStart: '2026-06-13T06:00:00Z',
  effectiveEnd: '2099-01-01T00:00:00Z',
  forecastHours: [24],
  warnings: [],
  ingestedAt: '2026-06-13T14:05:12Z',
  complete: true,
};

const writeDay1FullCache = (tmpDir, data = SAMPLE_CACHED_ROUTE) => {
  const cacheDir = path.join(tmpDir, 'local', 'day1');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'full.json'), JSON.stringify(data));
};

const startTstmRoutesServer = (env, routeOptions = {}) => {
  const app = express();
  registerTstmRoutes(app, express, { env, runGenerator: async () => ({}), ...routeOptions });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
};

const getTstmRouteUrl = (server, routePath, query = '') => {
  const { port } = server.address();
  return `http://127.0.0.1:${port}${routePath}${query}`;
};

/** Fetches a TSTM route and always closes the ephemeral test server. */
const withTstmRouteResponse = async ({
  tmpDir,
  env,
  routeOptions = allTargetsEnabledRouteOptions(),
  cache,
  routePath,
  query = '',
}, runAssertion) => {
  if (cache !== undefined) {
    writeDay1FullCache(tmpDir, cache);
  }
  const server = await startTstmRoutesServer(env, routeOptions);
  try {
    const response = await fetch(getTstmRouteUrl(server, routePath, query));
    await runAssertion(response);
  } finally {
    server.close();
  }
};

/** Exercises one TSTM route and asserts only its HTTP status. */
const assertTstmRouteStatus = (options, expectedStatus) =>
  withTstmRouteResponse(options, async (response) => {
    assert.equal(response.status, expectedStatus);
  });

describe('Auto-TSTM server foundation', () => {
  it('stays disabled unless registry exposure and deployment env are both enabled', () => {
    assert.equal(isTstmGenerationEnabled({}), false);
    assert.equal(isTstmGenerationEnabled({ TSTM_GENERATION_ENABLED: 'false' }), false);
    assert.equal(isTstmGenerationEnabled({ TSTM_GENERATION_ENABLED: 'true' }), false);
    assert.equal(
      isTstmGenerationEnabled({ TSTM_GENERATION_ENABLED: 'true' }, allTargetsEnabledRouteOptions()),
      true
    );
  });

  it('never exposes direct generation, even when the capability is enabled', async () => {
    const server = await startServer(
      { TSTM_GENERATION_ENABLED: 'true' },
      allTargetsEnabledRouteOptions()
    );
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tstm/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day: 1, cycleDate: '2026-06-13' }),
      });
      assert.equal(response.status, 404);
    } finally {
      server.close();
    }
  });

  it('rejects malformed generator output', async () => {
    const child = createFakeChild();
    const result = runTstmGenerator(
      { day: 1, cycleDate: '2026-06-13' },
      { spawnProcess: () => child }
    );
    child.stdout.end('not json');
    child.emit('close', 0);
    await assert.rejects(result, /TSTM_GENERATOR_INVALID_JSON/);
  });

  it('terminates a generator that exceeds its timeout', async () => {
    const child = createFakeChild();
    let killed = false;
    child.kill = () => {
      killed = true;
      setImmediate(() => child.emit('close', null));
    };
    await assert.rejects(
      runTstmGenerator(
        { day: 1, cycleDate: '2026-06-13' },
        {
          env: { TSTM_GENERATION_TIMEOUT_MS: '1' },
          spawnProcess: () => child,
        }
      ),
      /TSTM_GENERATION_TIMEOUT/
    );
    assert.equal(killed, true);
  });

  it('passes --ingestion-mode flag when ingestionMode is set', async () => {
    const child = createFakeChild();
    let spawnedArgs;
    runTstmGenerator(
      { day: 1, cycleDate: '2026-06-13' },
      {
        spawnProcess: (_cmd, args) => {
          spawnedArgs = args;
          return child;
        },
        ingestionMode: true,
      }
    );
    child.stdout.end('{}');
    child.emit('close', 0);
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(spawnedArgs.includes('--ingestion-mode'));
  });

  it('uses the configured Python interpreter for the generator', async () => {
    const child = createFakeChild();
    let spawnedCommand;
    const result = runTstmGenerator(
      { day: 1, cycleDate: '2026-06-13' },
      {
        env: { PYTHON_BIN: '/opt/gfc-beta-analytics/.venv/bin/python' },
        spawnProcess: (command) => {
          spawnedCommand = command;
          return child;
        },
      }
    );
    child.stdout.end('{}');
    child.emit('close', 0);
    await result;
    assert.equal(spawnedCommand, '/opt/gfc-beta-analytics/.venv/bin/python');
  });
});

describe('GET /api/tstm/latest', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tstm-latest-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns cached data when available', async () => {
    await withTstmRouteResponse({
      tmpDir,
      env: { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      cache: SAMPLE_CACHED_ROUTE,
      routePath: '/api/tstm/latest',
      query: '?day=1&period=full',
    }, async (res) => {
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.run, '2026-06-13T12:00:00Z');
      assert.equal(body.features.length, 1);
    });
  });

  it('returns cached source metadata when present', async () => {
    const sources = {
      calibratedThunder: {
        product: 'spc_hrefct_full',
        run: '2026-06-13T12:00:00Z',
        period: 'full',
      },
    };
    await withTstmRouteResponse({
      tmpDir,
      env: { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      cache: { ...SAMPLE_CACHED_ROUTE, sources },
      routePath: '/api/tstm/latest',
      query: '?day=1&period=full',
    }, async (res) => {
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.sources, sources);
    });
  });

  it('returns 404 when no cache exists', async () => {
    await withTstmRouteResponse({
      tmpDir,
      env: { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      routePath: '/api/tstm/latest',
      query: '?day=1',
    }, async (res) => {
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), {
        error: 'No cached TSTM data available.',
        reason: 'cache_miss',
      });
    });
  });

  it('returns 404 when cache file is corrupt', async () => {
    const corruptPath = path.join(tmpDir, 'local', 'day1', 'full.json');
    fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
    fs.writeFileSync(corruptPath, '{not-json', 'utf8');

    await withTstmRouteResponse({
      tmpDir,
      env: { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      routePath: '/api/tstm/latest',
      query: '?day=1&period=full',
    }, async (res) => {
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), {
        error: 'Cached TSTM data is unavailable.',
        reason: 'cache_corrupt',
      });
    });
  });

  it('returns 400 for invalid day parameter', async () => {
    await assertTstmRouteStatus({
      tmpDir,
      env: { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      routePath: '/api/tstm/latest',
      query: '?day=3',
    }, 400);
  });

  it('returns 404 when capability is disabled', async () => {
    await assertTstmRouteStatus({
      tmpDir,
      env: { TSTM_CACHE_DIR: tmpDir },
      cache: SAMPLE_CACHED_ROUTE,
      routeOptions: {},
      routePath: '/api/tstm/latest',
      query: '?day=1',
    }, 404);
  });

  it('returns 404 when cached data has expired', async () => {
    await withTstmRouteResponse({
      tmpDir,
      env: { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      cache: {
        ...SAMPLE_CACHED_ROUTE,
        effectiveEnd: '2026-06-13T12:00:00Z',
      },
      routePath: '/api/tstm/latest',
      query: '?day=1',
    }, async (res) => {
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.reason, 'cache_stale');
      assert.ok(body.error.includes('expired'));
    });
  });

  it('rate limits repeated latest requests', async () => {
    const rateLimit = require('express-rate-limit');
    writeDay1FullCache(tmpDir, SAMPLE_CACHED_ROUTE);
    const server = await startTstmRoutesServer(
      { TSTM_GENERATION_ENABLED: 'true', TSTM_CACHE_DIR: tmpDir },
      {
        ...allTargetsEnabledRouteOptions(),
        readRateLimit: rateLimit({
          windowMs: 60 * 1000,
          limit: 1,
          standardHeaders: true,
          legacyHeaders: false,
        }),
      },
    );
    try {
      const url = getTstmRouteUrl(server, '/api/tstm/latest', '?day=1&period=full');
      const first = await fetch(url);
      const second = await fetch(url);
      assert.equal(first.status, 200);
      assert.equal(second.status, 429);
    } finally {
      server.close();
    }
  });
});

describe('registerTstmIngestion', () => {
  it('returns null when capability is not enabled', () => {
    const result = registerTstmIngestion({}, express, {
      env: { TSTM_INGESTION_ENABLED: 'true' },
    });
    assert.equal(result, null);
  });

  it('returns null when TSTM_INGESTION_ENABLED is not set', () => {
    const result = registerTstmIngestion({}, express, {
      env: { TSTM_GENERATION_ENABLED: 'true' },
    });
    assert.equal(result, null);
  });
});

describe('GET /api/tstm/status', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tstm-status-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reports cache miss and available entries without leaking internals', async () => {
    await withTstmRouteResponse({
      tmpDir,
      env: {
        TSTM_GENERATION_ENABLED: 'true',
        TSTM_CACHE_DIR: tmpDir,
        TSTM_INGESTION_ENABLED: 'true',
      },
      cache: SAMPLE_CACHED_ROUTE,
      routePath: '/api/tstm/status',
    }, async (res) => {
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ingestionEnabled, true);
      assert.equal(body.cache.day1.full.available, true);
      assert.equal(body.cache.day2.full.reason, 'cache_miss');
      assert.equal(JSON.stringify(body).includes(tmpDir), false);
    });
  });

  it('returns 404 when capability is disabled without reading cache', async () => {
    await assertTstmRouteStatus({
      tmpDir,
      env: { TSTM_CACHE_DIR: tmpDir },
      cache: SAMPLE_CACHED_ROUTE,
      routeOptions: {},
      routePath: '/api/tstm/status',
    }, 404);
  });
});
