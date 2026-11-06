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
type SelectionContext = { places: Candidate[]; config: GeneratorConfig };
function selectCategory(context: SelectionContext, category: string, quota: number): string[] {
  const { places, config } = context;
  const candidates = places.filter((place) => place.category === category)
    .sort((a, b) => stableHash(a.id, config.seed) - stableHash(b.id, config.seed) || a.id.localeCompare(b.id));
  const selected: string[] = [];
  const westernTarget = Math.floor(quota * 0.45);
  const western = candidates.filter((place) => christmasOffset(place.timezone) <= -240);
  const preferredWest = western.slice(0, westernTarget);
  const preferred = [...preferredWest, ...candidates.filter((place) => !preferredWest.includes(place))];
  for (const place of preferred) {
    if (selected.length === quota) break;
    selected.push(place.id);
  }
  if (selected.length < quota) throw new Error(`Country cap prevents filling ${category} quota ${quota}`);
  return selected;
}
function refillSelection(
  places: Candidate[], selection: string[], quotas: Record<string, number>, config: GeneratorConfig, overrides: RouteOverrides,
): string[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const result = [...selection];
  for (const [category, quota] of Object.entries(quotas)) {
    const current = result.filter((id) => byId.get(id)?.category === category).length;
    if (current > quota) throw new Error(`Overrides exceed ${category} quota ${quota}`);
    const extras = places.filter((place) => place.category === category && !result.includes(place.id) && !(overrides.veto ?? []).includes(place.id))
      .sort((a, b) => stableHash(a.id, config.seed) - stableHash(b.id, config.seed) || a.id.localeCompare(b.id));
    result.push(...extras.slice(0, Math.max(0, quota - current)).map((place) => place.id));
  }
  return result;
}
export function chooseCandidates(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides): Candidate[] {
  const places = pool.map((place) => ({ ...place, category: categoryOf(place) }));
  const quotas = allocateQuotas(config.total, config.weights);
  const context = { places, config };
  const selected = Object.entries(quotas).flatMap(([category, quota]) => selectCategory(context, category, quota));
  const adjusted = applyOverrides(places, selected, overrides);
  const refilled = refillSelection(places, adjusted, quotas, config, overrides);
  const byId = new Map(places.map((place) => [place.id, place]));
  const chosen = refilled.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
  if (chosen.length !== config.total) throw new Error(`Unable to select ${config.total} candidates while preserving category quotas`);
  return chosen;
}
