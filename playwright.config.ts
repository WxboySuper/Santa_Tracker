import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";

process.env.E2E_RUNTIME_FILE ??= path.join(os.tmpdir(), `santa-tracker-e2e-runtime-${process.pid}-${randomUUID()}.json`);

if (process.env.E2E_CAPTURE_MATRIX === "1" && process.env.E2E_MATRIX !== "1") {
  throw new Error("E2E_CAPTURE_MATRIX requires E2E_MATRIX=1");
}

const baseUse = { ...devices["Desktop Chrome"], trace: "retain-on-failure" as const };
const openTestMatch = ["**/public-site.spec.ts", "**/open-season.spec.ts", "**/advent-activities.spec.ts", "**/backup-restore.spec.ts", "**/immersive-tracker.spec.ts", "**/map-outage.spec.ts", "**/village.spec.ts", "**/a11y.spec.ts"];
const closedTestMatch = ["**/public-site.spec.ts", "**/closed-season.spec.ts", "**/village.spec.ts", "**/a11y.spec.ts"];
const matrixTestMatch = process.env.E2E_CAPTURE_MATRIX === "1"
  ? [...openTestMatch, "**/matrix-screenshots.spec.ts"]
  : openTestMatch;

const matrixProfiles = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"], browserName: "firefox" as const } },
  { name: "webkit", use: { ...devices["Desktop Safari"], browserName: "webkit" as const } },
  { name: "iphone-13", use: { ...devices["iPhone 13"], browserName: "webkit" as const } },
  { name: "pixel-5", use: { ...devices["Pixel 5"], browserName: "chromium" as const } },
  { name: "ipad-gen-7", use: { ...devices["iPad (gen 7)"], browserName: "webkit" as const } },
  { name: "desktop-4k", use: { ...devices["Desktop Chrome"], viewport: { width: 3840, height: 2160 } } },
  { name: "phone-landscape-740x360", use: { ...devices["Pixel 5"], viewport: { width: 740, height: 360 }, deviceScaleFactor: 1 } },
];

const matrixProjects = process.env.E2E_MATRIX === "1"
  ? matrixProfiles.flatMap(({ name, use }) => [
    {
      name: `matrix-closed-${name}`,
      testMatch: closedTestMatch,
      metadata: { fixtureProject: "closed" },
      use: { ...baseUse, ...use },
    },
    {
      name: `matrix-open-${name}`,
      testMatch: matrixTestMatch,
      metadata: { fixtureProject: "open" },
      use: { ...baseUse, ...use },
    },
  ])
  : [];

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: true,
  // Both projects share fixture stores, and admin-switch tests mutate their
  // feature flags. A single worker avoids cross-test state races and keeps
  // Next.js responsive on small CI runners.
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: baseUse,
  projects: process.env.E2E_MATRIX === "1"
    ? matrixProjects
    : [
      { name: "closed", testMatch: closedTestMatch, use: { ...baseUse } },
      { name: "open", testMatch: openTestMatch, use: { ...baseUse } },
    ],
});
