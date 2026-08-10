import VectorSource from 'ol/source/Vector';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';
import { syncMesoscaleDiscussionFeatures } from './monitorMapFeatureSync';

const makeCollection = (label: string): MonitorMesoscaleDiscussionCollection => ({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    properties: { label, productNumber: '0001' },
  }],
});

describe('syncMesoscaleDiscussionFeatures', () => {
  test('reconciles the OpenLayers source with the latest normalized collection', () => {
    const source = new VectorSource();

    syncMesoscaleDiscussionFeatures(source, makeCollection('First discussion'));
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0].get('label')).toBe('First discussion');
    expect(source.getFeatures()[0].get('monitorReferenceLayer')).toBe('spc-mesoscale-discussion');

    syncMesoscaleDiscussionFeatures(source, makeCollection('Replacement discussion'));
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0].get('label')).toBe('Replacement discussion');
  });

  test('clears the source when the provider returns no active discussions', () => {
    const source = new VectorSource();

    syncMesoscaleDiscussionFeatures(source, makeCollection('Active discussion'));
    syncMesoscaleDiscussionFeatures(source, { type: 'FeatureCollection', features: [] });

    expect(source.getFeatures()).toHaveLength(0);
  });
});
