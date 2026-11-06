export type RouteOverrides = {
  lock?: string[];
  veto?: string[];
  swap?: Record<string, string>;
};

function validateIds(known: Set<string>, ids: string[]): void {
  for (const id of ids) {
    if (!known.has(id)) throw new Error(`Unknown stop: ${id}`);
  }
}

type SwapRules = { veto: Set<string>; locks: Set<string>; categories: Map<string, string | undefined> };

function checkSwapTarget(selected: string[], to: string, veto: Set<string>): void {
  if (veto.has(to)) throw new Error(`Swap target is vetoed: ${to}`);
  if (selected.includes(to)) throw new Error(`Swap target is already selected: ${to}`);
}

function applySwap(selected: string[], from: string, to: string, rules: SwapRules): void {
  const index = selected.indexOf(from);
  if (index < 0) throw new Error(`Swap source is not selected: ${from}`);
  if (rules.locks.has(from)) throw new Error(`Cannot swap a locked stop: ${from}`);
  checkSwapTarget(selected, to, rules.veto);
  if (rules.categories.get(from) !== rules.categories.get(to)) {
    throw new Error(`Swap must preserve category: ${from} -> ${to}`);
  }
  selected[index] = to;
}
function lastUnlockedIndex(selection: string[], locks: Set<string>, category: string | undefined, categories: Map<string, string | undefined>): number {
  for (let index = selection.length - 1; index >= 0; index--) {
    const id = selection[index] ?? '';
    if (!locks.has(id) && categories.get(id) === category) return index;
  }
  return -1;
}

/** Apply owner directives to a selection. The caller is responsible for refilling it. */
export function applyOverrides(pool: readonly { id: string; category?: string }[], selection: readonly string[], overrides: RouteOverrides): string[] {
  const known = new Set(pool.map((place) => place.id));
  const categories = new Map(pool.map((place) => [place.id, place.category]));
  const locks = new Set(overrides.lock ?? []);
  const veto = new Set(overrides.veto ?? []);
  const swaps = Object.entries(overrides.swap ?? {});
  validateIds(known, [...selection, ...locks, ...veto, ...swaps.flat()]);
  for (const id of locks) {
    if (veto.has(id)) throw new Error(`Stop is both locked and vetoed: ${id}`);
  }
  if (locks.size > selection.length) throw new Error('Locked stops exceed the selection size');
  if (new Set(selection).size !== selection.length) throw new Error('Duplicate selected stop');
  const selected = [...selection];
  for (const [from, to] of swaps) applySwap(selected, from, to, { veto, locks, categories });
  const result = selected.filter((id) => !veto.has(id));
  for (const id of locks) {
    if (result.includes(id)) continue;
    if (result.length < selection.length) {
      result.push(id);
      continue;
    }
    const replaceAt = lastUnlockedIndex(result, locks, categories.get(id), categories);
    if (replaceAt < 0) throw new Error(`Cannot fit locked stop ${id} into selection`);
    result[replaceAt] = id;
  }
  return result;
}
