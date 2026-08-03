'use strict';

const fs = require('fs');
const path = require('path');

const { getServerTarget } = require('./lib/serverTarget');

const DEFAULT_INGESTION_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_BUFFER_HOURS = 2;
const DEFAULT_EXPIRATION_HOURS = 6;
const SUPPORTED_DAYS = [1, 2];
const VALID_PERIODS = ['full', '4hr', '1hr'];

/** Returns true when the period string is a known SPC thunder period. */
const isValidPeriod = (period) => VALID_PERIODS.includes(period);

/** Returns the cache root directory for the given deployment target. */
const cacheDir = (target, env = process.env) =>
  path.join(env.TSTM_CACHE_DIR || path.join(__dirname, 'cache', 'tstm'), target);

/** Returns the cache file path for a specific day and period. */
const cacheFilePath = (target, day, period, env = process.env) =>
  path.join(cacheDir(target, env), `day${day}`, `${period}.json`);

/** Reads cache and reports miss, corrupt, or hit without exposing internal paths. */
const readCacheState = (target, day, period, env = process.env) => {
  if (!isValidPeriod(period)) {
    return { state: 'miss' };
  }

  const filePath = cacheFilePath(target, day, period, env);
  if (!fs.existsSync(filePath)) {
    return { state: 'miss' };
  }

  try {
    return {
      state: 'hit',
      data: JSON.parse(fs.readFileSync(filePath, 'utf8')),
    };
  } catch {
    return { state: 'corrupt' };
  }
};

/** Reads cached TSTM data for a target/day/period. Returns null on any error. */
const readCache = (target, day, period, env = process.env) => {
  const entry = readCacheState(target, day, period, env);
  return entry.state === 'hit' ? entry.data : null;
};

