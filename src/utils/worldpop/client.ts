import type { MultiPolygon, Polygon } from 'geojson';

export const WORLDPOP_API_BASE_URL = 'https://api.worldpop.org/v2';
export const WORLDPOP_DEFAULT_YEAR = 2025;
export const WORLDPOP_DEFAULT_RESOLUTION = '100m' as const;

export type WorldPopResolution = '100m' | '1km';
export type WorldPopGeometry = Polygon | MultiPolygon;

export interface WorldPopEstimate {
  totalPopulation: number;
  areaKm2?: number;
  dataYear: number;
  resolution: WorldPopResolution;
  dataSource?: string;
}

interface WorldPopSubmitResponse {
  task_id?: string;
  taskId?: string;
  error?: string;
  error_message?: string;
}

interface WorldPopTaskResponse {
  status?: string;
  error?: string | null;
  result?: {
    total_population?: number;
    area_km2?: number;
    data_year?: number;
    data_source?: string;
  };
}

export interface WorldPopEstimateOptions {
  year?: number;
  resolution?: WorldPopResolution;
  signal?: AbortSignal;
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (milliseconds: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timeout = globalThis.setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    globalThis.clearTimeout(timeout);
    reject(signal.reason ?? new DOMException('The WorldPop request was cancelled.', 'AbortError'));
  }, { once: true });
});

const readJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json() as WorldPopSubmitResponse | WorldPopTaskResponse;
      detail = payload.error ?? ('error_message' in payload ? payload.error_message : '') ?? '';
    } catch {
      // Keep the HTTP status useful when an upstream proxy returns non-JSON text.
    }
    throw new Error(`WorldPop request failed with HTTP ${response.status}.${detail ? ` ${detail}` : ''}`);
  }
  return await response.json() as T;
};

/** Submits a GeoJSON geometry to WorldPop and waits for its asynchronous result. */
export const estimatePopulation = async (
  geometry: WorldPopGeometry,
  options: WorldPopEstimateOptions = {},
): Promise<WorldPopEstimate> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? WORLDPOP_API_BASE_URL;
  const year = options.year ?? WORLDPOP_DEFAULT_YEAR;
  const resolution = options.resolution ?? WORLDPOP_DEFAULT_RESOLUTION;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(new DOMException('WorldPop request timed out.', 'TimeoutError')), timeoutMs);

  try {
    const submitResponse = await fetchImpl(`${apiBaseUrl}/population`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: geometry, year, resolution }),
      signal: controller.signal,
    });
    const submitted = await readJson<WorldPopSubmitResponse>(submitResponse);
    const taskId = submitted.task_id ?? submitted.taskId;
    if (!taskId) {
      throw new Error(submitted.error ?? submitted.error_message ?? 'WorldPop did not return a task ID.');
    }

    while (true) {
      const taskResponse = await fetchImpl(`${apiBaseUrl}/tasks/${encodeURIComponent(taskId)}`, {
        signal: controller.signal,
      });
      const task = await readJson<WorldPopTaskResponse>(taskResponse);
      const status = task.status?.toLowerCase();

      if (status === 'success' || status === 'completed' || status === 'complete') {
        const totalPopulation = task.result?.total_population;
        if (typeof totalPopulation !== 'number' || !Number.isFinite(totalPopulation)) {
          throw new Error('WorldPop returned an invalid population total.');
        }
        return {
          totalPopulation,
          areaKm2: task.result?.area_km2,
          dataYear: task.result?.data_year ?? year,
          resolution,
          dataSource: task.result?.data_source,
        };
      }

      if (status === 'failure' || status === 'failed' || task.error) {
        throw new Error(task.error ?? 'WorldPop could not calculate this population estimate.');
      }

      await sleep(pollIntervalMs, controller.signal);
    }
  } catch (caught) {
    if (options.signal?.aborted) {
      throw new Error('The WorldPop request was cancelled.');
    }
    if (controller.signal.aborted) {
      throw new Error('WorldPop took too long to calculate this estimate. Please try again.');
    }
    throw caught;
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
};
