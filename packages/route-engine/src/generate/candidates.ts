import { applyOverrides, type RouteOverrides } from './overrides';
import { allocateQuotas, compareStableIds } from './selection';
import { christmasOffset } from './timezone';
import type { Candidate, GeneratorConfig } from './types';

type HashInput = { value: string; seed: number };
function stableHash(input: HashInput): number {
  let hash = (2166136261 ^ input.seed) >>> 0;
  for (const character of input.value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
function categoryOf(place: Candidate): string {
  if (['hub', 'cultural', 'underserved', 'nature', 'special'].includes(place.category)) return place.category;
  return place.worldCity ? 'hub' : 'underserved';
}
type SelectionContext = { places: Candidate[]; config: GeneratorConfig; vetoed: Set<string> };
type CandidateSortContext = { candidates: Candidate[]; seed: number };
function stableCandidates(context: CandidateSortContext): Candidate[] {
  const { candidates, seed } = context;
  return [...candidates].sort((a, b) => {
    const difference = stableHash({ value: a.id, seed }) - stableHash({ value: b.id, seed });
    return difference === 0 ? compareStableIds(a.id, b.id) : difference;
  });
}
type WesternPriorityContext = { candidates: Candidate[]; seed: number; westernSlots: number };
function prioritizeWestern(context: WesternPriorityContext): Candidate[] {
  const { westernSlots } = context;
  const sorted = stableCandidates(context);
  const western = sorted.filter((place) => christmasOffset(place.timezone) <= -240);
  const preferredWestern = western.slice(0, westernSlots);
  const other = sorted.filter((place) => !preferredWestern.includes(place) && christmasOffset(place.timezone) > -240);
  return [...preferredWestern, ...other, ...western.slice(westernSlots)];
}
type CategorySelection = { context: SelectionContext; quota: { category: string; count: number } };
function selectCategory(input: CategorySelection): string[] {
  const { places, config, vetoed } = input.context;
  const { category, count } = input.quota;
  const eligible = places.filter((place) => place.category === category && !vetoed.has(place.id));
  const candidates = prioritizeWestern({ candidates: eligible, seed: config.seed, westernSlots: Math.ceil(count * 0.45) });
  const selected = candidates.slice(0, count).map((place) => place.id);
  if (selected.length < count) throw new Error(`Cannot fill ${category} quota ${count}: not enough candidates in pool`);
  return selected;
}
type RefillContext = { places: Candidate[]; selection: string[]; quotas: Record<string, number>; config: GeneratorConfig; overrides: RouteOverrides };
type CategoryCountContext = { selection: string[]; byId: Map<string, Candidate>; category: string };
function selectedCategoryCount(context: CategoryCountContext): number {
  return context.selection.filter((id) => context.byId.get(id)?.category === context.category).length;
}
function selectedWesternCount(context: CategoryCountContext): number {
  return context.selection.filter((id) => {
    const place = context.byId.get(id);
    if (!place) return false;
    if (place.category !== context.category) return false;
    return christmasOffset(place.timezone) <= -240;
  }).length;
}
type RefillCandidateContext = { places: Candidate[]; selection: string[]; category: string; vetoed: Set<string> };
function refillCandidates(context: RefillCandidateContext): Candidate[] {
  return context.places.filter((place) => {
    if (place.category !== context.category) return false;
    if (context.selection.includes(place.id)) return false;
    return !context.vetoed.has(place.id);
  });
}
type RefillOrderContext = { extras: Candidate[]; config: GeneratorConfig; westernNeed: number };
function westernRefillOrder(context: RefillOrderContext): Candidate[] {
  const { extras, config, westernNeed } = context;
  const sorted = stableCandidates({ candidates: extras, seed: config.seed });
  const western = sorted.filter((place) => christmasOffset(place.timezone) <= -240);
  const other = sorted.filter((place) => !western.includes(place));
  return [...western.slice(0, westernNeed), ...other, ...western.slice(westernNeed)];
}
type WesternRestoreContext = { result: string[]; places: Candidate[]; category: string; needed: number; locks: Set<string>; vetoed: Set<string> };
function unlockedEasternIndex(context: WesternRestoreContext, byId: Map<string, Candidate>): number {
  for (let index = context.result.length - 1; index >= 0; index--) {
    const id = context.result[index] ?? '';
    const place = byId.get(id);
    if (context.locks.has(id)) continue;
    if (place?.category !== context.category) continue;
    if (christmasOffset(place.timezone) <= -240) continue;
    return index;
  }
  return -1;
}
function restoreWesternSlots(context: WesternRestoreContext, byId: Map<string, Candidate>, config: GeneratorConfig): void {
  const extras = refillCandidates({ places: context.places, selection: context.result, category: context.category, vetoed: context.vetoed });
  const western = westernRefillOrder({ extras, config, westernNeed: context.needed })
    .filter((place) => christmasOffset(place.timezone) <= -240);
  for (const place of western.slice(0, context.needed)) {
    const index = unlockedEasternIndex(context, byId);
    if (index < 0) break;
    context.result[index] = place.id;
  }
}
function refillSelection(context: RefillContext): string[] {
  const { places, selection, quotas, config, overrides } = context;
  const byId = new Map(places.map((place) => [place.id, place]));
  const vetoed = new Set(overrides.veto ?? []);
  const result = [...selection];
  for (const [category, quota] of Object.entries(quotas)) {
    const countContext = { selection: result, byId, category };
    const current = selectedCategoryCount(countContext);
    if (current > quota) throw new Error(`Overrides exceed ${category} quota ${quota}`);
    const currentWestern = selectedWesternCount(countContext);
    const westernNeed = Math.max(0, Math.ceil(quota * 0.45) - currentWestern);
    restoreWesternSlots({ result, places, category, needed: westernNeed, locks: new Set(overrides.lock ?? []), vetoed }, byId, config);
    const extras = refillCandidates({ places, selection: result, category, vetoed });
    const preferred = westernRefillOrder({ extras, config, westernNeed });
    result.push(...preferred.slice(0, Math.max(0, quota - current)).map((place) => place.id));
  }
  return result;
}
export function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides): Candidate[] {
  const places = pool.map((place) => ({ ...place, category: categoryOf(place) }));
  const quotas = allocateQuotas(config.total, config.weights);
  const vetoed = new Set(overrides.veto ?? []);
  const context = { places, config, vetoed };
  const selected = Object.entries(quotas).flatMap(([category, count]) => selectCategory({ context, quota: { category, count } }));
  const adjusted = applyOverrides(places, selected, overrides);
  const refilled = refillSelection({ places, selection: adjusted, quotas, config, overrides });
  const byId = new Map(places.map((place) => [place.id, place]));
  const chosen = refilled.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
  if (chosen.length !== config.total) throw new Error(`Unable to select ${config.total} candidates while preserving category quotas`);
  return chosen;
}
