export interface TimerClock {
  set(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clear(handle: ReturnType<typeof setTimeout>): void;
}

export function styleDeadline(delay: number, clock: TimerClock = {
  set: (callback, timeout) => setTimeout(callback, timeout),
  clear: handle => clearTimeout(handle),
}) {
  let rejectDeadline!: (error: Error) => void;
  const promise = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const handle = clock.set(() => rejectDeadline(new Error("Map style timed out")), delay);
  return {
    promise,
    cancel() { clock.clear(handle); rejectDeadline(new Error("Map style cancelled")); },
    clear() { clock.clear(handle); },
  };
}
