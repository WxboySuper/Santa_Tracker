import type { Feature, Polygon } from 'geojson';
import {
  cloneGeometryAsFeature,
  copyOutlookGeometry,
  countCopyableSourceFeatures,
  getCopyableProbabilityKeys,
  isProbabilisticHazardType,
} from './outlookGeometryCopy';

const createPolygon = (offset: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[
    [offset, offset],
    [offset + 1, offset],
    [offset + 1, offset + 1],
    [offset, offset + 1],
    [offset, offset],
  ]],
});

const createFeature = (
  id: string,
  outlookType: 'tornado' | 'wind' | 'hail',
  probability: string,
  offset: number,
): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: {
    outlookType,
    probability,
    isSignificant: false,
  },
});

describe('outlookGeometryCopy', () => {
  it('identifies probabilistic hazard types', () => {
    expect(isProbabilisticHazardType('tornado')).toBe(true);
    expect(isProbabilisticHazardType('categorical')).toBe(false);
  });

  it('returns only probability keys valid for both hazards', () => {
    const keys = getCopyableProbabilityKeys('tornado', 'wind', 1);
    expect(keys).toContain('15%');
    expect(keys).not.toContain('2%');
    expect(keys).not.toContain('75%');
    expect(keys).toContain('CIG2');
  });

  it('excludes CIG3 when copying wind geometry to hail', () => {
    const keys = getCopyableProbabilityKeys('wind', 'hail', 1);
    expect(keys).toContain('CIG2');
    expect(keys).not.toContain('CIG3');
  });

  it('clones geometry with new ids and target metadata', () => {
    const source = createFeature('source-1', 'wind', '15%', 0);
    const cloned = cloneGeometryAsFeature(source, 'tornado', '15%');

    expect(cloned.id).not.toBe('source-1');
    expect(cloned.geometry).toEqual(source.geometry);
    expect(cloned.geometry).not.toBe(source.geometry);
    expect(cloned.properties).toMatchObject({
      outlookType: 'tornado',
      probability: '15%',
      derivedFrom: 'geometry-copy:wind',
    });
  });

  it('assigns the same id when the same feature is copied again', () => {
    const source = createFeature('source-1', 'wind', '15%', 0);

    expect(cloneGeometryAsFeature(source, 'tornado', '15%')).toEqual(
      cloneGeometryAsFeature(source, 'tornado', '15%'),
    );
  });

  it('replaces the full target hazard map when copying all geometry', () => {
    const sourceMap = new Map([
      ['15%', [createFeature('wind-15', 'wind', '15%', 0)]],
      ['30%', [createFeature('wind-30', 'wind', '30%', 1)]],
    ]);
    const targetMap = new Map([
      ['5%', [createFeature('tornado-5', 'tornado', '5%', 2)]],
    ]);

    const result = copyOutlookGeometry(sourceMap, targetMap, {
      sourceType: 'wind',
      targetType: 'tornado',
      mode: 'replace',
    }, 1);

    expect(result.copiedFeatureCount).toBe(2);
    expect(targetMap.has('5%')).toBe(false);
    expect(targetMap.get('15%')?.[0].properties?.outlookType).toBe('tornado');
    expect(targetMap.get('30%')?.[0].id).not.toBe('wind-30');
  });

  it('replaces only one probability bucket when filtered', () => {
    const sourceMap = new Map([
      ['15%', [createFeature('wind-15', 'wind', '15%', 0)]],
      ['30%', [createFeature('wind-30', 'wind', '30%', 1)]],
    ]);
    const targetMap = new Map([
      ['15%', [createFeature('tornado-15-old', 'tornado', '15%', 2)]],
      ['30%', [createFeature('tornado-30', 'tornado', '30%', 3)]],
    ]);

    const result = copyOutlookGeometry(sourceMap, targetMap, {
      sourceType: 'wind',
      targetType: 'tornado',
      mode: 'replace',
      probabilityFilter: '15%',
    }, 1);

    expect(result.copiedFeatureCount).toBe(1);
    expect(targetMap.get('15%')?.[0].id).not.toBe('tornado-15-old');
    expect(targetMap.get('30%')?.[0].id).toBe('tornado-30');
  });

  it('counts copyable source features for the active probability', () => {
    const sourceMap = new Map([
      ['2%', [createFeature('tornado-2', 'tornado', '2%', 0)]],
      ['15%', [createFeature('tornado-15', 'tornado', '15%', 1)]],
    ]);

    const count = (probabilityFilter?: string) => countCopyableSourceFeatures({
      sourceMap,
      sourceType: 'tornado',
      targetType: 'wind',
      day: 1,
      probabilityFilter,
    });

    expect(count()).toBe(1);
    expect(count('2%')).toBe(0);
    expect(count('15%')).toBe(1);
  });
});
