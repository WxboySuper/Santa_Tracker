import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FeatureCollection } from 'geojson';
import { getGeoBoundarySource } from '../../config/geoBoundarySources';
import type { BoundaryGeoBundle } from './types';

const ROOT = process.cwd();

const readVendoredGeoJson = (vendoredPath: string): FeatureCollection => {
  const absolutePath = resolve(ROOT, vendoredPath);
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as FeatureCollection;
};

/** Loads vendored boundary datasets from disk (Jest / Node tooling only). */
export const loadVendoredBoundaryGeoBundle = (): BoundaryGeoBundle => ({
  states: readVendoredGeoJson(getGeoBoundarySource('usStates').vendoredPath),
  countries: readVendoredGeoJson(getGeoBoundarySource('worldCountries').vendoredPath),
  lakes: readVendoredGeoJson(getGeoBoundarySource('lakes').vendoredPath),
});
