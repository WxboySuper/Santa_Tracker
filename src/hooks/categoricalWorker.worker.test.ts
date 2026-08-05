import { createDerivationController, type DerivationController } from './categoricalWorker';
import type { OutlookData } from '../types/outlooks';

const emptyOutlooks = (): OutlookData => ({
  tornado: new Map(),
  wind: new Map(),
  hail: new Map(),
  categorical: new Map(),
});

/** Builds a controller backed by a controllable fake worker. */
const createFakeWorkerController = (): { controller: DerivationController; worker: { postMessage: jest.Mock; onmessage: ((event: MessageEvent<{ requestId: number; ok: boolean; features?: GeoJSON.Feature[]; error?: string }>) => void) | null; onerror: ((event: ErrorEvent) => void) | null; terminate: jest.Mock } } => {
  const worker = {
    postMessage: jest.fn(),
    onmessage: null,
    onerror: null,
    terminate: jest.fn(),
  };
  const controller = createDerivationController(() => worker);
  return { controller, worker };
};

describe('createDerivationController worker path', () => {
  it('discards stale responses so an older request cannot overwrite a newer edit', async () => {
    const { controller, worker } = createFakeWorkerController();

    const first = controller.derive(1, 1, emptyOutlooks());
    const second = controller.derive(2, 1, emptyOutlooks());

    worker.onmessage?.({ data: { requestId: 1, ok: true, features: [{ id: 'stale' }] } } as MessageEvent);
    worker.onmessage?.({ data: { requestId: 2, ok: true, features: [{ id: 'fresh' }] } } as MessageEvent);

    const firstResult = await first;
    const secondResult = await second;
    expect(secondResult.ok).toBe(true);
    expect(secondResult.features?.[0].id).toBe('fresh');
    expect(firstResult.features?.[0].id).toBe('stale');
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('resolves a timed-out request with an error result', async () => {
    jest.useFakeTimers();
    const { controller } = createFakeWorkerController();

    const pending = controller.derive(3, 1, emptyOutlooks());
    const assertion = pending.then((result) => {
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timed out');
    });

    jest.advanceTimersByTime(16_000);
    await assertion;
    controller.dispose();
    jest.useRealTimers();
  });

  it('rejects pending requests when the worker errors', async () => {
    const { controller, worker } = createFakeWorkerController();

    const pending = controller.derive(4, 1, emptyOutlooks());
    worker.onerror?.({} as ErrorEvent);

    const result = await pending;
    expect(result.ok).toBe(false);
    controller.dispose();
  });

  it('resolves pending requests when disposed and terminates the worker', async () => {
    const { controller, worker } = createFakeWorkerController();

    const pending = controller.derive(5, 1, emptyOutlooks());
    controller.dispose();

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('uses the synchronous fallback when the worker factory throws', async () => {
    const controller = createDerivationController(() => {
      throw new Error('no worker');
    });
    const result = await controller.derive(6, 1, {
      ...emptyOutlooks(),
      tornado: new Map([['30%', [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, properties: {} }]]]),
    });
    expect(result.ok).toBe(true);
    controller.dispose();
  });
});
