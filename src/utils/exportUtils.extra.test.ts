jest.setTimeout(10000);

afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis as typeof globalThis & { fetch?: unknown }, 'fetch');
});

describe('exportUtils additional unit tests', () => {
  type MapWithLifecycle = {
    getContainer?: () => HTMLElement;
    once: (event: string, cb: () => void) => void;
    added?: unknown[];
  };

  test('waitForMapSettleGeneric resolves for Leaflet-like map', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { waitForMapSettleGeneric } = await import('./exportUtils');

    const fakeLeafletMap: MapWithLifecycle = {
      getContainer: () => document.createElement('div'),
      getBounds: () => ({ /* bounds placeholder */ }),
      once: (event: string, cb: () => void) => { cb(); }
    };

    await expect(waitForMapSettleGeneric(fakeLeafletMap as never, 500)).resolves.toBeUndefined();
  });

  test('waitForMapSettleGeneric resolves for non-Leaflet map with rendercomplete', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { waitForMapSettleGeneric } = await import('./exportUtils');

    const fake: MapWithLifecycle = {
      once: (event: string, cb: () => void) => setTimeout(cb, 10)
    };

    await expect(waitForMapSettleGeneric(fake as never, 500)).resolves.toBeUndefined();
  });

  test('waitForImagesLoaded resolves when images load', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { waitForImagesLoaded } = await import('./exportUtils');

    const root = document.createElement('div');
    const img1 = document.createElement('img');
    const img2 = document.createElement('img');
    root.appendChild(img1);
    root.appendChild(img2);

    // Dispatch loads asynchronously to simulate network
    setTimeout(() => img1.dispatchEvent(new Event('load')), 10);
    setTimeout(() => img2.dispatchEvent(new Event('load')), 20);

    const res = await waitForImagesLoaded(root, 500);
    expect(res.timedOut).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('waitForImagesLoaded times out when images do not load', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { waitForImagesLoaded } = await import('./exportUtils');

    const root = document.createElement('div');
    const img = document.createElement('img');
    // Force complete=false so the loader will wait and time out in jsdom
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    root.appendChild(img);

    const res = await waitForImagesLoaded(root, 30);
    expect(res.timedOut).toBe(true);
    expect(res.remaining).toBeGreaterThan(0);
  });

  test('cloneLegendAndStatusOverlays copies legend into export container', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { cloneLegendAndStatusOverlays } = await import('./exportUtils');

    const exportContainer = document.createElement('div');
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.textContent = 'Legend here';

    const sourceContainer = document.createElement('div');
    sourceContainer.className = 'map-container';
    sourceContainer.appendChild(legend);

    const fakeMap = { getContainer: () => sourceContainer };

    cloneLegendAndStatusOverlays(fakeMap as never, exportContainer);

    const appended = exportContainer.querySelector('.map-legend');
    expect(appended).toBeTruthy();
    expect((appended as HTMLElement | null)?.textContent).toBe('Legend here');
  });

  test('getExportRootAndSize returns parent map container and sizes', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { getExportRootAndSize } = await import('./exportUtils');

    const mapContainer = document.createElement('div');
    const outer = document.createElement('div');
    outer.className = 'map-container';
    outer.appendChild(mapContainer);
    document.body.appendChild(outer);

    // jsdom doesn't compute layout; fake clientWidth/Height
    Object.defineProperty(mapContainer, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(mapContainer, 'clientHeight', { value: 150, configurable: true });

    const mapLike = { getContainer: () => mapContainer };
    const res = getExportRootAndSize(mapLike as never);
    expect(res.exportRoot).toBe(outer);
    expect(res.width).toBe(200);
    expect(res.height).toBe(150);

    document.body.removeChild(outer);
  });

  test('buildCloneCallback hides controls and adds overlays', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));
    const { buildCloneCallback } = await import('./exportUtils');

    const clonedRoot = document.createElement('div');
    const ctrl = document.createElement('div');
    ctrl.className = 'leaflet-control-container';
    clonedRoot.appendChild(ctrl);

    const legend = document.createElement('div');
    legend.className = 'map-legend';
    clonedRoot.appendChild(legend);

    const cb = buildCloneCallback('MyTitle', true, 'StatusText', 'Unofficial');
    cb(clonedRoot);

    // original control should be hidden
    expect((ctrl as HTMLElement).style.display).toBe('none');
    // overlays/footer should have been added; look for known footer text
    expect(clonedRoot.textContent).toContain('Created with Graphical Forecast Creator');
  });
});
