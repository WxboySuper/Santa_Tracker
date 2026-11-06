import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ServerName } from "./types";
export type ServerEntry = { name: ServerName; child: ChildProcess };
type StartupResult = { name: ServerName; endpoint: string };
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

function stripAnsiColorCodes(output: string): string {
  const escape = String.fromCharCode(27);
  const colorCode = new RegExp(`${escape}\\[[0-9;]*m`, "g");
  return output.replace(colorCode, "");
}

export function getLocalAddress(output: string): string | undefined {
  const cleanOutput = stripAnsiColorCodes(output);
  const match = /^\s*(?:[-+]\s*)?Local:\s*(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[[\da-f:]+\]):(\d+)/im.exec(cleanOutput);
  if (!match) return undefined;
  const unspecifiedHosts = ["0.0.0.0", "[::]", "[0:0:0:0:0:0:0:0]"];
  const rawHostname = match[2] ?? "localhost";
  const hostname = unspecifiedHosts.includes(rawHostname.toLowerCase()) ? "localhost" : rawHostname;
  return `${match[1]}${hostname}:${match[3]}`;
}

async function findReadyEndpoint(endpoint: string | undefined): Promise<string | undefined> {
  if (!endpoint) return undefined;
  if (!await isServerReady(endpoint)) return undefined;
  return endpoint;
}

function getStartupError(entry: ServerEntry, spawnError: Error | undefined): Error | undefined {
  if (spawnError) return new Error(`Next.js failed to spawn: ${spawnError.message}`);
  if (entry.child.exitCode !== null) return new Error(`Next.js exited early with code ${entry.child.exitCode}`);
  if (entry.child.signalCode !== null) return new Error(`Next.js exited early with signal ${entry.child.signalCode}`);
  return undefined;
}

function captureStartupState(entry: ServerEntry) {
  let output = "";
  let endpoint: string | undefined;
  let truncated = false;
  let spawnError: Error | undefined;
  const capture = (chunk: Buffer) => {
    output += chunk.toString();
    endpoint = getLocalAddress(output) ?? endpoint;
    if (output.length <= maxStartupOutput) return;
    output = output.slice(-maxStartupOutput);
    truncated = true;
  };
  const onError = (error: Error) => { spawnError = error; };
  const onStdout = (chunk: Buffer) => capture(chunk);
  const onStderr = (chunk: Buffer) => {
    capture(chunk);
    process.stderr.write(chunk);
  };
  entry.child.on("error", onError);
  entry.child.stdout?.on("data", onStdout);
  entry.child.stderr?.on("data", onStderr);
  return {
    output: () => truncated ? `...[earlier output truncated]...\n${output}` : output,
    endpoint: () => endpoint,
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
      const readyEndpoint = await findReadyEndpoint(state.endpoint());
      if (readyEndpoint) return { name: entry.name, endpoint: readyEndpoint };
      await delay(250);
    }
    const startupError = getStartupError(entry, state.error());
    if (startupError) throw startupError;
    throw new Error(`Next.js did not become ready. Output: ${state.output()}`);
  } finally {
    state.dispose();
  }
}

function getStartupFailure(results: PromiseSettledResult<StartupResult>[]): Error | undefined {
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status !== "rejected") return undefined;
  return failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
}

export async function waitForServers(entries: ServerEntry[]): Promise<Record<ServerName, string>> {
  const results = await Promise.allSettled(entries.map(waitForServer));
  const failure = getStartupFailure(results);
  if (failure) throw failure;
  return Object.fromEntries(results.flatMap((result) => result.status === "fulfilled"
    ? [[result.value.name, result.value.endpoint]]
    : [])) as Record<ServerName, string>;
}

export function startServers(appRoot: string, dataRoots: Record<ServerName, string>, password: string, secret: string): ServerEntry[] {
  const appRequire = createRequire(path.join(appRoot, "package.json"));
  const nextCli = appRequire.resolve("next/dist/bin/next");
  return (["closed", "open"] as const).map((name) => ({
    name,
    child: spawn(process.execPath, [nextCli, "dev", "--port", "0"], {
      cwd: appRoot,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ADVENT_ENABLED: "true",
        ADMIN_PASSWORD: password,
        SECRET_KEY: secret,
        SANTA_DATA_ROOT: dataRoots[name],
        NEXT_DIST_DIR: `.next-e2e-${name}`,
        ...(name === "open" ? { SEASON_OVERRIDE: "open" } : { SEASON_OVERRIDE: "" }),
      },
    }),
  }));
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
  } catch {
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
