import { processDay12OutlooksToCategorical, processDay3OutlooksToCategorical } from './autoCategoricalProcessing';
import type { OutlookData } from '../types/outlooks';

export interface AutoCategoricalWorkerRequest {
  /** Monotonic request/version id so stale responses can be discarded. */
  requestId: number;
  day: number;
  outlooks: OutlookData;
}

export interface AutoCategoricalWorkerResponse {
  requestId: number;
  ok: boolean;
  features?: GeoJSON.Feature[];
  error?: string;
}

/**
 * Web worker that performs auto-categorical geometry derivation off the UI
 * thread. Turf union/intersect/difference work can be expensive for complex or
 * adversarial geometry; running it here keeps the editor responsive.
 *
 * The worker is intentionally stateless: each message carries a complete
 * payload and a request id, and the caller discards responses whose id no
 * longer matches the newest request.
 */
self.onmessage = (event: MessageEvent<AutoCategoricalWorkerRequest>) => {
  const { requestId, day, outlooks } = event.data;

  try {
    const features = day === 3
      ? processDay3OutlooksToCategorical(outlooks)
      : processDay12OutlooksToCategorical(outlooks);
    const response: AutoCategoricalWorkerResponse = { requestId, ok: true, features };
    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: AutoCategoricalWorkerResponse = {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
