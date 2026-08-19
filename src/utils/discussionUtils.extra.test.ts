import { compileDiscussionToText, exportDiscussionToFile } from './discussionUtils';

type Discussion = {
  mode: 'guided' | 'diy';
  guidedContent?: {
    synopsis?: string;
    meteorologicalSetup?: string;
    severeWeatherExpectations?: string;
    timing?: string;
    regionalBreakdown?: string;
    additionalConsiderations?: string;
  };
  diyContent?: string;
  validStart: string;
  validEnd: string;
  forecasterName: string;
};

type UrlWithBlobHelpers = typeof URL & {
  createObjectURL: jest.Mock<string, [Blob]>;
  revokeObjectURL: jest.Mock<void, [string]>;
};

describe('discussionUtils extra', () => {
  test('compile guided discussion includes all sections', () => {
    const discussion: Discussion = {
      mode: 'guided',
      guidedContent: {
        synopsis: 'SYN',
        meteorologicalSetup: 'SETUP',
        severeWeatherExpectations: 'EXPECT',
        timing: 'TIMING',
        regionalBreakdown: 'REGIONS',
        additionalConsiderations: 'CONSIDER'
      },
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Zoe'
    };

    const text = compileDiscussionToText(discussion, 4);
    expect(text).toContain('Synopsis:');
    expect(text).toContain('SYN');
    expect(text).toContain('Meteorological Setup:');
    expect(text).toContain('SETUP');
    expect(text).toContain('Severe Weather Expectations:');
    expect(text).toContain('EXPECT');
    expect(text).toContain('Timing:');
    expect(text).toContain('TIMING');
    expect(text).toContain('Regional Breakdown:');
    expect(text).toContain('REGIONS');
    expect(text).toContain('Additional Considerations:');
    expect(text).toContain('CONSIDER');
    expect(text).toContain('Forecaster: Zoe');
  });

  test('exportDiscussionToFile creates and clicks download link', async () => {
    const discussion: Discussion = {
      mode: 'diy',
      diyContent: 'txt',
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Zoe'
    };

    const origCreate = document.createElement.bind(document);
    const createdLink = origCreate('a') as HTMLAnchorElement;
    const clickMock = jest.fn();
    createdLink.click = clickMock as () => void;
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? (createdLink as unknown as HTMLElement) : origCreate(tagName));

    const urlHelpers = Object.assign((globalThis.URL || URL) as URL, {
      createObjectURL: jest.fn(() => 'blob:url'),
      revokeObjectURL: jest.fn()
    }) as UrlWithBlobHelpers;
    globalThis.URL = urlHelpers;

    exportDiscussionToFile(discussion, 3);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clickMock).toHaveBeenCalled();
    expect(urlHelpers.createObjectURL).toHaveBeenCalled();
    expect(urlHelpers.revokeObjectURL).toHaveBeenCalled();

    spy.mockRestore();
  });
});
