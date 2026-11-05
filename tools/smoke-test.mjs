#!/usr/bin/env node
// Post-deploy smoke test. Usage: node tools/smoke-test.mjs <base-url>
// Read-only: only issues GET requests. Exits non-zero if any check fails.
const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: node tools/smoke-test.mjs <base-url>');
  process.exit(2);
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const get = (path, init = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init });

await check('GET / returns 200 HTML', async () => {
  const res = await get('/');
  assert(res.status === 200, `status ${res.status}`);
  assert((res.headers.get('content-type') ?? '').includes('text/html'), 'not html');
});

await check('GET /api/health returns ok', async () => {
  const res = await get('/api/health');
  assert(res.status === 200, `status ${res.status}`);
  assert((await res.json()).status === 'ok', 'status field not ok');
});

await check('GET /api/route serves a route snapshot from R2', async () => {
  const res = await get('/api/route');
  assert(res.status === 200, `status ${res.status}`);
  const cache = res.headers.get('cache-control') ?? '';
  assert(/s-maxage=60/.test(cache), `cache-control was "${cache}"`);
  const body = await res.json();
  assert(body && typeof body === 'object' && Object.keys(body).length > 0, 'empty body');
});

let manifestOk = false;
await check('GET /api/advent/manifest exposes no payloads', async () => {
  const res = await get('/api/advent/manifest');
  assert(res.status === 200, `status ${res.status}`);
  manifestOk = true;
  assert(/no-store/.test(res.headers.get('cache-control') ?? ''), 'not no-store');
  assert(!/"payload"|"content"/.test(await res.text()), 'manifest leaks payload/content');
});

await check('Locked Advent day is not served early', async () => {
  const now = new Date();
  const unlocked = now.getUTCMonth() === 11 && now.getUTCDate() >= 24;
  if (unlocked) return; // day 24 is legitimately open on/after Dec 24
  assert(manifestOk, 'skipped: Advent manifest is not working, so a non-200 proves nothing');
  const res = await get('/api/advent/24');
  assert([403, 404, 423].includes(res.status), `day 24 returned ${res.status} on ${now.toISOString()}`);
  assert(!/"payload"/.test(await res.text()), 'locked day leaked a payload');
});

await check('Admin page requires auth', async () => {
  const res = await get('/admin/', { headers: { accept: 'application/json' } });
  assert([301, 302, 303, 307, 308, 401, 403].includes(res.status), `status ${res.status}`);
});

await check('Admin API rejects anonymous requests', async () => {
  const res = await get('/api/admin/locations');
  assert([401, 403].includes(res.status), `status ${res.status}`);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
