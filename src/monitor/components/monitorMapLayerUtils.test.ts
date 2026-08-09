import {
  ALERTS_LAYER_Z_INDEX,
  MONITOR_LAYER_Z_ORDER,
  NDFD_REFERENCE_LAYER_Z_INDEX,
  OUTLOOK_LAYER_Z_INDEX,
  SPC_REFERENCE_LAYER_Z_INDEX,
  STATE_OUTLINE_LAYER_Z_INDEX,
  STORM_REPORTS_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  createMesoscaleDiscussionStyle,
} from './monitorMapLayerUtils';

describe('monitor reference layer order', () => {
  test('keeps official references below alerts and user overlays', () => {
    expect(MONITOR_LAYER_Z_ORDER).toEqual({
      ndfdTemperature: NDFD_REFERENCE_LAYER_Z_INDEX,
      spcMesoscaleDiscussion: SPC_REFERENCE_LAYER_Z_INDEX,
      alerts: ALERTS_LAYER_Z_INDEX,
      outlook: OUTLOOK_LAYER_Z_INDEX,
      stateOutlines: STATE_OUTLINE_LAYER_Z_INDEX,
      stormReports: STORM_REPORTS_LAYER_Z_INDEX,
      mapReferenceControls: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });
    expect(NDFD_REFERENCE_LAYER_Z_INDEX).toBeLessThan(SPC_REFERENCE_LAYER_Z_INDEX);
    expect(SPC_REFERENCE_LAYER_Z_INDEX).toBeLessThan(ALERTS_LAYER_Z_INDEX);
    expect(ALERTS_LAYER_Z_INDEX).toBeLessThan(OUTLOOK_LAYER_Z_INDEX);
    expect(OUTLOOK_LAYER_Z_INDEX).toBeLessThan(STATE_OUTLINE_LAYER_Z_INDEX);
    expect(STATE_OUTLINE_LAYER_Z_INDEX).toBeLessThan(STORM_REPORTS_LAYER_Z_INDEX);
    expect(STORM_REPORTS_LAYER_Z_INDEX).toBeLessThan(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);
  });

  test('uses the same stable z-index for mesoscale discussion polygons', () => {
    expect(createMesoscaleDiscussionStyle().getZIndex()).toBe(SPC_REFERENCE_LAYER_Z_INDEX);
  });
});
