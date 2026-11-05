#!/usr/bin/env node
// Post-deploy smoke test. Usage: node tools/smoke-test.mjs <base-url>
//
// Season gating hides /tracker, /advent and their APIs from visitors outside their windows (see
// apps/web/src/lib/season.ts), so an anonymous request cannot prove they work. Set
// SMOKE_ADMIN_PASSWORD to also log in as admin (one POST to /api/admin/login) and verify the real
// data. Without it the admin-only checks are skipped, not failed.
//
// Anonymous requests to gated routes must answer 200 (open) or 404 (closed), never an error. A
// response produced for an admin through a closed gate must be `no-store` so it cannot be cached
// and served to a visitor.
//
// Exits non-zero if any check fails.
const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '');
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? '';
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
function skip(name, reason) {
  console.log(`SKIP  ${name}: ${reason}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const get = (path, init = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init });

let adminHeaders = null;
if (adminPassword) {
  await check('Admin login works', async () => {
    const res = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: adminPassword }),
    });
    assert(res.status === 200, `status ${res.status}`);
    const { token } = await res.json();
    assert(typeof token === 'string' && token.length > 20, 'no token returned');
    adminHeaders = { cookie: `admin_token=${token}` };
  });
}

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

// Anonymous visitors: open (200) or closed (404). Anything else is a broken deploy.
for (const path of ['/tracker', '/advent', '/api/route', '/api/advent/manifest']) {
  await check(`Visitors get 200 or 404 from ${path}`, async () => {
    const res = await get(path);
    assert([200, 404].includes(res.status), `status ${res.status}`);
  });
}

async function adminCheck(name, fn) {
  if (!adminHeaders) return skip(name, 'SMOKE_ADMIN_PASSWORD not set or login failed');
  return check(name, fn);
}

await adminCheck('Route snapshot loads from R2 and is not cacheable by visitors when closed', async () => {
  const anon = await get('/api/route');
  const res = await get('/api/route', { headers: adminHeaders });
  assert(res.status === 200, `status ${res.status}`);
  const cache = res.headers.get('cache-control') ?? '';
  if (anon.status === 404) assert(/no-store/.test(cache), `closed gate leaked a cacheable admin response: "${cache}"`);
  else assert(/s-maxage=60/.test(cache), `cache-control was "${cache}"`);
  const body = await res.json();
  assert(body && typeof body === 'object' && Object.keys(body).length > 0, 'empty body');
});

let manifestOk = false;
await adminCheck('Advent manifest loads, exposes no payloads, and is never cached', async () => {
  const res = await get('/api/advent/manifest', { headers: adminHeaders });
  assert(res.status === 200, `status ${res.status}`);
  manifestOk = true;
  assert(/no-store/.test(res.headers.get('cache-control') ?? ''), 'not no-store');
  assert(!/"payload"|"content"/.test(await res.text()), 'manifest leaks payload/content');
});

await adminCheck('Locked Advent day is not served early', async () => {
  const now = new Date();
  const unlocked = now.getUTCMonth() === 11 && now.getUTCDate() >= 24;
  if (unlocked) return; // day 24 is legitimately open on/after Dec 24
  assert(manifestOk, 'skipped: Advent manifest is not working, so a non-200 proves nothing');
  const res = await get('/api/advent/24', { headers: adminHeaders });
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
