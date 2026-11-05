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
    { name: "closed", testMatch: "**/*.spec.ts", grep: /home works|closed season gates|accessible Advent calendar/, use: baseUse },
    { name: "open", testMatch: "**/*.spec.ts", grep: /home works|Advent exposes/, use: baseUse },
  ],
});
