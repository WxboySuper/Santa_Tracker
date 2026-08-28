import { estimatePopulation } from './client';

const TEST_GEOMETRY = {
  type: 'Polygon' as const,
  coordinates: [[[-100, 35], [-99, 35], [-99, 36], [-100, 36], [-100, 35]]],
};

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
} as Response);

describe('estimatePopulation', () => {
  test('submits GeoJSON and polls until WorldPop returns a result', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ task_id: 'task/1' }, 202))
      .mockResolvedValueOnce(response({ status: 'running' }))
      .mockResolvedValueOnce(response({
        status: 'success',
        result: { total_population: 1234.5, area_km2: 99, data_year: 2025, data_source: 'WorldPop' },
      }));

    await expect(estimatePopulation(TEST_GEOMETRY, {
      apiBaseUrl: 'https://example.test/v2',
      pollIntervalMs: 0,
      fetchImpl,
    })).resolves.toEqual({
      totalPopulation: 1234.5,
      areaKm2: 99,
      dataYear: 2025,
      resolution: '100m',
      dataSource: 'WorldPop',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.test/v2/population', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"year":2025'),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'https://example.test/v2/tasks/task%2F1', expect.anything());
  });

  test('reports task failures', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ task_id: 'failed-task' }, 202))
      .mockResolvedValueOnce(response({ status: 'failed', error: 'Area is too large.' }));

    await expect(estimatePopulation(TEST_GEOMETRY, { pollIntervalMs: 0, fetchImpl }))
      .rejects.toThrow('Area is too large.');
  });

  test('reports an HTTP error even when the upstream body is not JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);

    await expect(estimatePopulation(TEST_GEOMETRY, { fetchImpl })).rejects.toThrow(
      'WorldPop request failed with HTTP 503.',
    );
  });

  test('reports a missing task ID', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ error_message: 'Invalid geometry.' }, 202));

    await expect(estimatePopulation(TEST_GEOMETRY, { fetchImpl })).rejects.toThrow('Invalid geometry.');
  });

  test('rejects an invalid population total', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ task_id: 'invalid-total' }, 202))
      .mockResolvedValueOnce(response({ status: 'complete', result: { total_population: Number.NaN } }));

    await expect(estimatePopulation(TEST_GEOMETRY, { pollIntervalMs: 0, fetchImpl }))
      .rejects.toThrow('invalid population total');
  });

  test('reports when polling times out', async () => {
    const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));

    await expect(estimatePopulation(TEST_GEOMETRY, { timeoutMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow('took too long');
  });

  test('supports caller cancellation', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      controller.abort();
    }));

    await expect(estimatePopulation(TEST_GEOMETRY, { signal: controller.signal, fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow('cancelled');
  });
});
