import { buildWorkflowExportPackage, isWorkflowExportPackage, toSerializedWorkflowPackage } from './workflowPackage';

afterEach(() => jest.restoreAllMocks());

const cycle = {
  days: { 1: { day: 1, data: { categorical: new Map([['TSTM', []]]) }, metadata: { issueDate: '2026-07-15', validDate: '2026-07-15', issuanceTime: '0600', createdAt: '2026-07-15T00:00:00.000Z', lastModified: '2026-07-15T00:00:00.000Z' } } },
  currentDay: 1,
  cycleDate: '2026-07-15',
} as never;

const metadata = {
  id: 'WF-severe-2026-07-15', workflowId: 'severe-day1', cycleDate: '2026-07-15', status: 'in-progress',
  outlookVersions: [{ version: 1, status: 'in-progress', createdAt: '2026-07-15T00:00:00.000Z' }],
  createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
} as never;

test.each(['workflow', 'cycle'] as const)('builds a discriminated %s package', (scope) => {
  const pkg = buildWorkflowExportPackage({ scope, forecast: { version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z', forecastCycle: cycle }, cycleMetadata: metadata, exportedAt: '2026-07-15T12:00:00.000Z' });
  expect(pkg.packageType).toBe(scope);
  expect(isWorkflowExportPackage(pkg)).toBe(true);
  expect(pkg.exportedAt).toBe('2026-07-15T12:00:00.000Z');
  expect(pkg.cycleMetadata).toEqual(metadata);
});

test('converts packages into the existing v2 serialized package contract', () => {
  const pkg = buildWorkflowExportPackage({ scope: 'cycle', forecast: { version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z', forecastCycle: cycle }, cycleMetadata: metadata });
  expect(toSerializedWorkflowPackage(pkg)?.cycles[0].id).toBe(metadata.id);
  expect(toSerializedWorkflowPackage(pkg)?.metadata.workflowId).toBe(metadata.workflowId);
});

test('attaches custom geometry and appearance to its workflow grouping with compatibility disclosure', () => {
  const customLayers = {
    schemaVersion: '1.0.0',
    layers: [{
      schemaVersion: '1.0.0', id: 'layer-1', label: 'Fire weather', order: 0,
      categories: [{ id: 'cat-1', label: 'Critical', order: 0, style: { fillColor: '#ef4444', fillOpacity: .6, strokeColor: '#123456', strokeOpacity: .4, strokeWidth: 4, hatch: 'crosshatch' } }],
      features: [{ type: 'Feature', id: 'feature-1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { customLayerId: 'layer-1', categoryId: 'cat-1', title: 'Critical' } }],
      createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
    }],
  };
  const forecast = {
    version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z',
    forecastCycle: { ...cycle, days: { 1: { ...cycle.days[1], customLayers } } },
  } as never;
  const pkg = buildWorkflowExportPackage({ scope: 'workflow', forecast, cycleMetadata: metadata });
  const serialized = toSerializedWorkflowPackage(pkg)!;

  expect(pkg.customContent).toEqual({ included: true, severeAnalytics: 'excluded', autoCategorical: 'excluded' });
  expect(serialized.metadata.includesStyleSnapshots).toBe(true);
  expect(serialized.cycles[0].groupings).toEqual([{ grouping: 'day1', day: 1 }]);
  expect(serialized.cycles[0].groupingData['day1-day1-v1'].customLayers).toEqual(customLayers);
});

test('does not attach custom content to workflow groupings outside the local feature gate', () => {
  jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);
  const forecast = {
    version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z',
    forecastCycle: {
      ...cycle,
      days: { 1: { ...cycle.days[1], customLayers: { schemaVersion: '1.0.0', layers: [{ id: 'hidden' }] } } },
    },
  } as never;
  const pkg = buildWorkflowExportPackage({ scope: 'workflow', forecast, cycleMetadata: metadata });
  const serialized = toSerializedWorkflowPackage(pkg)!;

  expect(pkg.customContent).toBeUndefined();
  expect(serialized.metadata.includesStyleSnapshots).toBe(false);
  expect(serialized.cycles[0].groupingData['day1-day1-v1'].customLayers).toBeUndefined();
});

test('rejects lookalike packages with missing export markers', () => {
  expect(isWorkflowExportPackage({ forecast: {} })).toBe(false);
});

test('fails closed when a workflow template is unknown', () => {
  expect(() => buildWorkflowExportPackage({
    scope: 'workflow',
    forecast: { version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z', forecastCycle: cycle },
    cycleMetadata: { ...metadata, workflowId: 'retired-workflow' },
})).toThrow('Unknown workflow template');
});

test('requires metadata for a workflow-scoped export', () => {
  expect(() => buildWorkflowExportPackage({
    scope: 'workflow',
    forecast: { version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z', forecastCycle: cycle },
  })).toThrow('Workflow export requires workflow metadata');
});
