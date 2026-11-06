import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";
import { prepareFixtureData } from "./fixture-data";
import { startServers, stopServers, waitForServers, type ServerEntry } from "./server-processes";

const password = "e2e-admin-password";
const secret = "e2e-secret-key-that-is-at-least-32-characters";

async function cleanup(servers: ServerEntry[], temporaryRoot: string, runtimeFile: string): Promise<void> {
  try {
    await stopServers(servers);
  } finally {
    await Promise.all([
      rm(temporaryRoot, { recursive: true, force: true }),
      rm(runtimeFile, { force: true }),
    ]);
  }
}

export default async function globalSetup(_config: FullConfig) {
  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE must be set by playwright.config.ts");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "santa-tracker-e2e-"));
  const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
  let servers: ServerEntry[] = [];
  try {
    const dataRoots = await prepareFixtureData(path.join(appRoot, "data"), temporaryRoot);
    servers = startServers(appRoot, dataRoots, password, secret);
    const endpoints = await waitForServers(servers);
    await rm(runtimeFile, { force: true });
    await writeFile(runtimeFile, JSON.stringify({ endpoints, adminPassword: password }), { mode: 0o600 });
    await chmod(runtimeFile, 0o600);
  } catch (error) {
    await cleanup(servers, temporaryRoot, runtimeFile);
    throw error;
  }
  return () => cleanup(servers, temporaryRoot, runtimeFile);
}

export { password };
