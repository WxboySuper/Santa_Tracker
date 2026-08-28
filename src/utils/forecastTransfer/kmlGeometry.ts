import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

const localTagName = (node: Element): string =>
  (node.localName ?? node.tagName.replace(/^[^:]+:/, '')).toLowerCase();

const findElementsByLocalName = (root: Element, name: string): Element[] => {
  const target = name.toLowerCase();
  return Array.from(root.getElementsByTagName('*')).filter((node) => localTagName(node) === target);
};

// @codescene(disable:"Complex Conditional")
const parseCoordinateTuple = (tuple: string): Position | null => {
  const parts = tuple.trim().split(',').map((part) => Number(part.trim()));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }

  return [parts[0], parts[1]];
};

const parseCoordinateString = (value: string | null | undefined): Position[] => {
  if (!value) {
    return [];
  }

  return value
    .trim()
    .split(/\s+/)
    .map(parseCoordinateTuple)
    .filter((position): position is Position => position !== null);
};

const ringFromLinearRing = (linearRing: Element | null): Position[] => {
  if (!linearRing) {
    return [];
  }

  const coordinates = findElementsByLocalName(linearRing, 'coordinates')[0]?.textContent;
  return parseCoordinateString(coordinates);
};

const polygonFromElement = (polygonElement: Element): Polygon | null => {
  const outerBoundary = findElementsByLocalName(polygonElement, 'outerboundaryis')[0];
  const outer = ringFromLinearRing(findElementsByLocalName(outerBoundary ?? polygonElement, 'linearring')[0] ?? null);
  if (outer.length < 4) {
    return null;
  }

  const holes = findElementsByLocalName(polygonElement, 'innerboundaryis')
    .map((inner) => ringFromLinearRing(findElementsByLocalName(inner, 'linearring')[0] ?? null))
    .filter((ring) => ring.length >= 4);

  return {
    type: 'Polygon',
    coordinates: [outer, ...holes],
  };
};

/** Converts KML polygon or multi-geometry elements into GeoJSON area features. */
export const geometryFromKmlElement = (container: Element): Feature<Polygon | MultiPolygon> | null => {
  const containerTag = localTagName(container);
  const polygonElements = containerTag === 'polygon'
    ? [container]
    : findElementsByLocalName(container, 'polygon');

  const polygons = polygonElements
    .map((polygon) => polygonFromElement(polygon))
    .filter((polygon): polygon is Polygon => polygon !== null);

  if (polygons.length === 0) {
    return null;
  }

  if (polygons.length === 1) {
    return {
      type: 'Feature',
      properties: {},
      geometry: polygons[0],
    };
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: polygons.map((polygon) => polygon.coordinates),
    },
  };
};
