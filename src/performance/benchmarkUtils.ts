import { performance } from 'node:perf_hooks';

export interface BenchmarkOptions {
  iterations: number;
  samples?: number;
  warmup?: number;
}

export interface BenchmarkResult {
  medianMs: number;
  samplesMs: number[];
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export const measure = (
  operation: () => void,
  { iterations, samples = 5, warmup = 2 }: BenchmarkOptions,
): BenchmarkResult => {
  for (let index = 0; index < warmup; index += 1) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      operation();
    }
  }

  const samplesMs = Array.from({ length: samples }, () => {
    const start = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      operation();
    }
    return performance.now() - start;
  });

  return { medianMs: median(samplesMs), samplesMs };
};

export const reportComparison = (
  label: string,
  baseline: BenchmarkResult,
  optimized: BenchmarkResult,
): void => {
  const improvement = ((baseline.medianMs - optimized.medianMs) / baseline.medianMs) * 100;
  const speedup = baseline.medianMs / optimized.medianMs;
  const direction = improvement >= 0
    ? `${improvement.toFixed(1)}% faster`
    : `${Math.abs(improvement).toFixed(1)}% slower`;
  console.log(
    `${label}: baseline ${baseline.medianMs.toFixed(2)} ms, `
      + `optimized ${optimized.medianMs.toFixed(2)} ms, `
      + `${direction} (${speedup.toFixed(2)}x baseline)`,
  );
};
