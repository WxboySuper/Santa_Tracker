import { haversineKm, type LatLng } from '../geo';

export function compareStableIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateWeights(total: number, entries: [string, number][]): number {
  if (!Number.isSafeInteger(total)) throw new Error('Invalid stop total');
  if (total <= 0) throw new Error('Invalid stop total');
  if (entries.some(([, weight]) => !Number.isFinite(weight))) throw new Error('Invalid weight');
  if (entries.some(([, weight]) => weight < 0)) throw new Error('Invalid weight');
  const sum = entries.reduce((value, [, weight]) => value + weight, 0);
  if (!Number.isFinite(sum)) throw new Error('Weights must have a positive total');
  if (sum <= 0) throw new Error('Weights must have a positive total');
  return sum;
}

type Allocation = { key: string; count: number; remainder: number; index: number };

function distributeRemainders(allocations: Allocation[], total: number): void {
  const remaining = total - allocations.reduce((value, entry) => value + entry.count, 0);
  const ranked = [...allocations].sort((a, b) => {
    const difference = b.remainder - a.remainder;
    return difference === 0 ? a.index - b.index : difference;
  });
  for (let index = 0; index < remaining; index++) {
    const entry = ranked[index];
    if (entry) entry.count++;
  }
}

/** Apportion an integer total without losing stops to rounding. */
export function allocateQuotas(total: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights);
  const sum = validateWeights(total, entries);
  const allocations = entries.map(([key, weight], index) => {
    const exact = (weight / sum) * total;
    const count = Math.floor(exact);
    return { key, count, remainder: exact - count, index };
  });
  distributeRemainders(allocations, total);
  return Object.fromEntries(allocations.map(({ key, count }) => [key, count]));
}

/** Visit each point once, beginning with the point nearest to start. */
export function nearestNeighbour<T extends LatLng & { id: string }>(places: readonly T[], start: LatLng): T[] {
  const remaining = [...places];
  const ordered: T[] = [];
  let current = start;
  while (remaining.length > 0) {
    remaining.sort((a, b) => {
      const difference = haversineKm(current, a) - haversineKm(current, b);
      if (difference !== 0) return difference;
      return compareStableIds(a.id, b.id);
    });
    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    current = next;
  }
  return ordered;
}
