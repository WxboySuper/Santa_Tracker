import * as Sentry from '@sentry/react';

jest.mock('@sentry/react', () => ({
  init: jest.fn(),
  reactRouterV7BrowserTracingIntegration: jest.fn(() => ({})),
}));

describe('instrument', () => {
  const globalScope = globalThis as typeof globalThis & {
    __GFC_SENTRY_DSN__?: string;
    __GFC_SENTRY_ENVIRONMENT__?: string;
    __GFC_APP_VERSION__?: string;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    globalScope.__GFC_SENTRY_DSN__ = '';
    globalScope.__GFC_SENTRY_ENVIRONMENT__ = '';
    globalScope.__GFC_APP_VERSION__ = '1.0.0';
  });

  it('is disabled without a DSN', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = '';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { isSentryEnabled: enabled } = require('./instrument');
      expect(enabled()).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });

  it('initializes Sentry with tracing and logging when a DSN is configured', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      globalScope.__GFC_SENTRY_ENVIRONMENT__ = 'production';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { isSentryEnabled: enabled } = require('./instrument');
      expect(enabled()).toBe(true);
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example@o0.ingest.sentry.io/0',
          tunnel: '/api/sentry-tunnel',
          environment: 'production',
          release: 'graphical-forecast-creator@1.0.0',
          sendDefaultPii: false,
          enableLogs: true,
          normalizeDepth: 10,
          beforeSend: expect.any(Function),
          tracesSampleRate: 0.1,
          tracePropagationTargets: expect.arrayContaining([
            'localhost',
            expect.any(RegExp),
            expect.any(RegExp),
            expect.any(RegExp),
          ]),
        })
      );
      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(initCall.integrations).toHaveLength(1);
    });
  });

  const createOpenLayersCanvasEvent = (
    value: string,
    mechanismType = 'auto.browser.browserapierrors.requestAnimationFrame'
  ) => ({
    exception: {
      values: [
        {
          value,
          mechanism: {
            type: mechanismType,
            handled: false,
          },
          stacktrace: {
            frames: [{ filename: 'assets/index-BmG6v9Rh.js', function: 'n' }],
          },
        },
      ],
    },
  });

  it.each([
    ["Safari/WebKit observed shape", "null is not an object (evaluating 'a.canvas')"],
    ["Safari/WebKit alternate minified name", "null is not an object (evaluating 'b.canvas')"],
    ["Safari/WebKit two-character minified name", "null is not an object (evaluating 'ab.canvas')"],
  ])('drops OpenLayers canvas render-frame noise: %s', (_label, message) => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');
      const event = createOpenLayersCanvasEvent(message);

      expect(beforeSend(event, {})).toBeNull();
    });
  });

  it('keeps matching canvas TypeErrors when they come from application frames', () => {
    expectBeforeSendToKeep(() =>
      createOpenLayersCanvasEvent(
        "null is not an object (evaluating 'a.canvas')",
        'auto.browser.global_handlers.onerror'
      )
    );
  });

  const createRequestLifecycleEvent = (value: string, withStack = false) => ({
    exception: {
      values: [
        {
          value,
          stacktrace: withStack
            ? { frames: [{ filename: 'src/lib/openFreeMap.ts', function: 'loadStyle' }] }
            : undefined,
        },
      ],
    },
  });

  const createOpaqueGlobalError = (value = 'uncaught exception: undefined', withStack = false) => ({
    exception: {
      values: [
        {
          value,
          mechanism: {
            type: 'auto.browser.global_handlers.onerror',
            handled: false,
          },
          stacktrace: withStack
            ? { frames: [{ filename: 'src/App.tsx', function: 'renderForecast' }] }
            : undefined,
        },
      ],
    },
  });

  const loadBeforeSend = () => {
    globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
    // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
    return require('./instrument').beforeSend;
  };

  const expectBeforeSendToKeep = (createEvent: () => any) => {
    jest.isolateModules(() => {
      const beforeSend = loadBeforeSend();
      const event = createEvent();

      expect(beforeSend(event, {})).toBe(event);
    });
  };

  it.each([
    ['GFC-WEB-K NetworkError', 'A network error occurred.'],
    ['GFC-WEB-F wrapped NetworkError', 'NetworkError: A network error occurred.'],
    ['GFC-WEB-E wrapped AbortError', 'AbortError: The user aborted a request.'],
    ['bare AbortError variant', 'The user aborted a request.'],
  ])('drops no-stack request lifecycle noise: %s', (_label, message) => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');

      expect(beforeSend(createRequestLifecycleEvent(message), {})).toBeNull();
    });
  });

  it('keeps matching request lifecycle errors with stack frames', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');
      const event = createRequestLifecycleEvent('A network error occurred.', true);

      expect(beforeSend(event, {})).toBe(event);
    });
  });

  it.each([
    ['double-space NetworkError', 'NetworkError:  A network error occurred.'],
    ['leading/trailing whitespace', '  AbortError:   The user aborted a request.  '],
  ])('drops whitespace variants of request lifecycle noise: %s', (_label, message) => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');

      expect(beforeSend(createRequestLifecycleEvent(message), {})).toBeNull();
    });
  });

  it('drops no-stack opaque global error noise from Firefox', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');

      expect(beforeSend(createOpaqueGlobalError(), {})).toBeNull();
    });
  });

  it('keeps opaque global errors when they have application stack frames', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');
      const event = createOpaqueGlobalError(undefined, true);

      expect(beforeSend(event, {})).toBe(event);
    });
  });

  it('keeps opaque global errors when breadcrumbs provide context', () => {
    jest.isolateModules(() => {
      const beforeSend = loadBeforeSend();
      const event = createOpaqueGlobalError();
      event.breadcrumbs = [{ message: 'forecast route loaded' }];

      expect(beforeSend(event, {})).toBe(event);
    });
  });

  it('keeps the opaque message when it comes from another mechanism', () => {
    expectBeforeSendToKeep(() => {
      const event = createOpaqueGlobalError();
      event.exception.values[0].mechanism.type = 'auto.browser.global_handlers.onunhandledrejection';
      return event;
    });
  });

  it('keeps matching request lifecycle messages without exception values', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');
      const event = { message: 'A network error occurred.' };

      expect(beforeSend(event, {})).toBe(event);
    });
  });


  it('keeps unrelated application errors', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      // skipcq: JS-C1003, JS-0359 — isolateModules needs require for fresh module load
      const { beforeSend } = require('./instrument');
      const event = createRequestLifecycleEvent('Cannot read properties of undefined');

      expect(beforeSend(event, {})).toBe(event);
    });
  });
});
