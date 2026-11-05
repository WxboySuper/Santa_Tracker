#!/usr/bin/env node
/**
 * Publish the checked-in route and Advent snapshots to the production R2 bucket.
 *
 * Usage:
 *   pnpm santa:publish:remote       # initialize missing active snapshots through Wrangler
 *   pnpm exec node tools/santa-publish.mjs --remote --activate # replace active snapshots from checked-in data
 *   pnpm exec node tools/santa-publish.mjs --remote --activate --only advent-calendar # replace just one dataset
 *
 * The previous active version stays in R2 under <dataset>/versions/, so a replace can be rolled back
 * by pointing <dataset>/active.json back at the old versionId.
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

const KNOWN_FLAGS = new Set(["--remote", "--activate", "--only"]);

/**
 * The value of `--only`, accepting both `--only <dataset>` and `--only=<dataset>`. An unrecognised
 * spelling must never fall through to "all datasets": combined with --activate that would silently
 * replace every live dataset when one was intended.
 */
function readOnly(args) {
  const inline = args.find((arg) => arg.startsWith("--only="));
  if (inline !== undefined) return inline.slice("--only=".length);
  const index = args.indexOf("--only");
  return index === -1 ? null : (args[index + 1] ?? "");
}

/** Read the command line and environment into one validated options object. */
function parseOptions(argv, env) {
  const args = argv.slice(2);
  const unknown = args.filter((arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg.split("=")[0]));
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  const only = readOnly(args);
  if (only !== null && !DATASETS.some((entry) => entry.dataset === only)) {
    throw new Error(`--only must be one of: ${DATASETS.map((entry) => entry.dataset).join(", ")}`);
  }
  return {
    remote: args.includes("--remote"),
    activate: args.includes("--activate"),
    only,
    bucket: env.SANTA_R2_BUCKET ?? "santa-tracker-snapshots",
  };
}

/** Validate one dataset locally, or upload it to R2 (activating only when asked). */
async function publishDataset({ file, dataset }, { remote, activate, bucket }) {
  const body = await fs.readFile(path.join(dataDir, file), "utf-8");
  if (!remote) {
    process.stdout.write(`Validated ${file}; local runtime reads the checked-in data file directly
`);
    return;
  }
  const versionId = makeVersionId();
  const activated = await uploadToR2({ bucket, dataset, versionId, body, activate });
  const message = activated
    ? `Activated ${dataset} version ${versionId} in R2 bucket ${bucket}`
    : `Kept existing ${dataset} active pointer in R2 bucket ${bucket}`;
  process.stdout.write(`${message}
`);
}

async function main() {
  const options = parseOptions(process.argv, process.env);
  for (const entry of DATASETS) {
    if (options.only !== null && entry.dataset !== options.only) continue;
    await publishDataset(entry, options);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
