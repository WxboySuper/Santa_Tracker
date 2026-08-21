import type { OutlookData } from '../types/outlooks';
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
 * supports it, falling back to a lazy-loaded synchronous derivation only in
 * test/SSR environments. Keeping this import dynamic prevents Turf from being
 * pulled into the main UI chunk. The returned controller tracks the newest request id
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
          const { processDay12OutlooksToCategorical, processDay3OutlooksToCategorical } =
            await import('./autoCategoricalProcessing');
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

  const replaceWorker = (failure: string): void => {
    const failedWorker = worker;
    worker = null;
    failedWorker?.terminate();

    pending.forEach(({ resolve }) => resolve({ ok: false, error: failure }));
    pending.clear();
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();

    try {
      const replacement = workerFactory();
      worker = replacement;
      attachWorkerHandlers(replacement);
    } catch {
      worker = null;
    }
  };

  const attachWorkerHandlers = (nextWorker: WorkerLike): void => {
    nextWorker.onmessage = (event: MessageEvent<AutoCategoricalWorkerResponse>) => {
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

    nextWorker.onerror = () => {
      // Ignore late errors from a worker that timed out and was already replaced.
      if (worker !== nextWorker) {
        return;
      }
      replaceWorker('Auto-categorical worker failed.');
    };
  };

  attachWorkerHandlers(worker);

  return {
    derive: (requestId, day, outlooks) =>
      new Promise<DerivationResult>((resolve) => {
        const activeWorker = worker;
        if (!activeWorker) {
          resolve({ ok: false, error: 'Auto-categorical worker unavailable.' });
          return;
        }
        pending.set(requestId, { resolve });
        const timer = setTimeout(() => {
          pending.delete(requestId);
          timers.delete(requestId);
          // A Web Worker cannot be interrupted from the outside. Terminate it
          // on timeout so an expensive derivation cannot block every later
          // request, then create a clean worker for the next edit.
          if (worker === activeWorker) {
            replaceWorker('Auto-categorical worker reset after timeout.');
          }
          resolve({ ok: false, error: 'Auto-categorical derivation timed out.' });
        }, DERIVATION_TIMEOUT_MS);
        timers.set(requestId, timer);
        activeWorker.postMessage({ requestId, day, outlooks });
      }),
    dispose: () => {
      pending.forEach(({ resolve }) => resolve({ ok: false, error: 'Auto-categorical worker disposed.' }));
      pending.clear();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      const disposedWorker = worker;
      worker = null;
      disposedWorker?.terminate();
    },
  };
};
