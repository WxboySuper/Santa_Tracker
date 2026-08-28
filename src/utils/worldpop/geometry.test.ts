import { polygon } from '@turf/turf';
import type { Feature } from 'geojson';
import { unionForecastPolygons } from './geometry';

describe('unionForecastPolygons', () => {
  test('returns null when no polygon features are present', () => {
    expect(
      unionForecastPolygons(
        [{ type: 'Feature', properties: {}, geometry: null } as unknown as Feature],
      ),
    ).toBeNull();
  });

  test('unions overlapping polygons into one geometry', () => {
    const result = unionForecastPolygons([
      polygon([[[-100, 35], [-99, 35], [-99, 36], [-100, 36], [-100, 35]]]),
      polygon([[[-99.5, 35], [-98.5, 35], [-98.5, 36], [-99.5, 36], [-99.5, 35]]]),
    ]);

    expect(result?.type).toBe('Polygon');
    if (result?.type === 'Polygon') {
      expect(result.coordinates[0].length).toBeGreaterThan(4);
    }
  });

  test('preserves a single polygon without unioning it', () => {
    const feature = polygon([[[-100, 35], [-99, 35], [-99, 36], [-100, 36], [-100, 35]]]);
    expect(unionForecastPolygons([feature])).toBe(feature.geometry);
  });

  test('accepts MultiPolygon geometry and ignores non-polygon features', () => {
    const multiPolygon: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[[ -100, 35 ], [ -99, 35 ], [ -99, 36 ], [ -100, 36 ], [ -100, 35 ]]]],
      },
    };
    const point: Feature = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-99, 35] } };

    expect(unionForecastPolygons([point, multiPolygon])).toEqual(multiPolygon.geometry);
  });
});
