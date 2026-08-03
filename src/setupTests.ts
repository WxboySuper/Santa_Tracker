// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

const globalScope = globalThis as typeof globalThis & {
  __GFC_COMING_SOON__?: boolean;
  __GFC_BETA_MODE__?: boolean;
  __GFC_BETA_INVITE_PATH__?: string;
  __GFC_BUILD_TARGET__?: import('./config/buildTarget').BuildTarget;
  __GFC_DEV_MODE__?: boolean;
  __GFC_FIREBASE_API_KEY__?: string;
  __GFC_FIREBASE_AUTH_DOMAIN__?: string;
  __GFC_FIREBASE_PROJECT_ID__?: string;
  __GFC_FIREBASE_APP_ID__?: string;
  __GFC_SENTRY_DSN__?: string;
  __GFC_SENTRY_ENVIRONMENT__?: string;
  __GFC_GA_MEASUREMENT_ID__?: string;
  __GFC_APP_VERSION__?: string;
  Headers?: typeof Headers;
  Request?: typeof Request;
  Response?: typeof Response;
};

if (!globalScope.TextEncoder) {
  globalScope.TextEncoder = TextEncoder as typeof globalScope.TextEncoder;
}

if (!globalScope.TextDecoder) {
  globalScope.TextDecoder = TextDecoder as typeof globalScope.TextDecoder;
}

if (typeof globalScope.__GFC_COMING_SOON__ === 'undefined') {
  globalScope.__GFC_COMING_SOON__ = false;
}

if (typeof globalScope.__GFC_BETA_MODE__ === 'undefined') {
  globalScope.__GFC_BETA_MODE__ = false;
}

if (typeof globalScope.__GFC_BETA_INVITE_PATH__ === 'undefined') {
  globalScope.__GFC_BETA_INVITE_PATH__ = '';
}

if (typeof globalScope.__GFC_BUILD_TARGET__ === 'undefined') {
  globalScope.__GFC_BUILD_TARGET__ = 'local';
}

if (typeof globalScope.__GFC_DEV_MODE__ === 'undefined') {
  globalScope.__GFC_DEV_MODE__ = false;
}

if (typeof globalScope.__GFC_FIREBASE_API_KEY__ === 'undefined') globalScope.__GFC_FIREBASE_API_KEY__ = '';
if (typeof globalScope.__GFC_FIREBASE_AUTH_DOMAIN__ === 'undefined') globalScope.__GFC_FIREBASE_AUTH_DOMAIN__ = '';
if (typeof globalScope.__GFC_FIREBASE_PROJECT_ID__ === 'undefined') globalScope.__GFC_FIREBASE_PROJECT_ID__ = '';
if (typeof globalScope.__GFC_FIREBASE_APP_ID__ === 'undefined') globalScope.__GFC_FIREBASE_APP_ID__ = '';
if (typeof globalScope.__GFC_SENTRY_DSN__ === 'undefined') globalScope.__GFC_SENTRY_DSN__ = '';
if (typeof globalScope.__GFC_SENTRY_ENVIRONMENT__ === 'undefined') globalScope.__GFC_SENTRY_ENVIRONMENT__ = '';
if (typeof globalScope.__GFC_GA_MEASUREMENT_ID__ === 'undefined') globalScope.__GFC_GA_MEASUREMENT_ID__ = '';
if (typeof globalScope.__GFC_APP_VERSION__ === 'undefined') globalScope.__GFC_APP_VERSION__ = 'test';

if (typeof globalScope.Headers === 'undefined') {
  globalScope.Headers =
    window.Headers ??
    (function MockHeaders() {
      return undefined;
    } as unknown as typeof Headers);
}

if (typeof globalScope.Request === 'undefined') {
  globalScope.Request =
    window.Request ??
    (class MockRequest {
      url = '';
      method = 'GET';
    } as unknown as typeof Request);
}

if (typeof globalScope.Response === 'undefined') {
  globalScope.Response =
    window.Response ??
    (class MockResponse {
      ok = true;
      status = 200;
    } as unknown as typeof Response);
}

if (!globalScope.fetch) {
  /** Builds a minimal Response-like object for tests that depend on common fetch response fields. */
  const createMockResponse = () => {
    const headers = new globalScope.Headers();

    return {
      ok: false,
      status: 500,
      statusText: 'Mock fetch not implemented',
      headers,
      redirected: false,
      type: 'basic' as ResponseType,
      url: '',
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      clone() {
        return createMockResponse();
      },
    };
  };

  globalScope.fetch = jest.fn().mockResolvedValue({
    ...createMockResponse(),
  }) as unknown as typeof globalScope.fetch;
}

// Mock Leaflet
jest.mock('leaflet', () => {
  const leafletMock = {
    divIcon: jest.fn(() => ({})),
    icon: jest.fn(() => ({})),
    point: jest.fn(() => ({})),
    latLng: jest.fn((lat, lng) => ({ lat, lng })),
    extend: jest.fn(),
    Map: jest.fn(() => ({
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      setView: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      fitBounds: jest.fn(),
    })),
    Layer: jest.fn(),
    TileLayer: jest.fn(),
    GeoJSON: jest.fn(() => ({
      addTo: jest.fn(),
      clearLayers: jest.fn(),
      addData: jest.fn(),
    })),
    featureGroup: jest.fn(() => ({
      addTo: jest.fn(),
      getLayers: jest.fn(() => []),
      getBounds: jest.fn(),
      clearLayers: jest.fn(),
    })),
    marker: jest.fn(() => ({
      addTo: jest.fn(),
    })),
    Marker: {
      prototype: {
        options: {
          icon: {}
        }
      }
    },
  };
  return leafletMock;
});
