import type { R2BucketLike } from "./storage/r2-backend";

type SantaWorkerEnv = {
  SANTA_SNAPSHOTS?: R2BucketLike;
};

export function getSantaSnapshotsBucket(): R2BucketLike | null {
  if (process.env.SANTA_STORAGE_BACKEND !== "r2") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require("cloudflare:workers") as { env: SantaWorkerEnv };
    return env.SANTA_SNAPSHOTS ?? null;
  } catch {
    return null;
  }
}
