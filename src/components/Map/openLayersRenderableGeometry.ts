import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";

const isFinitePosition = (value: unknown): value is number[] =>
  Array.isArray(value)
  && value.length >= 2
  && value.slice(0, 2).every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));

// @codescene(disable:"Complex Conditional")
const isClosedRing = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length < 4 || !isFinitePosition(value[0]) || !isFinitePosition(value[value.length - 1])) {
    return false;
  }
  return value[0][0] === value[value.length - 1][0]
    && value[0][1] === value[value.length - 1][1];
};

const hasFiniteCoordinateTree = (value: unknown): boolean => {
  if (isFinitePosition(value)) return true;
  return Array.isArray(value)
    && value.length > 0
    && value.every((child) => hasFiniteCoordinateTree(child));
};

/** Checks the minimum coordinate shape needed by OpenLayers' Snap segmenters. */
// @codescene(disable:"Complex Method", disable:"Complex Conditional", disable:"Overall Code Complexity")
const hasValidCoordinateShape = (feature: Feature<Geometry>): boolean => {
  const geometry = feature.getGeometry();
  if (!geometry) return false;

  try {
    const coordinates = (geometry as Geometry & { getCoordinates: () => unknown }).getCoordinates();
    switch (geometry.getType()) {
      case "Point":
        return isFinitePosition(coordinates);
      case "LineString":
        return Array.isArray(coordinates) && coordinates.length >= 2 && hasFiniteCoordinateTree(coordinates);
      case "Polygon":
        return Array.isArray(coordinates) && coordinates.length > 0
          && coordinates.every((ring) => isClosedRing(ring) && hasFiniteCoordinateTree(ring));
      case "MultiPoint":
        return Array.isArray(coordinates) && coordinates.length > 0 && hasFiniteCoordinateTree(coordinates);
      case "MultiLineString":
        return Array.isArray(coordinates) && coordinates.length > 0
          && coordinates.every((line) => Array.isArray(line) && line.length >= 2 && hasFiniteCoordinateTree(line));
      case "MultiPolygon":
        return Array.isArray(coordinates) && coordinates.length > 0
          && coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0
            && polygon.every((ring) => isClosedRing(ring) && hasFiniteCoordinateTree(ring)));
      case "GeometryCollection": {
        const collection = geometry as Geometry & { getGeometriesArray?: () => Geometry[] };
        return collection.getGeometriesArray?.().every((child) => {
          const childFeature = new Feature<Geometry>(child);
          return hasValidCoordinateShape(childFeature);
        }) ?? false;
      }
      default:
        return hasFiniteCoordinateTree(coordinates);
    }
  } catch {
    return false;
  }
};

/**
 * OpenLayers' Snap interaction assumes every indexed geometry has a finite,
 * non-empty extent and a usable coordinate shape. A malformed persisted or
 * derived feature can otherwise throw from inside Snap while VectorSource
 * dispatches its add event.
 */
const hasRenderableGeometry = (feature: Feature<Geometry>): boolean => {
  const geometry = feature.getGeometry();
  if (!geometry) {
    return false;
  }

  try {
    const extent = geometry.getExtent();
    return hasValidCoordinateShape(feature)
      && extent.length === 4
      && extent.every(Number.isFinite)
      && extent[0] <= extent[2]
      && extent[1] <= extent[3];
  } catch {
    return false;
  }
};

/** Reads a descriptor without allowing malformed geometry to reach OpenLayers. */
export const readRenderableFeatures = (
  read: () => Feature<Geometry> | Feature<Geometry>[],
): Feature<Geometry>[] | null => {
  try {
    const result = read();
    const parsedFeatures = Array.isArray(result) ? result : [result];
    return parsedFeatures.length > 0 && parsedFeatures.every(hasRenderableGeometry)
      ? parsedFeatures
      : null;
  } catch {
    return null;
  }
};
