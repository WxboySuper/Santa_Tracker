#!/usr/bin/env node
/**
 * Publish the checked-in route and Advent snapshots to the production R2 bucket.
 *
 * Usage:
 *   pnpm santa:publish:remote       # initialize missing active snapshots through Wrangler
 *   pnpm exec node tools/santa-publish.mjs --remote --activate --only advent-calendar # replace one dataset
 *   pnpm exec node tools/santa-publish.mjs --remote --activate --all # replace every dataset, on purpose
 *
 * --activate must name its scope (--only <dataset> or --all); unknown options and stray arguments are errors.
 *
 * The previous active version stays in R2 under <dataset>/versions/, so a replace can be rolled back
 * by pointing <dataset>/active.json back at the old versionId.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

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

/**
 * Whether the dataset already has an active pointer in R2. Any failure other than "no such object"
 * throws, so an outage can never be mistaken for "nothing is live yet".
 */
async function hasActivePointer({ bucket, dataset, activeKey, activePath }) {
  const existing = runWrangler(["exec", "wrangler", "r2", "object", "get", `${bucket}/${activeKey}`, "--file", activePath, "--remote"]);
  if (existing.status === 0) {
    await fs.rm(activePath, { force: true });
    return true;
  }
  const details = `${existing.stdout ?? ""}
${existing.stderr ?? ""}`;
  if (!/NoSuchKey|not found|does not exist|404|no object/i.test(details)) {
    throw new Error(`Could not check active R2 pointer for ${dataset}: ${details.trim()}`);
  }
  return false;
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
    // Without --activate an existing live pointer is kept as-is.
    if (!activate && (await hasActivePointer({ bucket, dataset, activeKey, activePath }))) return false;
    await fs.writeFile(versionPath, body, "utf-8");
    put(versionKey, versionPath);
    await fs.writeFile(activePath, pointer, "utf-8");
    put(activeKey, activePath);
    return true;
  });
}

const CLI_OPTIONS = {
  remote: { type: "boolean" },
  activate: { type: "boolean" },
  all: { type: "boolean" },
  only: { type: "string", multiple: true },
};

/** `--only` must name exactly one known dataset (an empty or repeated value is an error). */
function readOnly(values) {
  if (values === undefined) return null;
  if (values.length !== 1) throw new Error("--only must be given exactly once");
  const [only] = values;
  if (!DATASETS.some((entry) => entry.dataset === only)) {
    throw new Error(`--only must be one of: ${DATASETS.map((entry) => entry.dataset).join(", ")}`);
  }
  return only;
}

/** Replacing live data always names its scope: one dataset, or everything on purpose. */
function assertScope({ activate, all, only }) {
  if (only !== null && all) throw new Error("--only and --all cannot be combined");
  if (activate && only === null && !all) throw new Error("--activate needs an explicit scope: --only <dataset> or --all");
}

/**
 * Read the command line and environment into one validated options object. Parsing is strict:
 * unknown options, typos, wrong-case or single-dash spellings and stray positional arguments
 * (e.g. `--activate advent-calendar`) are errors. An ignored scope would silently become "all
 * datasets" and, with --activate, a mass overwrite of live data.
 */
function parseOptions(argv, env) {
  const { values } = parseArgs({ args: argv.slice(2), options: CLI_OPTIONS, strict: true, allowPositionals: false });
  const only = readOnly(values.only);
  assertScope({ activate: values.activate, all: values.all, only });
  return { remote: Boolean(values.remote), activate: Boolean(values.activate), only, bucket: env.SANTA_R2_BUCKET ?? "santa-tracker-snapshots" };
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
