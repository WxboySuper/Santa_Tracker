jest.setTimeout(20000);

type ForecastCycle = {
  days: Record<number, {
    day: number;
    metadata: Record<string, unknown>;
    data: { categorical: Map<string, unknown[]> };
    discussion?: { text: string };
  }>;
  currentDay: number;
  cycleDate: string;
};

type BlobUrlHelpers = typeof URL & {
  createObjectURL: jest.Mock<string, [Blob]>;
  revokeObjectURL: jest.Mock<void, [string]>;
};

const discussion = {
  mode: 'diy' as const,
  validStart: '2026-04-21T00:00',
  validEnd: '2026-04-22T00:00',
  forecasterName: 'E2E',
  diyContent: 'Discussion content',
  lastModified: '2026-04-21T00:00:00.000Z',
};

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

describe('fileUtils extra', () => {
  test('cloneForecastCycle produces deep clone', async () => {
    jest.resetModules();
    const { cloneForecastCycle } = await import('./fileUtils');

    const original: ForecastCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt: '', lastModified: '', lowProbabilityOutlooks: [] },
          data: { categorical: new Map([['TSTM', [{ type: 'Feature' }]]]) }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    };

    const copy = cloneForecastCycle(original);
    expect(copy).not.toBe(original);
    expect(copy.days[1]).not.toBe(original.days[1]);
    expect(copy.days[1].data.categorical instanceof Map).toBe(true);
  });

  test('exportForecastToJson creates and clicks download link', async () => {
    jest.resetModules();
    const { exportForecastToJson } = await import('./fileUtils');

    const clickMock = jest.fn();
    const originalCreate = document.createElement.bind(document);
    const createdLink = originalCreate('a') as HTMLAnchorElement;
    createdLink.click = clickMock as () => void;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : originalCreate(tagName));

    const urlHelpers = Object.assign((globalThis.URL || URL) as URL, {
      createObjectURL: jest.fn(() => 'blob:url'),
      revokeObjectURL: jest.fn()
    }) as BlobUrlHelpers;
    globalThis.URL = urlHelpers;

    const forecast: ForecastCycle = { days: { 1: { day: 1, metadata: {}, data: { categorical: new Map() } } }, currentDay: 1, cycleDate: '2026-04-21' };

    exportForecastToJson(forecast, { center: [0, 0], zoom: 0 });

    expect(clickMock).toHaveBeenCalled();
    expect(urlHelpers.createObjectURL).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('createUniqueDiscussionEntryName sanitizes paths and preserves colliding entries', async () => {
    jest.resetModules();
    const { createUniqueDiscussionEntryName } = await import('./fileUtils');
    const used = new Set<string>(['forecast_cycle.json']);

    expect(createUniqueDiscussionEntryName('../day 1', used)).toBe('discussion_day-1.txt');
    expect(createUniqueDiscussionEntryName('day/1', used)).toBe('discussion_day-1-2.txt');
    expect(createUniqueDiscussionEntryName('day 1', used)).toBe('discussion_day-1-3.txt');
  });

  test('downloadGfcPackage retains legacy discussions when persisted grouping data is malformed', async () => {
    jest.resetModules();
    let generatedFiles: Record<string, string> = {};

    jest.doMock('jszip', () => {
      return class MockJSZip {
        files: Record<string, string> = {};
        file(name: string, content: string) { this.files[name] = content; }
        generateAsync(_opts: unknown) {
          generatedFiles = this.files;
          return Promise.resolve(new Blob([JSON.stringify(this.files)]));
        }
      };
    });
    jest.doMock('./discussionUtils', () => ({ compileDiscussionToText: (_discussion: unknown, day: number) => `Discussion ${day}` }));

    const { downloadGfcPackage } = await import('./fileUtils');
    const forecast = {
      days: {
        1: { day: 1, metadata: {}, data: { categorical: new Map() }, discussion },
        2: { day: 2, metadata: {}, data: { categorical: new Map() }, discussion },
      },
      currentDay: 1,
      cycleDate: '2026-04-21',
      discussionGroupings: [{ id: 'bad', label: ' ', days: [1, 2], discussionDay: 9 }],
    } as unknown as ForecastCycle;

    await downloadGfcPackage(forecast, { center: [0, 0], zoom: 0 });

    expect(Object.keys(generatedFiles).sort()).toEqual([
      'discussion_day1.txt',
      'discussion_day2.txt',
      'forecast_cycle.json',
      'workflow_package.json',
    ]);
  });

  test('downloadGfcPackage zips one workflow-ready forecast JSON with discussions', async () => {
    jest.resetModules();
    let generatedFiles: Record<string, string> = {};

    jest.doMock('jszip', () => {
      return class MockJSZip {
        files: Record<string, string> = {};
        file(name: string, content: string) { this.files[name] = content; }
        generateAsync(_opts: unknown) {
          generatedFiles = this.files;
          return Promise.resolve(new Blob([JSON.stringify(this.files)]));
        }
      };
    });

    jest.doMock('./discussionUtils', () => ({ compileDiscussionToText: (_discussion: unknown, day: number) => `Discussion ${day}` }));

    const { downloadGfcPackage } = await import('./fileUtils');

    const clickMock = jest.fn();
    const originalCreate = document.createElement.bind(document);
    const createdLink = originalCreate('a') as HTMLAnchorElement;
    createdLink.click = clickMock as () => void;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : originalCreate(tagName));

    const urlHelpers = Object.assign((globalThis.URL || URL) as URL, {
      createObjectURL: jest.fn(() => 'blob:url'),
      revokeObjectURL: jest.fn()
    }) as BlobUrlHelpers;
    globalThis.URL = urlHelpers;

    const forecast: ForecastCycle = { days: { 1: { day: 1, metadata: {}, data: { categorical: new Map() }, discussion } }, currentDay: 1, cycleDate: '2026-04-21' };

    await downloadGfcPackage(forecast, { center: [0, 0], zoom: 0 });

    expect(clickMock).toHaveBeenCalled();
    expect(urlHelpers.createObjectURL).toHaveBeenCalled();
    expect(Object.keys(generatedFiles).sort()).toEqual(['discussion_day1.txt', 'forecast_cycle.json', 'workflow_package.json']);
    expect(generatedFiles['workflow_package.json']).toBeDefined();
    spy.mockRestore();
  });
});
