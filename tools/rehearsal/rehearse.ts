import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { computeSantaPosition } from "../../apps/web/src/lib/tracker-position";
import type { RouteNode } from "../../apps/web/src/lib/locations";

const root = process.cwd();
const routePath = path.join(root, "apps/web/data/santa_route.json");
const scratch = await mkdtemp(path.join(os.tmpdir(), "santa-rehearsal-"));
const fixturePath = path.join(scratch, "santa_route.json");
const basePort = Number(process.env.REHEARSAL_PORT ?? 4317);
if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65535) throw new Error("REHEARSAL_PORT must be a valid local port");
const baseUrl = `http://127.0.0.1:${basePort}`;
const flight = [
  { id: "anchor", type: "TAKEOFF", location: { name: "North Pole", lat: 90, lng: 0 }, schedule: { arrival_utc: "2026-12-24T09:59:00.000Z", departure_utc: "2026-12-24T10:00:00.000Z" }, stop_experience: { duration_seconds: 0 } },
  { id: "stop-one", type: "DELIVERY", location: { name: "Stop One", lat: 60, lng: 30 }, schedule: { arrival_utc: "2026-12-24T10:30:00.000Z", departure_utc: "2026-12-24T10:32:00.000Z" }, stop_experience: { duration_seconds: 120 } },
  { id: "stop-two", type: "DELIVERY", location: { name: "Stop Two", lat: 30, lng: 90 }, schedule: { arrival_utc: "2026-12-24T11:00:00.000Z", departure_utc: "2026-12-24T11:02:00.000Z" }, stop_experience: { duration_seconds: 120 } },
  { id: "landing", type: "LANDING", location: { name: "North Pole", lat: 90, lng: 0 }, schedule: { arrival_utc: "2026-12-24T11:30:00.000Z", departure_utc: "2026-12-24T11:31:00.000Z" }, stop_experience: { duration_seconds: 60 } },
];

await mkdir(scratch, { recursive: true });
const sourceData = JSON.parse(await readFile(routePath, "utf-8")) as { meta?: Record<string, unknown> };
await writeFile(fixturePath, JSON.stringify({ ...sourceData, meta: { ...sourceData.meta, year: 2026 }, route_nodes: flight }, null, 2));

async function run(): Promise<void> {
  const closedServer = startServer(basePort, undefined, fixturePath, "2026-11-06T12:00:00.000Z");
  try {
    await waitForServer(baseUrl);
    await assertClosedSeason(baseUrl);
  } finally {
    await stopServer(closedServer);
  }

  const cases = [
    { label: "before takeoff", instant: "2026-12-24T09:58:30.000Z", complete: false, currentIndex: null },
    { label: "at takeoff", instant: "2026-12-24T10:00:00.000Z", complete: false, currentIndex: 0 },
    { label: "mid-route", instant: "2026-12-24T10:45:00.000Z", complete: false, currentIndex: 1 },
    { label: "final stop", instant: "2026-12-24T11:31:00.000Z", complete: true, currentIndex: 3 },
    { label: "after landing", instant: "2026-12-24T11:40:00.000Z", complete: true, currentIndex: 3 },
  ] as const;

  for (const testCase of cases) {
    const openServer = startServer(basePort, "open", fixturePath, testCase.instant);
    try {
      await waitForServer(baseUrl);
      const page = await fetch(`${baseUrl}/tracker`);
      assert.equal(page.status, 200, `${testCase.label}: tracker page`);
      const response = await fetch(`${baseUrl}/api/route`);
      assert.equal(response.status, 200, `${testCase.label}: route API`);
      const payload = await response.json() as { route_nodes: RouteNode[] };
      assert.equal(payload.route_nodes.length, flight.length, `${testCase.label}: route node count`);
      const position = computeSantaPosition(payload.route_nodes, new Date(testCase.instant));
      assert.ok(position, `${testCase.label}: position exists`);
      assert.ok(Number.isFinite(position.lat) && position.lat >= -90 && position.lat <= 90, `${testCase.label}: latitude`);
      assert.ok(Number.isFinite(position.lng) && position.lng >= -180 && position.lng <= 180, `${testCase.label}: longitude`);
      assert.equal(position.journey.isComplete, testCase.complete, `${testCase.label}: completion state`);
      assert.equal(position.journey.currentIndex, testCase.currentIndex, `${testCase.label}: leg index`);
      assert.ok(position.journey.progress >= 0 && position.journey.progress <= 1, `${testCase.label}: route progress`);
      console.log(`PASS ${testCase.label.padEnd(14)} tracker=200 route=200 complete=${position.journey.isComplete} leg=${position.journey.currentIndex ?? "waiting"} position=${position.lat.toFixed(2)},${position.lng.toFixed(2)}`);
    } finally {
      await stopServer(openServer);
    }
  }
  await rm(scratch, { recursive: true, force: true });
}

async function assertClosedSeason(url: string): Promise<void> {
  const [page, api] = await Promise.all([fetch(`${url}/tracker`), fetch(`${url}/api/route`)]);
  assert.equal(page.status, 404, "closed season tracker page");
  assert.equal(api.status, 404, "closed season route API");
  assert.equal(api.headers.get("cache-control"), "private, no-store", "closed season route cache policy");
  console.log("PASS closed season tracker=404 route=404 cache=private, no-store");
}

function startServer(port: number, override: string | undefined, scratchRoute: string, instant: string): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", SANTA_DATA_ROOT: scratch, SANTA_ROUTE_PATH: scratchRoute };
  env.LOCAL_REHEARSAL_TIME = instant;
  if (override) env.SEASON_OVERRIDE = override;
  else delete env.SEASON_OVERRIDE;
  return spawn(process.execPath, [path.join(root, "apps/web/node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(root, "apps/web"),
    env,
    stdio: "inherit",
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error(`Local server did not start at ${url}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise<void>(resolve => child.once("exit", () => resolve())), delay(5_000)]);
  if (child.exitCode == null) child.kill("SIGKILL");
}

try {
  await run();
} catch (error) {
  await rm(scratch, { recursive: true, force: true });
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
