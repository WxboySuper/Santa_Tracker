import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import type { OutlookData } from '../../types/outlooks';
import type { StormReport } from '../../types/stormReports';
import {
  CATEGORICAL_PROBABILITY,
  GRID_SPACING_KM,
  MAX_GRID_CELLS,
  SIGNIFICANT_THRESHOLD,
  SPC_NEIGHBORHOOD_MILES,
} from './constants';
import type { HazardKind, ProductKind } from './gradeContract';

/**
 * Neighborhood + area geometry for the gfc-ver-1 engine (PR 02 — neighborhood-area).
 *
 * Implements the SPC spatial contract: severe within 25 miles of any point in a
 * contour, with reports buffered by 25 miles. There is intentionally no
 * distance-from-polygon decay inside the halo — a location is either within the
 * neighborhood or it is not.
 */

export type AreaPolygon = Feature<Polygon | MultiPolygon>;

/** A single forecast contour with its resolved probability and significance. */
export interface ProductContour {
  probability: number;
  isSignificant: boolean;
  polygon: AreaPolygon;
}

/** Returns true when an outlook map key encodes a significant (hatched) threat. */
export const isSignificantKey = (key: string): boolean => key.includes('#');

/**
 * Resolves the probability fraction (0–1) a contour key represents for a
 * product. Categorical keys map through the versioned categorical table; hazard
 * keys parse their leading percent value.
 */
export const probabilityFromKey = (product: ProductKind, key: string): number => {
  const clean = key.replace('#', '').trim().toUpperCase();

  if (product === 'categorical') {
    return CATEGORICAL_PROBABILITY[clean] ?? 0;
  }

  const match = clean.match(/([\d.]+)/);
  if (!match) {
    return 0;
  }
  return Number(match[1]) / 100;
};

/** Report types that count toward a product's verification. */
export const relevantReportTypes = (product: ProductKind): HazardKind[] =>
  product === 'categorical' ? ['tornado', 'wind', 'hail'] : [product];

/** Selects the reports relevant to a product. */
export const reportsForProduct = (reports: StormReport[], product: ProductKind): StormReport[] => {
  const types = relevantReportTypes(product);
  return reports.filter((report) => types.includes(report.type as HazardKind));
};

/** Coerces a report magnitude string into a comparable number (0 when absent). */
export const parseMagnitude = (report: StormReport): number => {
  if (!report.magnitude) {
    return 0;
  }
  const match = String(report.magnitude).match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
};

/** True when a report meets the significant-severity threshold for its hazard. */
export const isSignificantReport = (report: StormReport): boolean => {
  const threshold = SIGNIFICANT_THRESHOLD[report.type as HazardKind];
  if (threshold === undefined) {
    return false;
  }
  return parseMagnitude(report) >= threshold;
};

const asAreaPolygon = (feature: Feature): AreaPolygon | null => {
  if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
    return feature as AreaPolygon;
  }
  return null;
};

/**
 * Extracts the forecast contours for a product from an outlook, resolving each
 * key's probability and significance. Malformed geometries are skipped.
 */
export const extractProductContours = (
  outlooks: OutlookData,
  product: ProductKind
): ProductContour[] => {
  const map = outlooks[product];
  if (!map) {
    return [];
  }

  const contours: ProductContour[] = [];
  for (const [key, features] of map.entries()) {
    const probability = probabilityFromKey(product, key);
    const isSignificant = isSignificantKey(key);
    for (const feature of features) {
      const polygon = asAreaPolygon(feature);
      if (polygon) {
        contours.push({ probability, isSignificant, polygon });
      }
    }
  }
  return contours;
};

/** Unions many polygons into a single feature, tolerating malformed inputs. */
export const unionAll = (polygons: AreaPolygon[]): AreaPolygon | null => {
  const valid = polygons.filter(Boolean);
  if (valid.length === 0) {
    return null;
  }

  let accumulator: AreaPolygon | null = valid[0];
  for (let index = 1; index < valid.length; index += 1) {
    if (!accumulator) {
      accumulator = valid[index];
      continue;
    }
    try {
      const merged = turf.union(
        turf.featureCollection([accumulator, valid[index]])
      ) as AreaPolygon | null;
      if (merged) {
        accumulator = merged;
      }
    } catch {
      // Keep the running union if a pairwise union fails on bad geometry.
    }
  }
  return accumulator;
};

/** Area of a polygon feature in square kilometers (0 when null/invalid). */
export const areaKm2 = (polygon: AreaPolygon | null): number => {
  if (!polygon) {
    return 0;
  }
  try {
    return turf.area(polygon) / 1_000_000;
  } catch {
    return 0;
  }
};

