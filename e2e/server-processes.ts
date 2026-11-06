import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ServerName } from "./types";
import { isServerEndpointMap } from "./validation";
export type ServerEntry = { name: ServerName; endpoint: string; child: ChildProcess };
export type StartupResult = { name: ServerName; endpoint: string };
const maxStartupOutput = 4_000;

function childHasExited(child: ChildProcess): boolean {
  if (child.exitCode !== null) return true;
  return child.signalCode !== null;
}

async function isServerReady(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function closePortReservation(server: net.Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function findFreePorts(): Promise<[number, number]> {
  const reservations: net.Server[] = [];
  const ports: number[] = [];
  try {
    while (ports.length < 2) {
      const server = net.createServer();
      reservations.push(server);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Could not allocate a local port");
      ports.push(address.port);
    }
  } finally {
    await Promise.all(reservations.map(closePortReservation));
  }
  return ports as [number, number];
}

function serverEnvironment(name: ServerName, dataRoot: string, password: string, secret: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ADVENT_ENABLED: "true",
    ADMIN_PASSWORD: password,
    SECRET_KEY: secret,
    SANTA_DATA_ROOT: dataRoot,
    NEXT_DIST_DIR: `.next-e2e-${name}`,
    ...(name === "open" ? { SEASON_OVERRIDE: "open" } : { SEASON_OVERRIDE: "" }),
  };
}

function spawnNextServer(name: ServerName, appRoot: string, dataRoot: string, port: number, password: string, secret: string): ServerEntry {
  const appRequire = createRequire(path.join(appRoot, "package.json"));
  const nextCli = appRequire.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appRoot,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnvironment(name, dataRoot, password, secret),
  });
  return { name, endpoint: `http://127.0.0.1:${port}`, child };
}

async function stopPartialServers(entries: ServerEntry[], startupError: unknown): Promise<never> {
  await stopServers(entries).catch((cleanupError: unknown) => {
    throw new AggregateError([startupError, cleanupError], "Server startup and partial cleanup both failed", { cause: cleanupError });
  });
  throw startupError;
}

function getStartupError(entry: ServerEntry, spawnError: Error | undefined): Error | undefined {
  if (spawnError) return new Error(`Next.js failed to spawn: ${spawnError.message}`);
  if (entry.child.exitCode !== null) return new Error(`Next.js exited early with code ${entry.child.exitCode}`);
  if (entry.child.signalCode !== null) return new Error(`Next.js exited early with signal ${entry.child.signalCode}`);
  return undefined;
}

function captureStartupState(entry: ServerEntry) {
  let output = "";
  let truncated = false;
  let spawnError: Error | undefined;
  const capture = (chunk: Buffer) => {
    output += chunk.toString();
    if (output.length <= maxStartupOutput) return;
    output = output.slice(-maxStartupOutput);
    truncated = true;
  };
  const onError = (error: Error) => { spawnError = error; };
  const onStdout = (chunk: Buffer) => capture(chunk);
  const onStderr = (chunk: Buffer) => {
    capture(chunk);
    process.stderr.write(`[${entry.name}] ${chunk.toString()}`);
  };
  entry.child.on("error", onError);
  entry.child.stdout?.on("data", onStdout);
  entry.child.stderr?.on("data", onStderr);
  return {
    output: () => truncated ? `...[earlier output truncated]...\n${output}` : output,
    error: () => spawnError,
    dispose: () => {
      entry.child.removeListener("error", onError);
      entry.child.stdout?.removeListener("data", onStdout);
      entry.child.stderr?.removeListener("data", onStderr);
    },
  };
}

async function waitForServer(entry: ServerEntry): Promise<StartupResult> {
  const deadline = Date.now() + 120_000;
  const state = captureStartupState(entry);
  try {
    while (Date.now() < deadline) {
      const startupError = getStartupError(entry, state.error());
      if (startupError) throw startupError;
      if (await isServerReady(entry.endpoint)) return { name: entry.name, endpoint: entry.endpoint };
      await delay(250);
    }
    const startupError = getStartupError(entry, state.error());
    if (startupError) throw startupError;
    throw new Error(`Next.js did not become ready. Output: ${state.output()}`);
  } finally {
    state.dispose();
  }
}

function normalizeFailure(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(String(reason));
}

export function getStartupFailure(results: PromiseSettledResult<StartupResult>[]): Error | undefined {
  const failures = results.flatMap((result) => {
    if (result.status !== "rejected") return [];
    return [normalizeFailure(result.reason)];
  });
  if (failures.length === 0) return undefined;
  if (failures.length === 1) return failures[0];
  return new AggregateError(failures, "Failed to start Next.js servers");
}

export async function waitForServers(entries: ServerEntry[]): Promise<Record<ServerName, string>> {
  const results = await Promise.allSettled(entries.map(waitForServer));
  const failure = getStartupFailure(results);
  if (failure) throw failure;
  const endpoints = Object.fromEntries(results.flatMap((result) => result.status === "fulfilled"
    ? [[result.value.name, result.value.endpoint]]
    : []));
  if (!isServerEndpointMap(endpoints)) throw new Error("Both closed and open server endpoints must be available");
  return endpoints;
}

export async function startServers(appRoot: string, dataRoots: Record<ServerName, string>, password: string, secret: string): Promise<ServerEntry[]> {
  const entries: ServerEntry[] = [];
  const [closedPort, openPort] = await findFreePorts();
  try {
    entries.push(spawnNextServer("closed", appRoot, dataRoots.closed, closedPort, password, secret));
    entries.push(spawnNextServer("open", appRoot, dataRoots.open, openPort, password, secret));
  } catch (error) {
    await stopPartialServers(entries, error);
  }
  return entries;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const finish = (exited: boolean) => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      child.removeListener("error", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
    child.once("error", onExit);
    if (childHasExited(child)) finish(true);
  });
}

async function killWindowsTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  if (await waitForExit(killer, 5_000)) return;
  killer.kill();
  await waitForExit(killer, 1_000);
}

function signalUnixProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    process.stderr.write(`Failed to signal process group ${child.pid}: ${String(error)}\n`);
    child.kill(signal);
  }
}

async function signalServer(child: ChildProcess, signal: NodeJS.Signals): Promise<void> {
  if (process.platform === "win32") {
    await killWindowsTree(child);
    child.kill();
    return;
  }
  signalUnixProcessGroup(child, signal);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (childHasExited(child)) return;
  if (child.pid === undefined) return;
  await signalServer(child, "SIGTERM");
  if (await waitForExit(child, 10_000)) return;
  await signalServer(child, "SIGKILL");
  if (await waitForExit(child, 5_000)) return;
  throw new Error(`Next.js process ${child.pid} did not exit after termination`);
}

export async function stopServers(entries: ServerEntry[]): Promise<void> {
  const results = await Promise.allSettled(entries.map(({ child }) => stopServer(child)));
  const failures = results.flatMap((result) => {
    if (result.status !== "rejected") return [];
    if (result.reason instanceof Error) return [result.reason];
    return [new Error(String(result.reason))];
  });
  if (failures.length > 0) throw new AggregateError(failures, "Failed to stop Next.js servers");
}
