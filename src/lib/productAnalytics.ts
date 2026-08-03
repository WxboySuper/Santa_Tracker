export const PRODUCT_ANALYTICS_PREFERENCE_KEY = 'gfc-analytics-enabled';
const LEGACY_WORKFLOW_ANALYTICS_PREFERENCE_KEY = 'gfc-workflow-analytics-enabled';

const PRODUCTION_HOSTNAME = 'gfc.weatherboysuper.com';
const BETA_HOSTNAME = 'beta-gfc.weatherboysuper.com';

export const PRODUCT_ANALYTICS_EVENTS = [
  'workflow_start', 'workflow_continue', 'workflow_derive', 'workflow_revise',
  'workflow_complete', 'workflow_complete_with_omissions', 'forecast_exported',
  'workflow_rollover_action', 'custom_layer_created', 'cloud_save_completed', 'feature_unavailable',
] as const;

export type ProductAnalyticsEvent = (typeof PRODUCT_ANALYTICS_EVENTS)[number];
export type ProductAnalyticsProperties = Record<string, string | number | boolean>;
type AnalyticsZone = 'production' | 'beta';
type TrackerConfiguration = { zone: AnalyticsZone; host: string; websiteId: string };
type UmamiPageView = { url: string };

declare global {
  interface Window {
    umami?: { track: (event: string | UmamiPageView, data?: ProductAnalyticsProperties) => void };
  }
}

const eventSet = new Set<string>(PRODUCT_ANALYTICS_EVENTS);
let initializedZone: AnalyticsZone | null = null;
let pendingPagePath: string | null = null;
let pendingEvents: Array<{ event: ProductAnalyticsEvent; properties?: ProductAnalyticsProperties }> = [];

const WORKFLOW_DIMENSION_VALUES: Record<string, readonly string[]> = {
  dayGrouping: ['day1', 'day2', 'day3', 'day4-8', 'full-cycle'],
  accountTier: ['signed-out', 'free', 'premium'],
  entryPath: ['home', 'forecast', 'cloud-library', 'forecast-workspace', 'rollover'],
  result: ['success', 'failure', 'cancelled'],
  packageScope: ['workflow', 'cycle'],
  action: ['keep', 'save-and-start-new', 'replace-without-saving'],
};

const WORKFLOW_EVENTS = new Set<ProductAnalyticsEvent>([
  'workflow_start', 'workflow_continue', 'workflow_derive', 'workflow_revise',
  'workflow_complete', 'workflow_complete_with_omissions', 'forecast_exported', 'workflow_rollover_action',
]);

const hasAllowedWorkflowProperties = (properties: ProductAnalyticsProperties): boolean =>
  Object.entries(properties).every(([key, value]) => typeof value === 'string' && WORKFLOW_DIMENSION_VALUES[key]?.includes(value));

const hasAllowedCustomLayerProperties = (properties: ProductAnalyticsProperties): boolean => {
  const layerCount = properties.layer_count;
  return Object.keys(properties).length === 1
    && typeof layerCount === 'number'
    && Number.isInteger(layerCount)
    && layerCount >= 1
    && layerCount <= 50;
};

/** Keeps event payloads coarse and prevents future callers from attaching user-created data by accident. */
const hasAllowedProperties = (event: ProductAnalyticsEvent, properties?: ProductAnalyticsProperties): boolean => {
  if (!properties) return true;
  if (WORKFLOW_EVENTS.has(event)) return hasAllowedWorkflowProperties(properties);
  return event === 'custom_layer_created' ? hasAllowedCustomLayerProperties(properties) : Object.keys(properties).length === 0;
};

/** Returns the privacy-isolated Umami website zone for a public GFC hostname. */
export const getProductAnalyticsZone = (hostname?: string): AnalyticsZone | null => {
  const host = hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname);
  if (host === PRODUCTION_HOSTNAME) return 'production';
  if (host === BETA_HOSTNAME) return 'beta';
  return null;
};

