import type { FeatureCollection } from 'geojson';
import { getGeoBoundarySource } from '../../config/geoBoundarySources';
import type { BoundaryGeoBundle } from './types';

/** Browser-friendly loader that mirrors blank-basemap fetch semantics. */
export const fetchBoundaryGeoBundle = async (): Promise<BoundaryGeoBundle> => {
  const [states, countries, lakes] = await Promise.all([
    fetch(getGeoBoundarySource('usStates').url).then((response) => response.json()),
    fetch(getGeoBoundarySource('worldCountries').url).then((response) => response.json()),
    fetch(getGeoBoundarySource('lakes').url).then((response) => response.json()),
  ]);

  return {
    states: states as FeatureCollection,
    countries: countries as FeatureCollection,
    lakes: lakes as FeatureCollection,
  };
};
