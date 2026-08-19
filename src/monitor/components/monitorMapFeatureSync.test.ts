import VectorSource from 'ol/source/Vector';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';
import {
  syncAlertFeatures,
  syncMesoscaleDiscussionFeatures,
  syncOutlookFeatures,
  syncStormReportFeatures,
} from './monitorMapFeatureSync';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';

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

  test('skips rebuilding for the same collection reference', () => {
    const source = new VectorSource();
    const collection = makeCollection('Stable discussion');
    const clearSpy = jest.spyOn(source, 'clear');

    syncMesoscaleDiscussionFeatures(source, collection);
    const firstFeature = source.getFeatures()[0];
    syncMesoscaleDiscussionFeatures(source, collection);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(source.getFeatures()[0]).toBe(firstFeature);
  });

  test('keeps the same collection reference independent per source', () => {
    const firstSource = new VectorSource();
    const secondSource = new VectorSource();
    const collection = makeCollection('Shared collection');

    syncMesoscaleDiscussionFeatures(firstSource, collection);
    syncMesoscaleDiscussionFeatures(secondSource, collection);

    expect(firstSource.getFeatures()).toHaveLength(1);
    expect(secondSource.getFeatures()).toHaveLength(1);
  });

  test.each([
    ['outlooks', syncOutlookFeatures, []],
    ['alerts', syncAlertFeatures, { type: 'FeatureCollection', features: [] } as NwsAlertFeatureCollection],
    ['storm reports', syncStormReportFeatures, []],
  ])('skips repeated %s reconciliation for the same input reference', (_name, sync, input) => {
    const source = new VectorSource();
    const clearSpy = jest.spyOn(source, 'clear');

    (sync as (source: VectorSource, input: never) => void)(source, input as never);
    (sync as (source: VectorSource, input: never) => void)(source, input as never);

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
