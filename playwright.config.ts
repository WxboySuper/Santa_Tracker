import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";

process.env.E2E_RUNTIME_FILE ??= path.join(os.tmpdir(), `santa-tracker-e2e-runtime-${process.pid}-${randomUUID()}.json`);

const baseUse = { ...devices["Desktop Chrome"], trace: "retain-on-failure" as const };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // Both projects share fixture stores, and admin-switch tests mutate their
  // feature flags. A single worker avoids cross-test state races and keeps
  // Next.js responsive on small CI runners.
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: baseUse,
  projects: [
    { name: "closed", testMatch: ["**/public-site.spec.ts", "**/closed-season.spec.ts", "**/village.spec.ts", "**/a11y.spec.ts"], use: { ...baseUse } },
    { name: "open", testMatch: ["**/public-site.spec.ts", "**/open-season.spec.ts", "**/advent-activities.spec.ts", "**/immersive-tracker.spec.ts", "**/village.spec.ts", "**/a11y.spec.ts"], use: { ...baseUse } },
  ],
});
