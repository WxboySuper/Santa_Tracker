/**
 * The tracker's notion of "now". Normally the wall clock; in the route demo a simulated clock that can run at any
 * speed, pause and seek. Components read `trackerNow()` and re-render on `subscribeTrackerClock` changes (seek,
 * pause, speed) as well as on their own interval.
 */
type Listener = () => void;

interface DemoState {
  /** Simulated epoch milliseconds at `baseWall`. */
  baseSim: number;
  /** `performance.now()` when the state was last set. */
  baseWall: number;
  rate: number;
  paused: boolean;
}

export interface DemoClockSettings {
  atMs: number;
  rate: number;
  paused: boolean;
}

let demo: DemoState | null = null;
const listeners = new Set<Listener>();

function simulatedMs(state: DemoState): number {
  return state.paused ? state.baseSim : state.baseSim + (performance.now() - state.baseWall) * state.rate;
}

export function trackerNow(): Date {
  return demo ? new Date(simulatedMs(demo)) : new Date();
}

export function isDemoClock(): boolean {
  return demo !== null;
}

/** Current demo settings, or null when the tracker is on the wall clock. */
export function demoClockSettings(): DemoClockSettings | null {
  return demo ? { atMs: simulatedMs(demo), rate: demo.rate, paused: demo.paused } : null;
}

/** Switch to a simulated clock (or back to the wall clock with null) and notify subscribers. */
export function setDemoClock(settings: DemoClockSettings | null): void {
  demo = settings ? { baseSim: settings.atMs, baseWall: performance.now(), rate: settings.rate, paused: settings.paused } : null;
  listeners.forEach(listener => listener());
}

export function subscribeTrackerClock(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How often clock-driven UI should refresh: once a second live, ten times a second in the demo. */
export function trackerTickMs(): number {
  return demo ? 100 : 1000;
}