/** Atomically writes TSTM data to the cache (write-to-temp, then rename). */
const writeCache = ({ target, day, period, data, env = process.env }) => {
  const filePath = cacheFilePath(target, day, period, env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
};

/** Removes a cache entry. Used only for explicit invalidation. */
const deleteCache = (target, day, period, env = process.env) => {
  try {
    fs.unlinkSync(cacheFilePath(target, day, period, env));
  } catch {
    // Ignore — file may not exist.
  }
};

/** Returns true when the cached data's valid window has expired. */
const isCacheExpired = (data, now = Date.now(), expirationHours = DEFAULT_EXPIRATION_HOURS) => {
  if (!data?.effectiveEnd) return true;
  try {
    const effectiveEndMs = new Date(data.effectiveEnd).getTime();
    if (!Number.isFinite(effectiveEndMs)) return true;
    return now > effectiveEndMs + expirationHours * 3600_000;
  } catch {
    return true;
  }
};

/** Returns true when a generator response indicates the run data is complete and usable. */
const isRunComplete = (result) => {
  if (!result || typeof result !== 'object') return false;
  if (!Array.isArray(result.features) || result.features.length === 0) return false;
  return !(result.completeness && result.completeness.complete === false);
};

/**
 * Resolves the HREF run timestamps to check for Day 1 and Day 2 based on
 * the current UTC hour plus a buffer for SPC posting delay.
 */
const resolveRuns = (utcNow, bufferHours) => {
  const hour = utcNow.getUTCHours();
  const date = utcNow.toISOString().slice(0, 10);

  if (hour >= 12 + bufferHours) {
    return { day1Run: `${date}T12:00:00Z`, day2Run: `${date}T12:00:00Z` };
  }

  if (hour >= bufferHours) {
    const prev = new Date(utcNow);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return { day1Run: `${date}T00:00:00Z`, day2Run: `${prev.toISOString().slice(0, 10)}T12:00:00Z` };
  }

  return { day1Run: null, day2Run: null };
};

/**
 * Computes candidate ingestion targets based on the current time.
 *
 * HREF runs at 0Z and 12Z.  SPC posts calibrated thunder ~1-3 hours after
 * model init (variable).  The buffer accounts for this delay.
 *
 * Returns an array of { day, period, run } objects to check.
 */
const computeCandidateRuns = (now, bufferHours = DEFAULT_BUFFER_HOURS) => {
  const { day1Run, day2Run } = resolveRuns(new Date(now), bufferHours);
  const candidates = [];

  if (day1Run) candidates.push({ day: 1, period: 'full', run: day1Run });
  if (day2Run) candidates.push({ day: 2, period: 'full', run: day2Run });

  return candidates;
};

/** Builds the cache entry from a successful generator result. */
const buildCacheData = (result, day, period) => ({
  run: result.run,
  day,
  period,
  features: result.features,
  effectiveStart: result.effectiveStart,
  effectiveEnd: result.effectiveEnd,
  forecastHours: Array.isArray(result.forecastHours) ? result.forecastHours : [],
  warnings: Array.isArray(result.warnings) ? result.warnings : [],
  thresholds: result.thresholds,
  sources: result.sources && typeof result.sources === 'object' ? result.sources : {},
  generatedAt: result.generatedAt,
  ingestedAt: new Date().toISOString(),
  complete: true,
  domain: result.domain || 'conus',
});

/** Summarizes cache availability for each supported day and period. */
const getTstmCacheHealth = (target, env = process.env, now = Date.now()) => {
  const cache = {};

  for (const day of SUPPORTED_DAYS) {
    const dayKey = `day${day}`;
    cache[dayKey] = {};

    for (const period of VALID_PERIODS) {
      const entry = readCacheState(target, day, period, env);
      if (entry.state === 'miss') {
        cache[dayKey][period] = {
          available: false,
          reason: 'cache_miss',
        };
        continue;
      }

      if (entry.state === 'corrupt') {
        cache[dayKey][period] = {
          available: false,
          reason: 'cache_corrupt',
        };
        continue;
      }

      const cached = entry.data;
      if (isCacheExpired(cached, now)) {
        cache[dayKey][period] = {
          available: false,
          stale: true,
          reason: 'cache_stale',
          run: cached.run,
          ingestedAt: cached.ingestedAt,
          effectiveEnd: cached.effectiveEnd,
        };
        continue;
      }

      cache[dayKey][period] = {
        available: true,
        stale: false,
        run: cached.run,
        ingestedAt: cached.ingestedAt,
        effectiveEnd: cached.effectiveEnd,
      };
    }
  }

  return {
    ingestionEnabled: env.TSTM_INGESTION_ENABLED === 'true',
    cache,
  };
};

/**
 * Runs a single ingestion cycle: checks each candidate run, spawns the
 * generator, and only writes to cache when data is confirmed complete.
 */
const runIngestionCycle = async (options = {}) => {
  const {
    env = process.env,
    target = getServerTarget(env),
    runGenerator,
    now = Date.now(),
    bufferHours = DEFAULT_BUFFER_HOURS,
    log = console,
  } = options;

  const candidates = computeCandidateRuns(now, bufferHours);

  for (const { day, period, run } of candidates) {
    try {
      const result = await runGenerator({ day, cycleDate: run.slice(0, 10), cycleRun: run }, { ingestionMode: true });

      if (!isRunComplete(result)) {
        log.info?.(`[tstm-ingest] run ${run} day ${day} not ready, retaining cache`);
        continue;
      }

      writeCache({ target, day, period, data: buildCacheData(result, day, period), env });
      log.info?.(`[tstm-ingest] run ${run} day ${day} cached (${result.features.length} features)`);
    } catch (err) {
      log.info?.(`[tstm-ingest] run ${run} day ${day} skipped: ${err.message}`);
    }
  }
};

/**
 * Starts the periodic ingestion loop.  Returns a stop function.
 */
const startIngestionLoop = (options = {}) => {
  const {
    env = process.env,
    intervalMs = Number(env.TSTM_INGESTION_INTERVAL_MS) || DEFAULT_INGESTION_INTERVAL_MS,
    runGenerator,
    log = console,
  } = options;

  if (!runGenerator) {
    throw new Error('runGenerator is required to start the ingestion loop');
  }

  let timer = null;
  let running = false;

  /** Runs one ingestion cycle, skipping when a previous tick is still in flight. */
  async function tick() {
    if (running) return;
    running = true;
    try {
      await runIngestionCycle({ env, runGenerator, log });
    } finally {
      running = false;
    }
  }

  tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

module.exports = {
  buildCacheData,
  cacheDir,
  cacheFilePath,
  computeCandidateRuns,
  deleteCache,
  DEFAULT_BUFFER_HOURS,
  DEFAULT_EXPIRATION_HOURS,
  DEFAULT_INGESTION_INTERVAL_MS,
  getTstmCacheHealth,
  isCacheExpired,
  isValidPeriod,
  isRunComplete,
  readCache,
  readCacheState,
  runIngestionCycle,
  startIngestionLoop,
  SUPPORTED_DAYS,
  VALID_PERIODS,
  writeCache,
};
