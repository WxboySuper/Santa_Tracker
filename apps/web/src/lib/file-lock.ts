import fs from "node:fs/promises";
import path from "node:path";
import { getSantaRoutePath } from "./config";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import type { R2BucketLike } from "./storage/r2-backend";

// The local queue serializes writes per instance. Node/VPS uses a file lock;
// Workers use an R2 conditional-write lock because their filesystem is read-only.
let memQueue: Promise<void> = Promise.resolve();
const R2_LOCK_KEY = "admin-write-lock.json";
const R2_LOCK_LEASE_MS = 30_000;

interface LockFile {
  readonly path: string;
}

function getLockFile(): LockFile {
  try {
    return { path: path.join(path.dirname(getSantaRoutePath()), ".admin-write.lock") };
  } catch {
    return { path: path.join(process.cwd(), ".admin-write.lock") };
  }
}

async function ensureLockDir(lock: LockFile): Promise<void> {
  const dir = path.dirname(lock.path);
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
}

async function tryCreate(lock: LockFile): Promise<boolean> {
  try {
    const handle = await fs.open(lock.path, "wx");
    await handle.close();
    return true;
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    throw error;
  }
}

async function isStale(lock: LockFile, timeoutMs: number): Promise<boolean> {
  try {
    const stat = await fs.stat(lock.path);
    return Date.now() - stat.mtimeMs > timeoutMs;
  } catch {
    return false;
  }
}

async function removeLock(lock: LockFile): Promise<void> {
  await fs.unlink(lock.path).catch(() => undefined);
}

function hasTimedOut(startMs: number, timeoutMs: number): boolean {
  return Date.now() - startMs > timeoutMs;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type R2LockObject = Awaited<ReturnType<R2BucketLike["get"]>>;
type R2LockWriteOptions = { onlyIf: Headers | { etagMatches?: string } };

async function getR2LockWriteOptions(current: R2LockObject, now: number): Promise<R2LockWriteOptions | null> {
  if (!current) return { onlyIf: new Headers({ "If-None-Match": "*" }) };

  let expiresAt = Number.POSITIVE_INFINITY;
  try {
    const lockData: unknown = JSON.parse(await current.text());
    if (typeof lockData === "object" && lockData !== null && "expiresAt" in lockData) {
      const expiry = lockData.expiresAt;
      expiresAt = typeof expiry === "number" ? expiry : Number.POSITIVE_INFINITY;
    }
  } catch {
    if (current.uploaded) expiresAt = current.uploaded.getTime() + R2_LOCK_LEASE_MS;
  }

  if (expiresAt > now || !current.etag) return null;
  return { onlyIf: { etagMatches: current.etag } };
}

function makeR2LockRelease(bucket: R2BucketLike, etag: string): () => Promise<void> {
  return async () => {
    await bucket.put(
      R2_LOCK_KEY,
      JSON.stringify({ owner: "released", expiresAt: 0 }),
      { onlyIf: { etagMatches: etag } },
    ).catch(error => console.error("Unable to release R2 admin write lock", error));
  };
}

async function tryAcquireR2Lock(
  bucket: R2BucketLike,
  owner: string,
  options: R2LockWriteOptions,
): Promise<(() => Promise<void>) | null> {
  const result = await bucket.put(
    R2_LOCK_KEY,
    JSON.stringify({ owner, expiresAt: Date.now() + R2_LOCK_LEASE_MS }),
    options,
  );
  const etag = (result as { etag?: string } | null)?.etag;
  return etag ? makeR2LockRelease(bucket, etag) : null;
}

function makeRelease(lock: LockFile): () => Promise<void> {
  return async () => {
    try {
      await fs.unlink(lock.path);
    } catch {
      // ignore missing lock file
    }
  };
}

async function acquireFsLock(lock: LockFile, timeoutMs = 5000): Promise<() => Promise<void>> {
  await ensureLockDir(lock);
  const start = Date.now();
  while (true) {
    if (await tryCreate(lock)) return makeRelease(lock);
    if (await isStale(lock, timeoutMs)) {
      await removeLock(lock);
      continue;
    }
    if (hasTimedOut(start, timeoutMs)) {
      throw new Error(`Timed out acquiring file lock ${lock.path}`);
    }
    await delay(50);
  }
}

async function acquireR2Lock(timeoutMs = 5000): Promise<() => Promise<void>> {
  const bucket = getSantaSnapshotsBucket();
  if (!bucket) throw new Error("SANTA_SNAPSHOTS binding is required when SANTA_STORAGE_BACKEND=r2");
  const owner = Math.random().toString(36).slice(2);
  const start = Date.now();

  for (;;) {
    const now = Date.now();
    const current = await bucket.get(R2_LOCK_KEY);
    const writeOptions = await getR2LockWriteOptions(current, now);
    if (writeOptions) {
      const release = await tryAcquireR2Lock(bucket, owner, writeOptions);
      if (release) return release;
    }
    if (now - start > timeoutMs) throw new Error("Timed out acquiring R2 admin write lock");
    await delay(50);
  }
}

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = memQueue;
  let releaseMem!: () => void;
  memQueue = new Promise<void>((resolve) => {
    releaseMem = resolve;
  });
  await previous;

  let releaseLock: (() => Promise<void>) | null = null;
  try {
    if (process.env.SANTA_STORAGE_BACKEND === "r2") {
      releaseLock = await acquireR2Lock();
    } else {
      releaseLock = await acquireFsLock(getLockFile()).catch(() => null);
    }
    return await fn();
  } finally {
    if (releaseLock) await releaseLock();
    releaseMem();
  }
}
