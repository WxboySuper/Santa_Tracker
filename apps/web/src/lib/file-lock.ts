// Serializes admin read-modify-write sequences for JSON stores to prevent
// lost-update races when concurrent mutations overlap.
// Node's atomicWrite (tmp + rename) prevents torn writes but does not
// prevent interleaved load→mutate→save sequences from overwriting each other.
// This per-process queue ensures the full sequence runs atomically.
let writeQueue: Promise<void> = Promise.resolve();

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
