import { readFile } from "node:fs/promises";
import { expect, test as base } from "@playwright/test";

type RuntimeConfig = { endpoints: Record<string, string>; adminPassword: string };

const runtimeConfigByFile = new Map<string, Promise<RuntimeConfig>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readRuntimeConfig(runtimeFile: string): Promise<RuntimeConfig> {
  const source = await readFile(runtimeFile, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse runtime config at ${runtimeFile}: ${reason}`, { cause: error });
  }
  if (!isRecord(value) || !isRecord(value.endpoints) || typeof value.adminPassword !== "string") {
    throw new Error(`Runtime config at ${runtimeFile} must contain endpoints and adminPassword`);
  }
  return { endpoints: value.endpoints as Record<string, string>, adminPassword: value.adminPassword };
}

export async function getRuntimeConfig(runtimeFile: string): Promise<RuntimeConfig> {
  let configPromise = runtimeConfigByFile.get(runtimeFile);
  if (!configPromise) {
    configPromise = readRuntimeConfig(runtimeFile);
    runtimeConfigByFile.set(runtimeFile, configPromise);
  }
  return configPromise;
}

export async function getEndpointForProject(runtimeFile: string, projectName: string): Promise<string> {
  const { endpoints } = await getRuntimeConfig(runtimeFile);
  const endpoint = endpoints[projectName];
  if (typeof endpoint !== "string") {
    throw new Error(`No endpoint configured for project ${projectName} in ${runtimeFile}`);
  }
  return endpoint;
}

const test = base.extend({
  // Playwright requires a destructured fixture object; this fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use, testInfo) => {
    const runtimeFile = process.env.E2E_RUNTIME_FILE;
    if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
    const endpoint = await getEndpointForProject(runtimeFile, testInfo.project.name);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's fixture callback is not a React hook.
    await use(endpoint);
  },
});

export { expect, test };
