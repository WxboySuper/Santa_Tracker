import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { OutlookData } from '../../types/outlooks';
import type { ReportType, StormReport } from '../../types/stormReports';

/**
 * Shared scenario fixtures for the gfc-ver-1 engine tests. Kept outside a
 * *.test file so both the unit suite and the hardening suite can reuse them.
 */

/** Builds a circular contour of a given radius (km) centered on a point. */
export const circleContour = (
  lon: number,
  lat: number,
  radiusKm: number
): Feature<Polygon> => turf.circle([lon, lat], radiusKm, { units: 'kilometers', steps: 64 }) as Feature<Polygon>;

let reportCounter = 0;

/** Builds a storm report at a point with an optional magnitude. */
export const makeReport = (
  type: ReportType,
  lon: number,
  lat: number,
  magnitude?: string
): StormReport => {
  reportCounter += 1;
  return {
    id: `fixture-${reportCounter}`,
    type,
    latitude: lat,
    longitude: lon,
    time: '2000',
    magnitude,
    location: 'Fixture',
    county: 'Fixture',
    state: 'KS',
  };
};

/** Builds an OutlookData with a single tornado contour keyed by probability. */
export const tornadoOutlook = (
  probabilityKey: string,
  contour: Feature<Polygon>
): OutlookData => ({
  tornado: new Map([[probabilityKey, [contour]]]),
  wind: new Map(),
  hail: new Map(),
  categorical: new Map(),
});

/** Scatters N reports of a type near a center within a small jitter radius. */
export const scatterReports = (
  type: ReportType,
  lon: number,
  lat: number,
  count: number,
  jitterDeg = 0.05
): StormReport[] =>
  Array.from({ length: count }, (_unused, index) => {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2;
    return makeReport(type, lon + Math.cos(angle) * jitterDeg, lat + Math.sin(angle) * jitterDeg);
  });
