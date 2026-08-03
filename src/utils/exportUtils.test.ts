jest.mock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
jest.mock('html2canvas', () => jest.fn(() => Promise.resolve({ toDataURL: () => 'data:image/png;base64,FAKE' })));

import { 
  downloadDataUrl,
  getFormattedDate,
  exportMapAsImage,
  getExportContainer,
  getExportRootAndSize,
  createTempContainer,
  waitForImagesLoaded,
  hideElementsInClone,
  sortProbabilities,
  captureContainer,
} from './exportUtils';

describe('exportUtils', () => {
  type MapContainerLike = {
    getContainer?: () => HTMLElement;
    getTargetElement?: () => HTMLElement;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getFormattedDate returns YYYY-MM-DD HH:MM', () => {
    const result = getFormattedDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test('getExportContainer supports getContainer and getTargetElement', () => {
    const el = document.createElement('div');
    const mapA: MapContainerLike = { getContainer: () => el };
    expect(getExportContainer(mapA)).toBe(el);

    const el2 = document.createElement('div');
    const mapB: MapContainerLike = { getTargetElement: () => el2 };
    expect(getExportContainer(mapB)).toBe(el2);

    expect(getExportContainer({} as never)).toBeNull();
  });

  test('getExportRootAndSize errors when no container', () => {
    expect(() => getExportRootAndSize({} as never)).toThrow('Map container not available for export.');
  });

  test('getExportRootAndSize uses the OpenLayers viewport dimensions within the map export root', () => {
    const exportRoot = document.createElement('div');
    exportRoot.className = 'map-container';
    const mapContainer = document.createElement('div');
    const viewport = document.createElement('div');
    viewport.className = 'ol-viewport';
    Object.defineProperties(mapContainer, { clientWidth: { value: 960 }, clientHeight: { value: 680 } });
    Object.defineProperties(viewport, { clientWidth: { value: 960 }, clientHeight: { value: 640 } });
    mapContainer.appendChild(viewport);
    exportRoot.appendChild(mapContainer);
    document.body.appendChild(exportRoot);

    expect(getExportRootAndSize({ getTargetElement: () => mapContainer })).toMatchObject({
      mapContainer,
      exportRoot,
      width: 960,
      height: 640,
    });

    exportRoot.remove();
  });

  test('createTempContainer appends and sets size', () => {
    const temp = createTempContainer(120, 80);
    expect(document.body.contains(temp)).toBe(true);
    expect(temp.style.width).toContain('120px');
    expect(temp.style.height).toContain('80px');
    // cleanup
    if (temp.parentNode) {
      temp.parentNode.removeChild(temp);
    }
  });

  test('waitForImagesLoaded handles no images quickly', async () => {
    const root = document.createElement('div');
    const res = await waitForImagesLoaded(root, 200);
    expect(res.timedOut).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('hideElementsInClone hides selectors', () => {
    const root = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'to-hide';
    root.appendChild(child);
    hideElementsInClone(root, ['.to-hide']);
    expect((child as HTMLElement).style.display).toBe('none');
  });

  test('sortProbabilities ordering', () => {
    const entries: Array<[string, unknown[]]> = [['30%', []], ['TSTM', []], ['CIG1', []], ['5%', []]];
    const sorted = sortProbabilities(entries);
    expect(sorted.map(([probability]) => probability)).toEqual(['TSTM', '5%', '30%', 'CIG1']);
  });

  test('captureContainer returns data URL via html2canvas mock', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dataUrl = await captureContainer(container, 100, 100, 'png', 0.9);
    expect(dataUrl).toBe('data:image/png;base64,FAKE');
    document.body.removeChild(container);
  });

  test('downloadDataUrl creates anchor and clicks', () => {
    const clickMock = jest.fn();
    const createdLink = { href: '', download: '', click: clickMock } as unknown as HTMLAnchorElement;
    const orig = document.createElement.bind(document);
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'a' ? createdLink as unknown as HTMLElement : orig(tagName));
    downloadDataUrl('data:image/png;base64,ABC', 'f.png');
    expect(createdLink.href).toBe('data:image/png;base64,ABC');
    expect(createdLink.download).toBe('f.png');
    expect(clickMock).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('exportMapAsImage rejects when map container missing', async () => {
    await expect(exportMapAsImage({} as never, {} as never)).rejects.toThrow('Map container not available for export.');
  });
});
