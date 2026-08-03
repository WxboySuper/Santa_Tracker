import { renderHook } from '@testing-library/react';
import type { WmsLayerConfig } from '../wms';
import * as monitorMapLayerUtils from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorRadarWmsSync } from './useMonitorRadarWmsSync';
import { useMonitorSatelliteWmsSync } from './useMonitorSatelliteWmsSync';

jest.mock('./monitorMapLayerUtils', () => ({
  applyWmsLayer: jest.fn(),
  buildWmsParams: jest.fn(() => ({ LAYERS: 'layer', TILED: true })),
}));

describe('Monitor WMS theme sync', () => {
  const satelliteLayer: WmsLayerConfig = {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_visible_imagery',
    latestTime: '2026-06-02T12:00:00Z',
  };

  const radarLayer: WmsLayerConfig = {
    url: 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows',
    layer: 'conus_bref_qcd',
    latestTime: '2026-06-02T12:00:00Z',
  };

  const tileLayer = { setVisible: jest.fn(), getSource: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-applies the satellite WMS layer when dark mode toggles', () => {
    const refs = {
      satelliteLayerRef: { current: tileLayer },
      satelliteLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ darkMode }) => useMonitorSatelliteWmsSync(satelliteLayer, 0.68, refs, darkMode),
      { initialProps: { darkMode: false } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ darkMode: true });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });

  it('re-applies the radar WMS layer when dark mode toggles', () => {
    const refs = {
      radarLayerRef: { current: tileLayer },
      radarLayerKeyRef: { current: null },
    } as unknown as ReturnType<typeof useMonitorMapRefs>;

    const { rerender } = renderHook(
      ({ darkMode }) => useMonitorRadarWmsSync(radarLayer, 0.72, refs, darkMode),
      { initialProps: { darkMode: false } },
    );

    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(1);

    rerender({ darkMode: true });
    expect(monitorMapLayerUtils.applyWmsLayer).toHaveBeenCalledTimes(2);
  });
});
