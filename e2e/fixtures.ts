import { readFile } from "node:fs/promises";
import { expect, test as base } from "@playwright/test";

const test = base.extend({
  baseURL: async ({ browser: _browser }, use, testInfo) => {
    const runtimeFile = process.env.E2E_RUNTIME_FILE;
    if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
    const endpoints = JSON.parse(await readFile(runtimeFile, "utf8")) as Record<string, string>;
    const endpoint = endpoints[testInfo.project.name];
    if (!endpoint) throw new Error(`No endpoint configured for project ${testInfo.project.name}`);
    // Playwright names this fixture callback parameter `use`.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(endpoint);
  },
});

export { expect, test };
