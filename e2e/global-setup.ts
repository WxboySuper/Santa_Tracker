import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { FullConfig } from "@playwright/test";

const password = "e2e-admin-password";
const secret = "e2e-secret-key-that-is-at-least-32-characters";

async function waitForServer(child: ChildProcess): Promise<string> {
  const deadline = Date.now() + 120_000;
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode} signal ${child.signalCode}`);
    }
    const addressMatch = /Local:\s+(https?:\/\/\S+)/i.exec(output);
    const localAddress = addressMatch?.[1];
    if (localAddress) {
      try {
        const response = await fetch(localAddress);
        if (response.ok) return localAddress;
      } catch { /* Next.js is still starting. */ }
    }
    await delay(250);
  }
  throw new Error(`Next.js did not become ready. Output: ${output}`);
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (exited: boolean) => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish(true);
  });
}

async function killWindowsTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  await new Promise<void>((resolve) => {
    killer.once("exit", () => resolve());
    killer.once("error", () => resolve());
  });
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    await killWindowsTree(child);
    child.kill();
  } else {
    child.kill("SIGTERM");
  }
  if (await waitForExit(child, 10_000)) return;
  if (process.platform === "win32") {
    await killWindowsTree(child);
    child.kill();
  }
  else child.kill("SIGKILL");
  if (!await waitForExit(child, 5_000)) throw new Error(`Next.js process ${child.pid} did not exit after termination`);
}

export default async function globalSetup(_config: FullConfig) {
  process.env.E2E_ADMIN_PASSWORD = password;
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "santa-tracker-e2e-"));
  const servers: ChildProcess[] = [];
  const endpoints: Record<string, string> = {};
  try {
    const source = path.join(process.cwd(), "apps", "web", "data");
    const route = await readFile(path.join(source, "santa_route.json"), "utf8");
    const originalCalendar = JSON.parse(await readFile(path.join(source, "advent_calendar.json"), "utf8")) as {
      days: { day: number; is_unlocked_override?: boolean }[];
    };

    const appRoot = path.join(process.cwd(), "apps", "web");
    const nextCli = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
    const serverNames = ["closed", "open"];
    await Promise.all(serverNames.map(async (name) => {
      const dataRoot = path.join(temporaryRoot, name);
      await mkdir(dataRoot);
      await writeFile(path.join(dataRoot, "santa_route.json"), route);
      const calendar = JSON.parse(JSON.stringify(originalCalendar)) as typeof originalCalendar;
      if (name === "open") {
        const firstDay = calendar.days.find((day) => day.day === 1);
        if (!firstDay) throw new Error("The advent calendar must include day 1");
        firstDay.is_unlocked_override = true;
      }
      await writeFile(path.join(dataRoot, "advent_calendar.json"), JSON.stringify(calendar, null, 2));
    }));

    const startups = serverNames.map((name) => {
      const dataRoot = path.join(temporaryRoot, name);
      const child = spawn(process.execPath, [nextCli, "dev", "--port", "0"], {
        cwd: appRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ADVENT_ENABLED: "true",
          ADMIN_PASSWORD: password,
          SECRET_KEY: secret,
          SANTA_DATA_ROOT: dataRoot,
          NEXT_DIST_DIR: `.next-e2e-${name}`,
          ...(name === "open" ? { SEASON_OVERRIDE: "open" } : { SEASON_OVERRIDE: "" }),
        },
      });
      servers.push(child);
      return waitForServer(child).then((endpoint) => { endpoints[name] = endpoint; });
    });
    const startupResults = await Promise.allSettled(startups);
    const failedStartup = startupResults.find((result) => result.status === "rejected");
    if (failedStartup?.status === "rejected") throw failedStartup.reason;
    const runtimeFile = process.env.E2E_RUNTIME_FILE;
    if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE must be set by playwright.config.ts");
    await writeFile(runtimeFile, JSON.stringify(endpoints));
  } catch (error) {
    await Promise.all(servers.map(stopServer));
    await rm(temporaryRoot, { recursive: true, force: true });
    if (process.env.E2E_RUNTIME_FILE) await rm(process.env.E2E_RUNTIME_FILE, { force: true });
    throw error;
  }

  return async () => {
    await Promise.all(servers.map(stopServer));
    await rm(temporaryRoot, { recursive: true, force: true });
    if (process.env.E2E_RUNTIME_FILE) await rm(process.env.E2E_RUNTIME_FILE, { force: true });
  };
}

export { password };
