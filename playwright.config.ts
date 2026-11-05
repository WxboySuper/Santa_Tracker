import { defineConfig, devices } from "@playwright/test";

const baseUse = { ...devices["Desktop Chrome"], trace: "retain-on-failure" as const };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: baseUse,
  projects: [
    { name: "closed", testMatch: "**/*.spec.ts", use: { ...baseUse, baseURL: "http://localhost:43171" } },
    { name: "open", testMatch: "**/*.spec.ts", use: { ...baseUse, baseURL: "http://localhost:43172" } },
  ],
});
