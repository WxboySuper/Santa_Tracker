#!/usr/bin/env node
/**
 * Publish repo JSON snapshots to R2 (production) and mirror to apps/web/public/data (static assets).
 *
 * Usage:
 *   pnpm santa:publish              # local mirror only
 *   pnpm santa:publish --remote     # wrangler R2 upload + local mirror
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const dataDir = path.join(repoRoot, "apps", "web", "data");
const publicDataDir = path.join(repoRoot, "apps", "web", "public", "data");

const DATASETS = [
  { file: "santa_route.json", dataset: "santa-route" },
  { file: "advent_calendar.json", dataset: "advent-calendar" },
];

function makeVersionId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

async function mirrorPublic(file, body) {
  await fs.mkdir(publicDataDir, { recursive: true });
  const target = path.join(publicDataDir, file);
  const tmp = `${target}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf-8");
  await fs.rename(tmp, target);
}

function uploadToR2({ bucket, dataset, versionId, body }) {
  const versionKey = `${dataset}/versions/${versionId}.json`;
  const activeKey = `${dataset}/active.json`;
  const pointer = JSON.stringify({ versionId, updatedAt: new Date().toISOString() }, null, 2);
  const put = (key, filePath) => {
    const result = spawnSync(
      "pnpm",
      ["exec", "wrangler", "r2", "object", "put", key, "--file", filePath, "--bucket", bucket, "--remote"],
      { cwd: path.join(repoRoot, "apps", "web"), stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error(`wrangler r2 put failed for ${key}`);
  };
  const tmpDir = path.join(repoRoot, ".tmp-publish");
  return fs.mkdir(tmpDir, { recursive: true }).then(async () => {
    const versionPath = path.join(tmpDir, `${dataset}-${versionId}.json`);
    const activePath = path.join(tmpDir, `${dataset}-active.json`);
    await fs.writeFile(versionPath, body, "utf-8");
    await fs.writeFile(activePath, pointer, "utf-8");
    put(versionKey, versionPath);
    put(activeKey, activePath);
  });
}

async function main() {
  const remote = process.argv.includes("--remote");
  const bucket = process.env.SANTA_R2_BUCKET ?? "santa-tracker-snapshots";

  for (const { file, dataset } of DATASETS) {
    const sourcePath = path.join(dataDir, file);
    const body = await fs.readFile(sourcePath, "utf-8");
    await mirrorPublic(file, body);
    if (remote) {
      const versionId = makeVersionId();
      await uploadToR2({ bucket, dataset, versionId, body });
      console.log(`Uploaded ${dataset} version ${versionId} to R2 bucket ${bucket}`);
    }
    console.log(`Mirrored ${file} -> apps/web/public/data/${file}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
