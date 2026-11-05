import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

type ServerName = "closed" | "open";
export type ServerEntry = { name: ServerName; child: ChildProcess };
type StartupResult = { name: ServerName; endpoint: string };

function childHasExited(child: ChildProcess): boolean {
  if (child.exitCode !== null) return true;
  return child.signalCode !== null;
}

function getLocalAddress(output: string): string | undefined {
  return /Local:\s+(https?:\/\/\S+)/i.exec(output)?.[1];
}

async function isServerReady(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(entry: ServerEntry): Promise<StartupResult> {
  const deadline = Date.now() + 120_000;
  let output = "";
  entry.child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  entry.child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  while (Date.now() < deadline) {
    if (childHasExited(entry.child)) {
      throw new Error(`Next.js exited early with code ${entry.child.exitCode} signal ${entry.child.signalCode}`);
    }
    const endpoint = getLocalAddress(output);
    if (!endpoint) {
      await delay(250);
      continue;
    }
    if (await isServerReady(endpoint)) return { name: entry.name, endpoint };
    await delay(250);
  }
  throw new Error(`Next.js did not become ready. Output: ${output}`);
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
  return Object.fromEntries(results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return [result.value.name, result.value.endpoint];
  })) as Record<ServerName, string>;
}

export function startServers(appRoot: string, dataRoots: Record<ServerName, string>, password: string, secret: string): ServerEntry[] {
  const nextCli = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
  return (["closed", "open"] as const).map((name) => ({
    name,
    child: spawn(process.execPath, [nextCli, "dev", "--port", "0"], {
      cwd: appRoot,
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

async function stopServer(child: ChildProcess): Promise<void> {
  if (childHasExited(child)) return;
  if (child.pid === undefined) return;
  if (process.platform === "win32") await killWindowsTree(child);
  else child.kill("SIGTERM");
  if (await waitForExit(child, 10_000)) return;
  if (process.platform === "win32") {
    await killWindowsTree(child);
    child.kill();
  } else {
    child.kill("SIGKILL");
  }
  if (await waitForExit(child, 5_000)) return;
  throw new Error(`Next.js process ${child.pid} did not exit after termination`);
}

export async function stopServers(entries: ServerEntry[]): Promise<void> {
  await Promise.all(entries.map(({ child }) => stopServer(child)));
}
