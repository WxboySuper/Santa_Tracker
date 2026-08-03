import {
  getProductAnalyticsZone,
  initProductAnalytics,
  isProductAnalyticsEnabled,
  resetProductAnalyticsForTests,
  setProductAnalyticsEnabled,
  trackProductEvent,
  trackProductPageView,
} from './productAnalytics';

beforeEach(() => {
  Object.assign(globalThis, {
    __GFC_UMAMI_HOST__: 'https://telemetry.gfc.weatherboysuper.com',
    __GFC_UMAMI_PRODUCTION_WEBSITE_ID__: 'prod-zone',
    __GFC_UMAMI_BETA_WEBSITE_ID__: 'beta-zone',
  });
  localStorage.clear();
  resetProductAnalyticsForTests();
  Reflect.deleteProperty(window, 'umami');
});

test('keeps production, beta, and all other hosts in separate zones', () => {
  expect(getProductAnalyticsZone('gfc.weatherboysuper.com')).toBe('production');
  expect(getProductAnalyticsZone('beta-gfc.weatherboysuper.com')).toBe('beta');
  expect(getProductAnalyticsZone('localhost')).toBeNull();
});

test('does not load a tracker when the unified preference is disabled', () => {
  localStorage.setItem('gfc-analytics-enabled', 'false');
  initProductAnalytics('gfc.weatherboysuper.com');
  expect(document.querySelector('script[data-website-id]')).toBeNull();
  expect(isProductAnalyticsEnabled()).toBe(false);
});

test('does not load a tracker until the visitor explicitly enables analytics', () => {
  initProductAnalytics('gfc.weatherboysuper.com');
  expect(document.querySelector('script[data-website-id]')).toBeNull();
  expect(isProductAnalyticsEnabled()).toBe(false);
});

test('loads a privacy-minimized tracker only after explicit opt-in', () => {
  setProductAnalyticsEnabled(true);
  initProductAnalytics('gfc.weatherboysuper.com');

  const script = document.querySelector<HTMLScriptElement>('script[data-gfc-umami="true"]');
  expect(script).not.toBeNull();
  expect(script?.dataset.autoTrack).toBe('false');
  expect(script?.dataset.doNotTrack).toBe('true');
  expect(script?.dataset.excludeSearch).toBe('true');
  expect(script?.dataset.excludeHash).toBe('true');
});

test('preserves a prior explicit workflow opt-in until the unified preference is set', () => {
  localStorage.setItem('gfc-workflow-analytics-enabled', 'true');
  expect(isProductAnalyticsEnabled()).toBe(true);
  setProductAnalyticsEnabled(true);
  expect(isProductAnalyticsEnabled()).toBe(true);
});

test('loads the matching zone and normalizes page paths before tracking', () => {
  const track = jest.fn();
  window.umami = { track };
  setProductAnalyticsEnabled(true);
  initProductAnalytics('gfc.weatherboysuper.com');
  expect(document.querySelector('script[data-website-id="prod-zone"]')).not.toBeNull();
  trackProductPageView('/forecast?name=not-for-analytics', 'gfc.weatherboysuper.com');
  expect(track).toHaveBeenCalledWith({ url: '/forecast' });
});

test('flushes a queued route as a native Umami page view after the tracker loads', () => {
  setProductAnalyticsEnabled(true);
  initProductAnalytics('beta-gfc.weatherboysuper.com');
  trackProductPageView('/cloud-library#private', 'beta-gfc.weatherboysuper.com');

  const track = jest.fn();
  window.umami = { track };
  document.querySelector<HTMLScriptElement>('script[data-gfc-umami="true"]')?.dispatchEvent(new Event('load'));

  expect(track).toHaveBeenCalledWith({ url: '/cloud-library' });
  expect(track).not.toHaveBeenCalledWith('page_view', expect.anything());
});

test('tears down tracker even when localStorage.setItem throws on disable', () => {
  setProductAnalyticsEnabled(true);
  initProductAnalytics('gfc.weatherboysuper.com');
  expect(document.querySelector('script[data-gfc-umami="true"]')).not.toBeNull();

  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });

  const effective = setProductAnalyticsEnabled(false);
  expect(effective).toBe(false);
  expect(document.querySelector('script[data-gfc-umami="true"]')).toBeNull();
});

test('returns false when enabling analytics but localStorage.setItem throws', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });

  const effective = setProductAnalyticsEnabled(true);
  expect(effective).toBe(false);
  expect(isProductAnalyticsEnabled()).toBe(false);
});

test('withdrawal removes the tracker and discards queued telemetry', () => {
  setProductAnalyticsEnabled(true);
  initProductAnalytics('gfc.weatherboysuper.com');
  trackProductEvent('cloud_save_completed');
  setProductAnalyticsEnabled(false);
  setProductAnalyticsEnabled(true);
  initProductAnalytics('gfc.weatherboysuper.com');

  const track = jest.fn();
  window.umami = { track };
  document.querySelector<HTMLScriptElement>('script[data-gfc-umami="true"]')?.dispatchEvent(new Event('load'));

  expect(track).not.toHaveBeenCalled();
});
