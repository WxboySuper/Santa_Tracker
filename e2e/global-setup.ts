import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { FullConfig } from "@playwright/test";

const ports = { closed: 43171, open: 43172 };
const password = "e2e-admin-password";
const secret = "e2e-secret-key-that-is-at-least-32-characters";

async function reserveAvailablePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close((error) => error ? reject(error) : resolve()));
  });
}

async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* Next.js is still starting. */ }
    await delay(250);
  }
  throw new Error(`Next.js did not become ready at ${url}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

export default async function globalSetup(_config: FullConfig) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "santa-tracker-e2e-"));
  const servers: ChildProcess[] = [];
  try {
    const source = path.join(process.cwd(), "apps", "web", "data");
    const route = await readFile(path.join(source, "santa_route.json"), "utf8");
    const calendar = JSON.parse(await readFile(path.join(source, "advent_calendar.json"), "utf8")) as {
      days: { day: number; is_unlocked_override?: boolean }[];
    };
    const firstDay = calendar.days.find((day) => day.day === 1);
    if (!firstDay) throw new Error("The advent calendar must include day 1");
    firstDay.is_unlocked_override = true;
    await writeFile(path.join(temporaryRoot, "santa_route.json"), route);
    await writeFile(path.join(temporaryRoot, "advent_calendar.json"), JSON.stringify(calendar, null, 2));

    const appRoot = path.join(process.cwd(), "apps", "web");
    const nextCli = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
    for (const [name, port] of Object.entries(ports)) {
      await reserveAvailablePort(port);
      const child = spawn(process.execPath, [nextCli, "dev", "--port", String(port)], {
        cwd: appRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          ADVENT_ENABLED: "true",
          ADMIN_PASSWORD: password,
          SECRET_KEY: secret,
          SANTA_DATA_ROOT: temporaryRoot,
          NEXT_DIST_DIR: `.next-e2e-${name}`,
          ...(name === "open" ? { SEASON_OVERRIDE: "open" } : { SEASON_OVERRIDE: "" }),
        },
      });
      servers.push(child);
      await waitForServer(`http://localhost:${port}/`, child);
    }
  } catch (error) {
    await Promise.all(servers.map(stopServer));
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }

  return async () => {
    await Promise.all(servers.map(stopServer));
    await rm(temporaryRoot, { recursive: true, force: true });
  };
}

export { password };
