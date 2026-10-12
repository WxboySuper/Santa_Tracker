#!/usr/bin/env node
/**
 * Publish the checked-in route and Advent snapshots to the production R2 bucket.
 *
 * Usage:
 *   pnpm santa:publish:remote       # initialize missing active snapshots through Wrangler
 *   pnpm exec node tools/santa-publish.mjs --remote --activate # replace active snapshots from checked-in data
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const dataDir = path.join(repoRoot, "apps", "web", "data");

const DATASETS = [
  { file: "santa_route.json", dataset: "santa-route" },
  { file: "advent_calendar.json", dataset: "advent-calendar" },
];

function makeVersionId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function runWrangler(args, options = {}) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, args, {
    cwd: path.join(repoRoot, "apps", "web"),
    encoding: "utf-8",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function uploadToR2({ bucket, dataset, versionId, body, activate }) {
  const versionKey = `${dataset}/versions/${versionId}.json`;
  const activeKey = `${dataset}/active.json`;
  const pointer = JSON.stringify({ versionId, updatedAt: new Date().toISOString() }, null, 2);
  const put = (key, filePath) => {
    const result = runWrangler(["exec", "wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", filePath, "--remote", "--force"], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`wrangler r2 put failed for ${key}`);
  };
  const tmpDir = path.join(repoRoot, ".tmp-publish");
  return fs.mkdir(tmpDir, { recursive: true }).then(async () => {
    const versionPath = path.join(tmpDir, `${dataset}-${versionId}.json`);
    const activePath = path.join(tmpDir, `${dataset}-active.json`);
    if (!activate) {
      const existing = runWrangler(["exec", "wrangler", "r2", "object", "get", `${bucket}/${activeKey}`, "--file", activePath, "--remote"]);
      if (existing.status === 0) {
        await fs.rm(activePath, { force: true });
        return false;
      }
      const details = `${existing.stdout ?? ""}\n${existing.stderr ?? ""}`;
      if (!/NoSuchKey|not found|does not exist|404|no object/i.test(details)) {
        throw new Error(`Could not check active R2 pointer for ${dataset}: ${details.trim()}`);
      }
    }
    await fs.writeFile(versionPath, body, "utf-8");
    put(versionKey, versionPath);
    await fs.writeFile(activePath, pointer, "utf-8");
    put(activeKey, activePath);
    return true;
  });
}

async function main() {
  const remote = process.argv.includes("--remote");
  const activate = process.argv.includes("--activate");
  const bucket = process.env.SANTA_R2_BUCKET ?? "santa-tracker-snapshots";

  for (const { file, dataset } of DATASETS) {
    const sourcePath = path.join(dataDir, file);
    const body = await fs.readFile(sourcePath, "utf-8");
    if (remote) {
      const versionId = makeVersionId();
      const activated = await uploadToR2({ bucket, dataset, versionId, body, activate });
      const message = activated
        ? `Activated ${dataset} version ${versionId} in R2 bucket ${bucket}`
        : `Kept existing ${dataset} active pointer in R2 bucket ${bucket}`;
      process.stdout.write(`${message}\n`);
    } else {
      process.stdout.write(`Validated ${file}; local runtime reads the checked-in data file directly\n`);
    }
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
