/** The few Navigator fields we read to spot a device that should skip decorative effects. */
export type CapabilitySignals = {
  saveData?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  effectiveType?: string;
};

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

const SLOW_CONNECTIONS = new Set(['slow-2g', '2g', '3g']);
const LOW_MEMORY_GB = 2;
const LOW_CORES = 2;

/** True when any signal says the device or connection is constrained. Unknown signals never count against a device. */
export function isLowPerformance(signals: CapabilitySignals): boolean {
  if (signals.saveData === true) return true;
  if (signals.effectiveType !== undefined && SLOW_CONNECTIONS.has(signals.effectiveType)) return true;
  if (signals.deviceMemory !== undefined && signals.deviceMemory <= LOW_MEMORY_GB) return true;
  return signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= LOW_CORES;
}

/** Reads the signals from the browser. Safe on the server and in browsers that expose none of them. */
export function readCapabilitySignals(nav: Navigator | undefined): CapabilitySignals {
  if (!nav) return {};
  const hinted = nav as NavigatorWithHints;
  return {
    saveData: hinted.connection?.saveData,
    effectiveType: hinted.connection?.effectiveType,
    deviceMemory: hinted.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}

/** Convenience for components and libraries that just want the answer for the current browser. */
export function prefersLowPerformance(): boolean {
  return isLowPerformance(readCapabilitySignals(typeof navigator === 'undefined' ? undefined : navigator));
}
