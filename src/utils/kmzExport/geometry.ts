import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';

const closeRing = (ring: Position[]): Position[] => {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
};

const ringToKmlCoordinates = (ring: Position[]): string =>
  closeRing(ring)
    .map(([lng, lat]) => `${lng},${lat},0`)
    .join(' ');

const polygonToKml = (polygon: Polygon): string => {
  const [outer, ...holes] = polygon.coordinates;
  const outerBoundary = `<outerBoundaryIs><LinearRing><coordinates>${ringToKmlCoordinates(outer)}</coordinates></LinearRing></outerBoundaryIs>`;
  const innerBoundaries = holes
    .map((hole) => `<innerBoundaryIs><LinearRing><coordinates>${ringToKmlCoordinates(hole)}</coordinates></LinearRing></innerBoundaryIs>`)
    .join('');

  return `<Polygon>${outerBoundary}${innerBoundaries}</Polygon>`;
};

const multiPolygonToKml = (multiPolygon: MultiPolygon): string => {
  const polygons = multiPolygon.coordinates
    .map((polygonCoords) => polygonToKml({ type: 'Polygon', coordinates: polygonCoords }))
    .join('');

  return `<MultiGeometry>${polygons}</MultiGeometry>`;
};

/** Serializes supported GeoJSON area geometries into KML polygon markup. */
export const geometryToKml = (geometry: Geometry | null | undefined): string | null => {
  if (!geometry) {
    return null;
  }

  if (geometry.type === 'Polygon') {
    return polygonToKml(geometry);
  }

  if (geometry.type === 'MultiPolygon') {
    return multiPolygonToKml(geometry);
  }

  return null;
};

/** Returns true when a feature has polygon geometry GFC can export. */
export const isExportableAreaFeature = (feature: Feature): boolean =>
  geometryToKml(feature.geometry) !== null;
