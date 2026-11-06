import { performance } from "node:perf_hooks";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const port = Number(process.env.LOAD_PORT ?? 4318);
const origin = `http://127.0.0.1:${port}`;
const connections = Number(process.env.LOAD_CONNECTIONS ?? 300);
const durationSeconds = Number(process.env.LOAD_DURATION_SECONDS ?? 30);
const paths = ["/tracker", "/api/route", "/api/health"];

if (!Number.isInteger(connections) || connections < 1 || connections > 1000) throw new Error("LOAD_CONNECTIONS must be between 1 and 1000");
if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 600) throw new Error("LOAD_DURATION_SECONDS must be between 1 and 600");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("LOAD_PORT must be a valid local port");

const scratch = await mkdtemp(path.join(os.tmpdir(), "santa-load-"));
const routePath = path.join(scratch, "santa_route.json");
await copyFile(path.join(root, "apps/web/data/santa_route.json"), routePath);
const child = spawn(process.execPath, [path.join(root, "apps/web/node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: path.join(root, "apps/web"),
  env: { ...process.env, NODE_ENV: "development", SEASON_OVERRIDE: "open", SANTA_DATA_ROOT: scratch, SANTA_ROUTE_PATH: routePath },
  stdio: "inherit",
});

const samples = new Map(paths.map(path => [path, { durations: [], errors: 0, requests: 0 }]));
const deadline = performance.now() + durationSeconds * 1000;
let cursor = 0;

async function worker() {
  while (performance.now() < deadline) {
    const path = paths[cursor++ % paths.length];
    const result = samples.get(path);
    if (!result) continue;
    const started = performance.now();
    try {
      const response = await fetch(`${origin}${path}`);
      await response.arrayBuffer();
      result.durations.push(performance.now() - started);
      result.requests++;
      if (!response.ok) result.errors++;
    } catch {
      result.durations.push(performance.now() - started);
      result.requests++;
      result.errors++;
    }
  }
}

function percentile(values, percent) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percent * sorted.length) - 1] ?? 0;
}

try {
  await waitForServer();
  await Promise.all(Array.from({ length: connections }, () => worker()));
  console.log(`Local load results: origin=${origin} connections=${connections} duration=${durationSeconds}s`);
  console.log("endpoint       requests errors error-rate p50-ms p95-ms p99-ms");
  for (const [path, result] of samples) {
    const errorRate = result.requests === 0 ? 1 : result.errors / result.requests;
    console.log(`${path.padEnd(14)} ${String(result.requests).padStart(8)} ${String(result.errors).padStart(6)} ${(errorRate * 100).toFixed(2).padStart(9)} ${percentile(result.durations, 0.5).toFixed(1).padStart(6)} ${percentile(result.durations, 0.95).toFixed(1).padStart(6)} ${percentile(result.durations, 0.99).toFixed(1).padStart(6)}`);
    if (errorRate > 0) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await stopServer();
  await rm(scratch, { recursive: true, force: true });
}

async function waitForServer() {
  const deadline = performance.now() + 120_000;
  while (performance.now() < deadline) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error(`Local server did not start at ${origin}`);
}

async function stopServer() {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5_000)]);
  if (child.exitCode == null) child.kill("SIGKILL");
}
