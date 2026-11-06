import { applyOverrides, type RouteOverrides } from './overrides';
import { allocateQuotas } from './selection';
import { christmasOffset } from './timezone';
import type { Candidate, GeneratorConfig } from './types';

function stableHash(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
function categoryOf(place: Candidate): string {
  if (['hub', 'cultural', 'underserved', 'nature', 'special'].includes(place.category)) return place.category;
  return place.worldCity ? 'hub' : 'underserved';
}
type SelectionContext = { places: Candidate[]; config: GeneratorConfig; vetoed: Set<string> };
function stableCandidates(candidates: Candidate[], seed: number): Candidate[] {
  return [...candidates].sort((a, b) => stableHash(a.id, seed) - stableHash(b.id, seed) || a.id.localeCompare(b.id));
}
function prioritizeWestern(candidates: Candidate[], seed: number, westernSlots: number): Candidate[] {
  const sorted = stableCandidates(candidates, seed);
  const western = sorted.filter((place) => christmasOffset(place.timezone) <= -240);
  const preferredWestern = western.slice(0, westernSlots);
  const other = sorted.filter((place) => !preferredWestern.includes(place) && christmasOffset(place.timezone) > -240);
  return [...preferredWestern, ...other, ...western.slice(westernSlots)];
}
function selectCategory(context: SelectionContext, category: string, quota: number): string[] {
  const { places, config, vetoed } = context;
  const candidates = prioritizeWestern(places.filter((place) => place.category === category && !vetoed.has(place.id)), config.seed, Math.floor(quota * 0.45));
  const selected = candidates.slice(0, quota).map((place) => place.id);
  if (selected.length < quota) throw new Error(`Cannot fill ${category} quota ${quota}: not enough candidates in pool`);
  return selected;
}
type RefillContext = { places: Candidate[]; selection: string[]; quotas: Record<string, number>; config: GeneratorConfig; overrides: RouteOverrides };
function refillSelection(context: RefillContext): string[] {
  const { places, selection, quotas, config, overrides } = context;
  const byId = new Map(places.map((place) => [place.id, place]));
  const result = [...selection];
  for (const [category, quota] of Object.entries(quotas)) {
    const current = result.filter((id) => byId.get(id)?.category === category).length;
    if (current > quota) throw new Error(`Overrides exceed ${category} quota ${quota}`);
    const currentWestern = result.filter((id) => {
      const place = byId.get(id);
      return place?.category === category && christmasOffset(place.timezone) <= -240;
    }).length;
    const westernNeed = Math.max(0, Math.floor(quota * 0.45) - currentWestern);
    const extras = places.filter((place) => place.category === category && !result.includes(place.id) && !(overrides.veto ?? []).includes(place.id));
    const sorted = stableCandidates(extras, config.seed);
    const western = sorted.filter((place) => christmasOffset(place.timezone) <= -240);
    const other = sorted.filter((place) => !western.includes(place));
    const preferred = [...western.slice(0, westernNeed), ...other, ...western.slice(westernNeed)];
    result.push(...preferred.slice(0, Math.max(0, quota - current)).map((place) => place.id));
  }
  return result;
}
export function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides): Candidate[] {
  const places = pool.map((place) => ({ ...place, category: categoryOf(place) }));
  const quotas = allocateQuotas(config.total, config.weights);
  const vetoed = new Set(overrides.veto ?? []);
  const context = { places, config, vetoed };
  const selected = Object.entries(quotas).flatMap(([category, quota]) => selectCategory(context, category, quota));
  const adjusted = applyOverrides(places, selected, overrides);
  const refilled = refillSelection({ places, selection: adjusted, quotas, config, overrides });
  const byId = new Map(places.map((place) => [place.id, place]));
  const chosen = refilled.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
  if (chosen.length !== config.total) throw new Error(`Unable to select ${config.total} candidates while preserving category quotas`);
  return chosen;
}
