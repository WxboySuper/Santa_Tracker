import JSZip from 'jszip';
import type { Feature, Polygon } from 'geojson';
import type { ForecastCycle } from '../../types/outlooks';
import { buildStructuredKmlDocument } from '../kmzExport/buildKml';
import { detectForecastTransferFormat } from './detectFormat';
import { exportForecastTransfer, importForecastTransfer } from './index';
import { forecastCycleFromKmlPlacemarks, parseKmlDocument } from './parseKml';

const square = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: { outlookType: 'tornado', probability: '15%' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]]],
  },
});

const buildForecast = (): ForecastCycle => ({
  cycleDate: '2026-08-18',
  currentDay: 1,
  days: {
    1: {
      day: 1,
      metadata: {
        issueDate: '2026-08-18',
        validDate: '2026-08-19',
        issuanceTime: '1200',
        createdAt: '2026-08-18T12:00:00.000Z',
        lastModified: '2026-08-18T12:00:00.000Z',
        lowProbabilityOutlooks: [],
        outlookOpacities: { tornado: 0.5 },
      },
      data: {
        tornado: new Map([['15%', [square()]]]),
      },
    },
  },
});

describe('forecastTransfer', () => {
  test('detects supported transfer formats from file metadata', () => {
    expect(detectForecastTransferFormat(new File(['{}'], 'forecast.json', { type: 'application/json' }))).toBe('json');
    expect(detectForecastTransferFormat(new File([''], 'forecast.zip', { type: 'application/zip' }))).toBe('package');
    expect(detectForecastTransferFormat(new File(['<kml'], 'outlook.kml', { type: 'application/vnd.google-earth.kml+xml' }))).toBe('kml');
    expect(detectForecastTransferFormat(new File([''], 'outlook.kmz', { type: 'application/vnd.google-earth.kmz' }))).toBe('kmz');
    expect(detectForecastTransferFormat(new File([''], 'notes.txt', { type: 'text/plain' }))).toBeNull();
  });

  test('round-trips KML export into the GFC forecast schema', () => {
    const forecastCycle = buildForecast();
    const kml = buildStructuredKmlDocument({
      forecastCycle,
      options: { scope: 'current-day', day: 1, strategy: 'structured-kml' },
    });

    expect(kml).toContain('<Placemark>');
    expect(kml).toContain('<Polygon>');

    const { placemarks, warnings } = parseKmlDocument(kml, 1);
    expect(warnings).toEqual([]);
    expect(placemarks).toHaveLength(1);
    expect(placemarks[0]).toMatchObject({
      day: 1,
      outlookType: 'tornado',
      probabilityKey: '15%',
    });

    const importedCycle = forecastCycleFromKmlPlacemarks(placemarks);
    const importedFeatures = importedCycle.days[1]?.data.tornado?.get('15%');
    expect(importedFeatures).toHaveLength(1);
    expect(importedFeatures?.[0].geometry.type).toBe('Polygon');
  });

  test('imports KML files through importForecastTransfer', async () => {
    const forecastCycle = buildForecast();
    const kml = buildStructuredKmlDocument({
      forecastCycle,
      options: { scope: 'cycle', strategy: 'structured-kml' },
    });
    const file = new File([kml], 'day-1.kml', { type: 'application/vnd.google-earth.kml+xml' });
    file.arrayBuffer = async () => new TextEncoder().encode(kml).buffer;

    const result = await importForecastTransfer(file, {
      baseCycle: forecastCycle,
      defaultDay: 1,
    });

    expect(result.format).toBe('kml');
    expect(result.warnings).toEqual([]);
    expect(result.forecastCycle.days[1]?.data.tornado?.get('15%')).toHaveLength(2);
  });

  test('rejects KMZ files whose expanded KML exceeds the import limit', async () => {
    const zip = new JSZip();
    zip.file('doc.kml', `<kml>${'x'.repeat(10 * 1024 * 1024 + 1)}</kml>`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'oversized.kmz', { type: 'application/vnd.google-earth.kmz' });
    file.arrayBuffer = async () => buffer;

    await expect(importForecastTransfer(file)).rejects.toThrow('Expanded KML is too large');
  });

  test('does not treat CIG metadata as significant threat metadata', () => {
    const kml = `<kml><Document><Folder><name>Day 1</name></Folder><Placemark>
      <name>Tornado CIG2</name>
      <ExtendedData>
        <Data name="gfc_day"><value>1</value></Data>
        <Data name="gfc_outlook_type"><value>tornado</value></Data>
        <Data name="gfc_probability_key"><value>CIG2</value></Data>
        <Data name="gfc_significant"><value>false</value></Data>
        <Data name="gfc_cig"><value>CIG2</value></Data>
      </ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-98,34 -96,34 -96,36 -98,36 -98,34</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Document></kml>`;

    const { placemarks } = parseKmlDocument(kml, 1);
    expect(placemarks[0]?.isSignificant).toBe(false);
  });

  test('exports KML blobs through exportForecastTransfer', async () => {
    const forecastCycle = buildForecast();
    const click = jest.fn();
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    const appendChild = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChild = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const link = document.createElement('a');
    link.click = click;

    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return link;
      }
      return document.createElement(tagName);
    });
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    await exportForecastTransfer({
      format: 'kml',
      scope: 'current-day',
      forecastCycle,
      mapView: { center: [39.8, -98.5], zoom: 4 },
      day: 1,
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(link.download).toMatch(/gfc-day-1-.*\.kml$/);

    appendChild.mockRestore();
    removeChild.mockRestore();
    jest.restoreAllMocks();
  });
});