/** Area of the intersection of two polygons in square kilometers. */
export const intersectionAreaKm2 = (a: AreaPolygon | null, b: AreaPolygon | null): number => {
  if (!a || !b) {
    return 0;
  }
  try {
    const intersection = turf.intersect(turf.featureCollection([a, b])) as AreaPolygon | null;
    return areaKm2(intersection);
  } catch {
    return 0;
  }
};

/** Buffers a report point by the SPC neighborhood radius (25 miles). */
export const bufferReport = (report: StormReport): AreaPolygon | null => {
  try {
    const point = turf.point([report.longitude, report.latitude]);
    return turf.buffer(point, SPC_NEIGHBORHOOD_MILES, { units: 'miles' }) as AreaPolygon | null;
  } catch {
    return null;
  }
};

/** Union of every report's 25-mile halo — the observed severe footprint. */
export const observedFootprint = (reports: StormReport[]): AreaPolygon | null => {
  const halos: AreaPolygon[] = [];
  for (const report of reports) {
    const halo = bufferReport(report);
    if (halo) {
      halos.push(halo);
    }
  }
  return unionAll(halos);
};

/** Highest forecast probability whose contour contains the point (0 if none). */
export const forecastProbabilityAt = (
  point: Position,
  contours: ProductContour[]
): number => {
  const turfPoint = turf.point(point);
  let best = 0;
  for (const contour of contours) {
    if (contour.probability <= best) {
      continue;
    }
    try {
      if (turf.booleanPointInPolygon(turfPoint, contour.polygon)) {
        best = contour.probability;
      }
    } catch {
      // Ignore malformed contour geometry.
    }
  }
  return best;
};

/** True when a point lies within 25 miles of any of the supplied reports. */
export const isWithinNeighborhood = (point: Position, reports: StormReport[]): boolean => {
  const turfPoint = turf.point(point);
  for (const report of reports) {
    try {
      const distance = turf.distance(turfPoint, turf.point([report.longitude, report.latitude]), {
        units: 'miles',
      });
      if (distance <= SPC_NEIGHBORHOOD_MILES) {
        return true;
      }
    } catch {
      // Skip reports with invalid coordinates.
    }
  }
  return false;
};

/** Count of reports whose location is within 25 miles of a region. */
export const reportsNearRegion = (region: AreaPolygon | null, reports: StormReport[]): number => {
  if (!region) {
    return 0;
  }
  let buffered: AreaPolygon | null = region;
  try {
    buffered = turf.buffer(region, SPC_NEIGHBORHOOD_MILES, { units: 'miles' }) as AreaPolygon | null;
  } catch {
    buffered = region;
  }
  if (!buffered) {
    return 0;
  }

  let count = 0;
  for (const report of reports) {
    try {
      if (turf.booleanPointInPolygon(turf.point([report.longitude, report.latitude]), buffered)) {
        count += 1;
      }
    } catch {
      // Skip malformed report coordinates.
    }
  }
  return count;
};

/** The ~10 km grid the probability/spatial components are evaluated over. */
export interface VerificationGrid {
  /** [lon, lat] cell centroids. */
  points: Position[];
  spacingKm: number;
}

/** Bounding box of a set of features, or null when empty. */
const combinedBbox = (features: AreaPolygon[]): [number, number, number, number] | null => {
  if (features.length === 0) {
    return null;
  }
  try {
    return turf.bbox(turf.featureCollection(features)) as [number, number, number, number];
  } catch {
    return null;
  }
};

/**
 * Builds the evaluation grid over the forecast envelope plus the observed
 * footprint. Spacing coarsens automatically to stay under the cell ceiling so a
 * continental-scale envelope still runs in bounded time.
 */
export const buildVerificationGrid = (
  forecast: AreaPolygon | null,
  observed: AreaPolygon | null
): VerificationGrid => {
  const features = [forecast, observed].filter((feature): feature is AreaPolygon => Boolean(feature));
  const bbox = combinedBbox(features);
  if (!bbox) {
    return { points: [], spacingKm: GRID_SPACING_KM };
  }

  const [minX, minY, maxX, maxY] = bbox;
  const widthKm = turf.distance([minX, minY], [maxX, minY], { units: 'kilometers' });
  const heightKm = turf.distance([minX, minY], [minX, maxY], { units: 'kilometers' });

  let spacingKm = GRID_SPACING_KM;
  const estimatedCells = (widthKm / spacingKm + 1) * (heightKm / spacingKm + 1);
  if (estimatedCells > MAX_GRID_CELLS) {
    const areaKm = Math.max(widthKm * heightKm, 1);
    spacingKm = Math.sqrt(areaKm / MAX_GRID_CELLS);
  }

  let grid;
  try {
    grid = turf.pointGrid(bbox, spacingKm, { units: 'kilometers' });
  } catch {
    return { points: [], spacingKm };
  }

  const points = grid.features
    .map((feature) => feature.geometry?.coordinates)
    .filter((coordinates): coordinates is Position => Array.isArray(coordinates));

  return { points, spacingKm };
};
