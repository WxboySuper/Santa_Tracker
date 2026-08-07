import type { OutlookData } from '../types/outlooks';
import { processDay12OutlooksToCategorical, processDay3OutlooksToCategorical } from './autoCategoricalProcessing';
import type { AutoCategoricalWorkerResponse } from './autoCategorical.worker';
import AutoCategoricalWorker from './autoCategorical.worker?worker';

export interface DerivationResult {
  ok: boolean;
  features?: GeoJSON.Feature[];
  error?: string;
}

export interface DerivationController {
  /** Requests derivation for a payload, returning a promise resolved when the latest request settles. */
  derive: (requestId: number, day: number, outlooks: OutlookData) => Promise<DerivationResult>;
  /** Tears down the worker and rejects pending requests. */
  dispose: () => void;
}

/** Maximum time a single derivation may run before it is considered failed. */
const DERIVATION_TIMEOUT_MS = 15_000;

/** Minimal worker surface the controller depends on (injectable for tests). */
interface WorkerLike {
  onmessage: ((this: Worker, event: MessageEvent<AutoCategoricalWorkerResponse>) => void) | null;
  onerror: ((this: Worker, event: ErrorEvent) => void) | null;
  postMessage: (message: unknown) => void;
  terminate: () => void;
}

type WorkerFactory = () => WorkerLike;

/**
 * Runs categorical derivation behind a cancellable Web Worker when the runtime
 * supports it, falling back to the synchronous derivation on the UI thread in
 * test/SSR environments. The returned controller tracks the newest request id
 * so stale worker responses can never overwrite newer edits.
 */
export const createDerivationController = (workerFactory: WorkerFactory = () => new AutoCategoricalWorker()): DerivationController => {
  let worker: WorkerLike | null = null;
  try {
    worker = workerFactory();
  } catch {
    worker = null;
  }

  if (!worker) {
    return {
      derive: async (requestId, day, outlooks) => {
        try {
          const features = day === 3
            ? processDay3OutlooksToCategorical(outlooks)
            : processDay12OutlooksToCategorical(outlooks);
          return { ok: true, features };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      dispose: () => undefined,
    };
  }
  const pending = new Map<number, { resolve: (r: DerivationResult) => void }>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  worker.onmessage = (event: MessageEvent<AutoCategoricalWorkerResponse>) => {
    const { requestId, ok, features, error } = event.data;
    const timer = timers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(requestId);
    }
    const entry = pending.get(requestId);
    if (entry) {
      pending.delete(requestId);
      entry.resolve({ ok, features, error });
    }
  };

  worker.onerror = () => {
    // Fail all pending requests so the caller preserves the last known-good result.
    pending.forEach(({ resolve }) => resolve({ ok: false, error: 'Auto-categorical worker failed.' }));
    pending.clear();
  };

  return {
    derive: (requestId, day, outlooks) =>
      new Promise<DerivationResult>((resolve) => {
        pending.set(requestId, { resolve });
        const timer = setTimeout(() => {
          pending.delete(requestId);
          timers.delete(requestId);
          resolve({ ok: false, error: 'Auto-categorical derivation timed out.' });
        }, DERIVATION_TIMEOUT_MS);
        timers.set(requestId, timer);
        worker.postMessage({ requestId, day, outlooks });
      }),
    dispose: () => {
      pending.forEach(({ resolve }) => resolve({ ok: false, error: 'Auto-categorical worker disposed.' }));
      pending.clear();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      worker.terminate();
    },
  };
};
