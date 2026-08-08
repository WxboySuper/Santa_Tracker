jest.setTimeout(10000);

afterEach(() => {
  jest.resetAllMocks();
});

describe('renderOutlooksToMap', () => {
  type LeafletGeoJsonFeature = {
    type: string;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: number[][][] };
  };

  test('renders geoJSON features onto map using mocked leaflet.geoJSON', async () => {
    jest.resetModules();

    // Mock leaflet.geoJSON to provide an addTo that records additions
    jest.doMock('leaflet', () => ({
      geoJSON: (feature: LeafletGeoJsonFeature, opts: { style?: () => unknown }) => ({
        addTo: (map: { added?: unknown[] }) => {
          map.added = map.added || [];
          map.added.push({ feature, opts, style: opts && typeof opts.style === 'function' ? opts.style() : null });
          return { };
        }
      })
    }));

    // Mock color mappings to keep getFeatureStyle predictable
    jest.doMock('./outlookUtils', () => ({
      colorMappings: {
        categorical: { '5%': '#00ff00' },
        tornado: {},
        wind: {},
        hail: {},
        totalSevere: {},
        'day4-8': {},
        hatching: {}
      }
    }));

    const { renderOutlooksToMap } = await import('./exportUtils');

    const mapInstance: { added?: unknown[] } = {};

    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0,0],[0,1],[1,1],[1,0],[0,0]]] }
    };

    const outlooks = { categorical: new Map([['5%', [feature]]]) };

    renderOutlooksToMap(mapInstance, outlooks);

    expect(mapInstance.added).toBeTruthy();
    expect(mapInstance.added.length).toBeGreaterThan(0);
    expect((mapInstance.added[0] as { feature: typeof feature }).feature).toBe(feature);
  });

  test('applies the selected built-in outlook opacity to export styles', async () => {
    jest.resetModules();
    jest.doMock('leaflet', () => ({
      geoJSON: (_feature: unknown, opts: { style?: () => unknown }) => ({
        addTo: (map: { added?: unknown[] }) => {
          map.added = map.added || [];
          map.added.push(opts.style?.());
          return {};
        },
      }),
    }));
    const { renderOutlooksToMap } = await import('./exportUtils');
    const mapInstance: { added?: unknown[] } = {};
    const feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } };
    renderOutlooksToMap(mapInstance, { tornado: new Map([['30%', [feature]]]) }, { tornado: 0.35 });
    expect((mapInstance.added?.[0] as { fillOpacity: number }).fillOpacity).toBeCloseTo(0.14);
  });
});
