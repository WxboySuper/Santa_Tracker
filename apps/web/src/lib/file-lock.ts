import fs from "node:fs/promises";
import path from "node:path";
import { getSantaRoutePath } from "./config";

// In-process queue prevents interleaving within a single Node instance.
// File-system lock file prevents interleaving across workers / scaled instances.
let memQueue: Promise<void> = Promise.resolve();

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

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = memQueue;
  let releaseMem!: () => void;
  memQueue = new Promise<void>((resolve) => {
    releaseMem = resolve;
  });
  await previous;

  const lock = getLockFile();
  let releaseFs: (() => Promise<void>) | null = null;
  try {
    releaseFs = await acquireFsLock(lock).catch(() => null);
  } catch {
    releaseFs = null;
  }

  try {
    return await fn();
  } finally {
    if (releaseFs) await releaseFs();
    releaseMem();
  }
}