/** Analytics are non-essential and remain off until the visitor explicitly enables them. */
export const isProductAnalyticsEnabled = (): boolean => {
  try {
    if (typeof localStorage === 'undefined') return false;
    const preference = localStorage.getItem(PRODUCT_ANALYTICS_PREFERENCE_KEY);
    if (preference !== null) return preference === 'true';
    // A prior explicit workflow opt-in remains valid; absence never enables new telemetry.
    return localStorage.getItem(LEGACY_WORKFLOW_ANALYTICS_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
};

/** Stores the local opt-out and removes the injected tracker immediately when it is disabled. */
export const setProductAnalyticsEnabled = (enabled: boolean): boolean => {
  let persisted = false;
  try {
    localStorage.setItem(PRODUCT_ANALYTICS_PREFERENCE_KEY, String(enabled));
    persisted = true;
  } catch {
    // localStorage unavailable — effective state cannot match the requested value
  }
  if (!enabled && typeof document !== 'undefined') {
    document.querySelector('script[data-gfc-umami="true"]')?.remove();
    initializedZone = null;
    pendingPagePath = null;
    pendingEvents = [];
  }
  // Disable always succeeds (teardown happened); enable requires persistence.
  return enabled ? persisted : false;
};

const getWebsiteId = (zone: AnalyticsZone): string => {
  const websiteId = zone === 'production'
    ? (typeof __GFC_UMAMI_PRODUCTION_WEBSITE_ID__ === 'string' ? __GFC_UMAMI_PRODUCTION_WEBSITE_ID__ : '')
    : (typeof __GFC_UMAMI_BETA_WEBSITE_ID__ === 'string' ? __GFC_UMAMI_BETA_WEBSITE_ID__ : '');
  return websiteId.trim();
};

const getUmamiHost = (): string =>
  (typeof __GFC_UMAMI_HOST__ === 'string' ? __GFC_UMAMI_HOST__ : '').trim().replace(/\/$/, '');

const trackSafely = ({ event, properties }: { event: string; properties?: ProductAnalyticsProperties }): boolean => {
  try {
    if (!window.umami) return false;
    window.umami.track(event, properties);
    return true;
  } catch { return false; }
};

/** Sends a native Umami page view, keeping user-provided query/hash data out of the URL. */
const trackPageViewSafely = (path: string): boolean => {
  try {
    if (!window.umami) return false;
    window.umami.track({ url: path });
    return true;
  } catch { return false; }
};

const flushPendingTelemetry = (): void => {
  if (pendingPagePath) trackPageViewSafely(pendingPagePath);
  pendingPagePath = null;
  const queuedEvents = pendingEvents;
  pendingEvents = [];
  queuedEvents.forEach(({ event, properties }) => trackSafely({ event, properties }));
};

const queueProductEvent = (event: ProductAnalyticsEvent, properties?: ProductAnalyticsProperties): void => {
  pendingEvents.push({ event, properties });
};

const createTrackerScript = ({ host, websiteId }: TrackerConfiguration): HTMLScriptElement => {
  const script = document.createElement('script');
  script.defer = true;
  script.src = `${host}/script.js`;
  script.dataset.websiteId = websiteId;
  script.dataset.hostUrl = host;
  script.dataset.autoTrack = 'false';
  script.dataset.doNotTrack = 'true';
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  script.dataset.gfcUmami = 'true';
  script.addEventListener('load', () => { if (isProductAnalyticsEnabled()) flushPendingTelemetry(); });
  script.addEventListener('error', () => { initializedZone = null; });
  return script;
};

const getTrackerConfiguration = (hostname?: string): TrackerConfiguration | null => {
  const zone = getProductAnalyticsZone(hostname);
  const host = getUmamiHost();
  const websiteId = zone ? getWebsiteId(zone) : '';
  if (!zone) return null;
  if (!host) return null;
  if (!websiteId) return null;
  return { zone, host, websiteId };
};

/** Loads Umami only for the matching hosted zone and only after the user has not opted out. */
export const initProductAnalytics = (hostname?: string): void => {
  if (typeof window === 'undefined') return;
  if (typeof document === 'undefined') return;
  if (!isProductAnalyticsEnabled()) return;
  const config = getTrackerConfiguration(hostname);
  if (!config) return;
  if (initializedZone === config.zone) return;
  initializedZone = config.zone;
  document.head.appendChild(createTrackerScript(config));
};

/** Tracks a route without query/hash values, which can contain user-provided data. */
export const trackProductPageView = (pathname?: string, hostname?: string): void => {
  if (!isProductAnalyticsEnabled()) return;
  if (!getProductAnalyticsZone(hostname)) return;
  const path = (pathname ?? window.location.pathname).split(/[?#]/, 1)[0];
  initProductAnalytics(hostname);
  if (!trackPageViewSafely(path)) pendingPagePath = path;
};

/** Sends only registry-backed, coarse event properties. */
export const trackProductEvent = (event: ProductAnalyticsEvent, properties?: ProductAnalyticsProperties): void => {
  if (!eventSet.has(event)) return;
  if (!hasAllowedProperties(event, properties)) return;
  if (!isProductAnalyticsEnabled()) return;
  if (!getProductAnalyticsZone()) return;
  initProductAnalytics();
  if (!trackSafely({ event, properties })) queueProductEvent(event, properties);
};

export const resetProductAnalyticsForTests = (): void => {
  initializedZone = null;
  pendingPagePath = null;
  pendingEvents = [];
  document.querySelectorAll('script[data-gfc-umami="true"]').forEach((script) => script.remove());
};
