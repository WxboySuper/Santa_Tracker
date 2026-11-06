import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

process.env.E2E_RUNTIME_FILE ??= path.join(os.tmpdir(), `santa-tracker-e2e-runtime-${process.pid}.json`);

const baseUse = { ...devices["Desktop Chrome"], trace: "retain-on-failure" as const };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: baseUse,
  projects: [
    { name: "closed", testMatch: ["**/public-site.spec.ts", "**/closed-season.spec.ts"], use: baseUse },
    { name: "open", testMatch: ["**/public-site.spec.ts", "**/open-season.spec.ts"], use: baseUse },
  ],
});
