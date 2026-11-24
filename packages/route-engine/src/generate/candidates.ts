import { haversineKm } from '../geo';
import { applyOverrides, type RouteOverrides } from './overrides';
import { classifyRegion } from './regions';
import { allocateQuotas, compareStableIds } from './selection';
import type { Candidate, GeneratorConfig } from './types';

type ZoneTable = { zonesByCountry: Record<string, string[]> };

function stableHash(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function categoryOf(place: Candidate, config: GeneratorConfig): string | null {
  if (['cultural', 'nature', 'special'].includes(place.category)) return place.category;
  if (place.worldCity || (place.population ?? 0) >= config.hubPopulationCore) return 'hub';
  if ((place.population ?? 0) >= config.hubPopulationMinimum) return 'hub';
  if (config.underservedCountries.includes(place.country)) return 'underserved';
  return null;
}

function stableCandidates(candidates: Candidate[], seed: number): Candidate[] {
  return [...candidates].sort((a, b) => {
    const difference = stableHash(a.id, seed) - stableHash(b.id, seed);
    return difference || compareStableIds(a.id, b.id);
  });
}

function coreHub(place: Candidate, config: GeneratorConfig): boolean {
  return place.worldCity === true || (place.population ?? 0) >= config.hubPopulationCore;
}

function regionCount(places: Candidate[], predicate: (place: Candidate) => boolean): number {
  return places.filter(predicate).length;
}

function countryCount(places: Candidate[], country: string): number {
  return places.filter((place) => place.country === country).length;
}

function findById(pool: Candidate[], id: string): Candidate | undefined {
  return pool.find((place) => place.id === id);
}

type SelectionState = {
  chosen: Candidate[];
  chosenIds: Set<string>;
  countryCounts: Map<string, number>;
  categoryCounts: Map<string, number>;
  quotas: Record<string, number>;
  pool: Candidate[];
  config: GeneratorConfig;
  forbidden: Set<string>;
};

function allowedCandidate(place: Candidate, state: SelectionState): boolean {
  return meetsBasicSelectionLimits(place, state) && meetsRegionalSelectionLimits(place, state);
}

function meetsBasicSelectionLimits(place: Candidate, state: SelectionState): boolean {
  const { chosen, chosenIds, countryCounts, categoryCounts, quotas, config, forbidden } = state;
  if (chosenIds.has(place.id) || forbidden.has(place.id)) return false;
  if ((categoryCounts.get(place.category) ?? 0) >= (quotas[place.category] ?? 0)) return false;
  const countryCap = config.countryCaps[place.country] ?? config.maxStopsPerCountry;
  if ((countryCounts.get(place.country) ?? 0) >= countryCap) return false;
  const offsetCap = config.offsetCaps[String(place.utcOffsetMinutes)] ?? config.maxStopsPerUtcOffset;
  const offsetCount = chosen.filter((selected) => selected.utcOffsetMinutes === place.utcOffsetMinutes).length;
  return offsetCount < offsetCap && !chosen.some((selected) => haversineKm(selected, place) < config.minStopSeparationKm);
}

function meetsRegionalSelectionLimits(place: Candidate, state: SelectionState): boolean {
  if (state.config.total < 100) return true;
  const region = classifyRegion(place);
  if (region.southAmerica && regionCount(state.chosen, (item) => classifyRegion(item).southAmerica) >= state.config.maxSouthAmericaStops) return false;
  if (region.americas && regionCount(state.chosen, (item) => classifyRegion(item).americas) >= Math.floor(state.config.total * state.config.maxAmericasPercent / 100)) return false;
  const islandCount = state.chosen.filter((item) => state.config.uninhabitedIslandIds.includes(item.id)).length;
  return !state.config.uninhabitedIslandIds.includes(place.id) || islandCount < 4;
}

function addCandidate(place: Candidate, state: SelectionState): boolean {
  if (!allowedCandidate(place, state)) return false;
  state.chosen.push(place);
  state.chosenIds.add(place.id);
  state.countryCounts.set(place.country, (state.countryCounts.get(place.country) ?? 0) + 1);
  state.categoryCounts.set(place.category, (state.categoryCounts.get(place.category) ?? 0) + 1);
  return true;
}

function remainingCategory(state: SelectionState, category: string): number {
  return (state.quotas[category] ?? 0) - (state.categoryCounts.get(category) ?? 0);
}

function addLockedStops(lockedIds: string[], state: SelectionState): void {
  for (const id of lockedIds) {
    const place = findById(state.pool, id);
    if (!place) throw new Error(`Unknown stop: ${id}`);
    if (!addCandidate(place, state)) throw new Error(`Locked stop ${place.name} violates a country, category, separation, or regional cap`);
  }
}

function pickRanked(state: SelectionState, predicate: (place: Candidate) => boolean, ranked: Candidate[]): boolean {
  for (const place of ranked) {
    if (!predicate(place)) continue;
    if (addCandidate(place, state)) return true;
  }
  return false;
}

function reserveHubCore(state: SelectionState, ranked: Candidate[]): void {
  if (state.config.total < 100) return;
  const hubQuota = state.quotas.hub ?? 0;
  const coreTarget = Math.min(hubQuota, state.config.hubCoreMinimum);
  while (regionCount(state.chosen.filter((place) => place.category === 'hub'), (place) => coreHub(place, state.config)) < coreTarget) {
    const added = pickRanked(state, (place) => place.category === 'hub' && coreHub(place, state.config), ranked);
    if (!added) throw new Error(`Cannot select ${coreTarget} qualifying hub cities under the country and distance limits`);
  }
}

function reserveOffsets(state: SelectionState, ranked: Candidate[]): void {
  if (state.config.total < 100) return;
  const offsets = [...new Set(state.pool
    .filter((place) => !state.config.uninhabitedIslandIds.includes(place.id))
    .map((place) => place.utcOffsetMinutes))]
    .filter((offset): offset is number => offset !== undefined)
    .sort((a, b) => b - a);
  for (const offset of offsets) {
    if (state.chosen.some((place) => place.utcOffsetMinutes === offset)) continue;
    const added = pickRanked(state, (place) => place.utcOffsetMinutes === offset && !state.config.uninhabitedIslandIds.includes(place.id), ranked);
    if (!added) throw new Error(`Cannot cover UTC offset ${offset} minutes within the category and country caps`);
  }
}

function reserveRequiredCountries(state: SelectionState, ranked: Candidate[]): void {
  for (const country of state.config.requiredCountries) {
    if (state.chosen.some((place) => place.country === country)) continue;
    if (!pickRanked(state, (place) => place.country === country, ranked)) {
      throw new Error(`Cannot select a required stop in ${country} within the category, country, distance, and regional caps`);
    }
  }
}

function reserveRegions(state: SelectionState, ranked: Candidate[]): void {
  if (state.config.total < 100) return;
  const rules: { name: string; minimum: number; matches: (place: Candidate) => boolean }[] = [
    { name: 'Africa', minimum: state.config.regionalMinimums.africa, matches: (place) => classifyRegion(place).africa },
    { name: 'Middle East', minimum: state.config.regionalMinimums.middleEast, matches: (place) => classifyRegion(place).middleEast },
    { name: 'Western and Northern Europe', minimum: state.config.regionalMinimums.westernNorthernEurope, matches: (place) => classifyRegion(place).westernNorthernEurope },
    { name: 'Australia and New Zealand', minimum: state.config.regionalMinimums.australiaNewZealand, matches: (place) => classifyRegion(place).australiaNewZealand },
    { name: 'Pacific islands', minimum: state.config.regionalMinimums.pacificIslands, matches: (place) => classifyRegion(place).pacificIsland },
    { name: 'Greenland or Arctic Canada', minimum: state.config.regionalMinimums.arctic, matches: (place) => classifyRegion(place).arctic },
  ];
  for (const rule of rules) {
    while (regionCount(state.chosen, rule.matches) < rule.minimum) {
      if (!pickRanked(state, rule.matches, ranked)) throw new Error(`Cannot meet the ${rule.name} minimum of ${rule.minimum} stops`);
    }
  }
}

function quotaFailure(category: string, state: SelectionState, ranked: Candidate[]): Error {
  const unavailable = ranked.filter((place) => place.category === category && !state.chosenIds.has(place.id))
    .slice(0, 12).map((place) => describeUnavailableCandidate(place, state));
  return new Error(`Cannot fill ${category} quota ${state.quotas[category] ?? 0}; selected ${state.categoryCounts.get(category) ?? 0}; candidates: ${unavailable.join('; ')}`);
}

function describeUnavailableCandidate(place: Candidate, state: SelectionState): string {
  const nearby = state.chosen.find((selected) => haversineKm(selected, place) < state.config.minStopSeparationKm);
  const countryCap = state.config.countryCaps[place.country] ?? state.config.maxStopsPerCountry;
  const overCountryCap = (state.countryCounts.get(place.country) ?? 0) >= countryCap;
  const reason = overCountryCap ? 'country cap'
    : nearby ? `within ${Math.round(haversineKm(nearby, place))} km of ${nearby.name}` : 'regional cap';
  const countryStops = overCountryCap
    ? `: ${state.chosen.filter((selected) => selected.country === place.country).map((selected) => selected.name).join(', ')}`
    : '';
  return `${place.name} (${reason}${countryStops})`;
}

function fillCategoryQuota(category: string, state: SelectionState, ranked: Candidate[]): void {
  while (remainingCategory(state, category) > 0) {
    if (!pickRanked(state, (place) => place.category === category, ranked)) throw quotaFailure(category, state, ranked);
  }
}

function fillQuotas(state: SelectionState, ranked: Candidate[]): void {
  for (const category of ['cultural', 'nature', 'special', 'underserved', 'hub']) fillCategoryQuota(category, state, ranked);
}

function validateCountAndCategories(places: Candidate[], config: GeneratorConfig, quotas: Record<string, number>): void {
  if (places.length !== config.total) throw new Error(`Unable to select ${config.total} candidates while preserving category quotas`);
  for (const [category, quota] of Object.entries(quotas)) {
    const count = places.filter((place) => place.category === category).length;
    if (count !== quota) throw new Error(`Selected ${count} ${category} stops, expected ${quota}`);
  }
}

function validateCountryCaps(places: Candidate[], config: GeneratorConfig): void {
  for (const [country, count] of countryCounts(places)) {
    const cap = config.countryCaps[country] ?? config.maxStopsPerCountry;
    if (count > cap) throw new Error(`Country cap ${cap} exceeded for ${country}`);
  }
}

function countryCounts(places: Candidate[]): Map<string, number> {
  return new Map([...new Set(places.map((place) => place.country))].map((country) => [country, countryCount(places, country)]));
}

function validateOffsetCaps(places: Candidate[], config: GeneratorConfig): void {
  for (const [offset, count] of Object.entries(places.reduce<Record<string, number>>((counts, place) => {
    const key = String(place.utcOffsetMinutes);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}))) {
    const cap = config.offsetCaps[offset] ?? config.maxStopsPerUtcOffset;
    if (count > cap) throw new Error(`UTC offset cap ${cap} exceeded for ${offset} minutes`);
  }
}

function validateCoreHubMinimum(places: Candidate[], config: GeneratorConfig): void {
  const coreHubCount = places.filter((place) => place.category === 'hub' && coreHub(place, config)).length;
  if (config.total >= 100 && coreHubCount < config.hubCoreMinimum) {
    throw new Error(`Core hub minimum ${config.hubCoreMinimum} not met; selected ${coreHubCount}`);
  }
}

function validateMinimumSeparation(places: Candidate[], config: GeneratorConfig): void {
  for (let left = 0; left < places.length; left++) {
    for (let right = left + 1; right < places.length; right++) {
      const first = places[left];
      const second = places[right];
      if (first && second && haversineKm(first, second) < config.minStopSeparationKm) {
        throw new Error(`Stops ${first.name} and ${second.name} are closer than ${config.minStopSeparationKm} km`);
      }
    }
  }
}

function validateRegionalCaps(places: Candidate[], config: GeneratorConfig): void {
  const selectedAmericas = places.filter((place) => classifyRegion(place).americas).length;
  const maximumAmericas = Math.floor(config.total * config.maxAmericasPercent / 100);
  if (config.total >= 100 && selectedAmericas > maximumAmericas) throw new Error(`Americas cap ${maximumAmericas} exceeded`);
  const selectedSouthAmerica = places.filter((place) => classifyRegion(place).southAmerica).length;
  if (config.total >= 100 && selectedSouthAmerica > config.maxSouthAmericaStops) throw new Error(`South America cap ${config.maxSouthAmericaStops} exceeded`);
}

function validateSelection(places: Candidate[], config: GeneratorConfig, quotas: Record<string, number>): void {
  validateCountAndCategories(places, config, quotas);
  validateCountryCaps(places, config);
  validateOffsetCaps(places, config);
  validateCoreHubMinimum(places, config);
  validateMinimumSeparation(places, config);
  validateRegionalCaps(places, config);
}

function isEligible(place: Candidate, zones?: ZoneTable): boolean {
  if (place.utcOffsetMinutes === undefined || !Number.isInteger(place.utcOffsetMinutes)) return false;
  if (!zones) return true;
  const allowed = zones.zonesByCountry[place.country];
  return allowed?.includes(place.timezone) ?? false;
}

type CandidateSelectionInputs = {
  quotas: Record<string, number>;
  veto: Set<string>;
  classified: Candidate[];
  byId: Map<string, Candidate>;
  lockIds: string[];
  selectionLockIds: string[];
};

function requiredCandidateIds(config: GeneratorConfig): string[] {
  return [...new Set([...config.requiredStopIds, ...config.openingStopIds, ...Object.keys(config.arrivalAnchorMinutes)])];
}

function validateKnownLocks(pool: Candidate[], lockIds: string[]): void {
  const available = new Set(pool.map((place) => place.id));
  const missing = lockIds.find((id) => !available.has(id));
  if (missing) throw new Error(`Unknown locked stop: ${missing}`);
}

function validateCategoryLocks(classified: Candidate[], lockIds: string[]): void {
  const byId = new Map(classified.map((place) => [place.id, place]));
  const invalid = lockIds.map((id) => byId.get(id)).find((place) => place?.category === 'unselected');
  if (invalid) throw new Error(`Locked stop ${invalid.name} has no configured route category`);
}

function isSelectable(place: Candidate, quotas: Record<string, number>, veto: Set<string>, zones: ZoneTable | undefined,
  lockedIds: Set<string>): boolean {
  if (place.category === 'unselected' || veto.has(place.id)) return false;
  if ((quotas[place.category] ?? 0) === 0) return false;
  if (isEligible(place, zones)) return true;
  if (lockedIds.has(place.id)) throw new Error(`Timezone ${place.timezone} for ${place.name} does not belong to country ${place.country}`);
  return false;
}

function buildCandidateSelectionInputs(pool: Candidate[], config: GeneratorConfig, overrides: RouteOverrides, zones?: ZoneTable): CandidateSelectionInputs {
  if (new Set(pool.map((place) => place.id)).size !== pool.length) throw new Error('Candidate ids must be unique');
  const quotas = allocateQuotas(config.total, config.weights);
  const veto = new Set(overrides.veto ?? []);
  const requiredIds = requiredCandidateIds(config);
  const lockIds = [...new Set([...(overrides.lock ?? []), ...requiredIds, config.endStopId, ...config.ownerDecisionIds])];
  validateKnownLocks(pool, lockIds);
  const classified = pool.map((place) => ({ ...place, category: categoryOf(place, config) ?? 'unselected' }));
  validateCategoryLocks(classified, lockIds);
  const lockedIds = new Set(lockIds);
  const selectionPool = classified.filter((place) => isSelectable(place, quotas, veto, zones, lockedIds));
  const byId = new Map(selectionPool.map((place) => [place.id, place]));
  const selectionLockIds = buildSelectionLockIds(lockIds, veto, overrides);
  return { quotas, veto, classified, byId, lockIds, selectionLockIds };
}

function buildSelectionLockIds(lockIds: string[], veto: Set<string>, overrides: RouteOverrides): string[] {
  const swapTargets = new Set(Object.values(overrides.swap ?? {}));
  const swapSources = new Set(Object.keys(overrides.swap ?? {}));
  if ([...swapSources].some((id) => lockIds.includes(id))) throw new Error('A swap source cannot be locked in the final stop list');
  if ([...swapTargets].some((id) => !lockIds.includes(id))) throw new Error('A swap target must be locked in the final stop list');
  const selectionLockIds = lockIds.filter((id) => !swapTargets.has(id));
  for (const [source, target] of Object.entries(overrides.swap ?? {})) {
    if (lockIds.includes(target)) selectionLockIds.push(veto.has(source) ? target : source);
  }
  return selectionLockIds;
}

function createSelectionState(inputs: CandidateSelectionInputs, config: GeneratorConfig): SelectionState {
  return {
    chosen: [],
    chosenIds: new Set(),
    countryCounts: new Map(),
    categoryCounts: new Map(),
    quotas: inputs.quotas,
    pool: [...inputs.byId.values()],
    config,
    forbidden: inputs.veto,
  };
}

function applyFinalOverrides(state: SelectionState, classified: Candidate[], byId: Map<string, Candidate>, overrides: RouteOverrides): Candidate[] {
  if (Object.keys(overrides.swap ?? {}).length === 0) return state.chosen;
  const selectedIds = applyOverrides(classified, state.chosen.map((place) => place.id), { ...overrides,
    lock: [...new Set([...(overrides.lock ?? []), ...state.config.requiredStopIds, ...state.config.openingStopIds,
      ...Object.keys(state.config.arrivalAnchorMinutes), state.config.endStopId, ...state.config.ownerDecisionIds])],
  });
  return selectedIds.map((id) => byId.get(id)).filter((place): place is Candidate => place !== undefined);
}

export function chooseCandidates(
  pool: Candidate[],
  config: GeneratorConfig,
  overrides: RouteOverrides = {},
  zones?: ZoneTable,
): Candidate[] {
  const inputs = buildCandidateSelectionInputs(pool, config, overrides, zones);
  for (const id of inputs.lockIds) if (inputs.veto.has(id)) throw new Error(`Stop is both locked and vetoed: ${id}`);
  const state = createSelectionState(inputs, config);
  const ranked = stableCandidates(state.pool, config.seed);
  addLockedStops(inputs.selectionLockIds, state);
  reserveRemainingCandidates(state, ranked, overrides);
  const selected = applyFinalOverrides(state, inputs.classified, inputs.byId, overrides);
  validateSelection(selected, config, inputs.quotas);
  return selected;
}

function reserveRemainingCandidates(state: SelectionState, ranked: Candidate[], overrides: RouteOverrides): void {
  reserveRequiredCountries(state, ranked);
  if (Object.keys(overrides.swap ?? {}).length === 0) reserveHubCore(state, ranked);
  reserveOffsets(state, ranked);
  reserveRegions(state, ranked);
  fillQuotas(state, ranked);
}
