import * as turf from '@turf/turf';
import { buildLandMask } from './buildLandMask';
import { trimOutlookDataInPlace } from './trimOutlookData';
import { loadVendoredBoundaryGeoBundle } from './loadVendoredBoundaryGeoBundle';
import type { OutlookData } from '../../types/outlooks';

describe('trimOutlookDataInPlace', () => {
  const boundaries = loadVendoredBoundaryGeoBundle();
  const landMask = buildLandMask('us-country-minus-great-lakes', boundaries);

  test('skips auto-generated categorical polygons', () => {
    if (!landMask) {
      throw new Error('Expected land mask');
    }

    const outlookData = {
      categorical: new Map([
        [
          'SLGT',
          [
            {
              type: 'Feature',
              id: 'auto-cat',
              geometry: turf.polygon([
                [
                  [-90, 28],
                  [-88, 28],
                  [-88, 30],
                  [-90, 30],
                  [-90, 28],
                ],
              ]).geometry,
              properties: {
                outlookType: 'categorical',
                probability: 'SLGT',
                isSignificant: false,
                derivedFrom: 'auto-generated',
              },
            },
          ],
        ],
      ]),
      tornado: new Map([
        [
          '5%',
          [
            {
              type: 'Feature',
              id: 'manual',
              geometry: turf.polygon([
                [
                  [-90, 28],
                  [-88, 28],
                  [-88, 30],
                  [-90, 30],
                  [-90, 28],
                ],
              ]).geometry,
              properties: {
                outlookType: 'tornado',
                probability: '5%',
                isSignificant: false,
              },
            },
          ],
        ],
      ]),
    };

    const result = trimOutlookDataInPlace(
      outlookData as unknown as OutlookData,
      landMask,
      'us-country-minus-great-lakes',
    );
    expect(result.skippedCount).toBe(1);
    expect(result.trimmedCount).toBe(1);
    expect(outlookData.categorical?.get('SLGT')?.[0].id).toBe('auto-cat');
  });

  test('removes a polygon with no land intersection', () => {
    const outlookData = {
      tornado: new Map([
        ['2%', [{
          type: 'Feature',
          id: 'offshore',
          geometry: turf.polygon([[
            [-80, 10], [-79, 10], [-79, 11], [-80, 11], [-80, 10],
          ]]).geometry,
          properties: { outlookType: 'tornado', probability: '2%' },
        }]],
      ]),
    };

    const result = trimOutlookDataInPlace(
      outlookData as unknown as OutlookData,
      landMask!,
      'us-country-minus-great-lakes',
    );

    expect(result.removedCount).toBe(1);
    expect(outlookData.tornado?.has('2%')).toBe(false);
  });
});
