import * as Sentry from '@sentry/react';
import type { ErrorEvent, Event, EventHint } from '@sentry/react';
import React from 'react';
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

declare const __GFC_SENTRY_DSN__: string;
declare const __GFC_SENTRY_ENVIRONMENT__: string;
declare const __GFC_APP_VERSION__: string;

type SentryExceptionValue = NonNullable<NonNullable<Event['exception']>['values']>[number];

const OPENLAYERS_CANVAS_MESSAGE = /^null is not an object \(evaluating '[a-z]{1,2}\.canvas'\)$/i;
const REQUEST_ANIMATION_FRAME_MECHANISM = 'auto.browser.browserapierrors.requestAnimationFrame';
const OPAQUE_GLOBAL_ERROR_MESSAGE = /^uncaught exception: undefined$/i;
const GLOBAL_ERROR_MECHANISM = 'auto.browser.global_handlers.onerror';

const REQUEST_LIFECYCLE_MESSAGES = [
  /^(NetworkError: )?A network error occurred\.?$/i,
  /^(AbortError: )?The user aborted a request\.?$/i,
  /^(TypeError: |NetworkError: )?Failed to fetch\.?$/i,
];

/** Returns the Sentry DSN baked in at build time, or an empty string when monitoring is off. */
function getSentryDsn(): string {
  return typeof __GFC_SENTRY_DSN__ !== 'undefined' ? __GFC_SENTRY_DSN__ : '';
}

/** True when a DSN was baked into the build (hosted production or beta deploys). */
export function isSentryEnabled(): boolean {
  return Boolean(getSentryDsn().trim());
}

/** Returns the Sentry release string derived from the app version, when available. */
function getRelease(): string | undefined {
  const version = typeof __GFC_APP_VERSION__ !== 'undefined' ? __GFC_APP_VERSION__ : '';
  return version ? `graphical-forecast-creator@${version}` : undefined;
}

/** Returns the configured Sentry environment label (production, beta, etc.). */
function getEnvironment(): string {
  const configured =
    typeof __GFC_SENTRY_ENVIRONMENT__ !== 'undefined' ? __GFC_SENTRY_ENVIRONMENT__ : '';
  return configured.trim() || 'production';
}

/** True for the OpenLayers Safari canvas renderer noise from requestAnimationFrame. */
function isOpenLayersCanvasNoise(value: SentryExceptionValue): boolean {
  return (
    OPENLAYERS_CANVAS_MESSAGE.test(value.value ?? '') &&
    value.mechanism?.type === REQUEST_ANIMATION_FRAME_MECHANISM &&
    value.mechanism.handled === false
  );
}

/** True for the opaque Firefox global error with no exception value or stack. */
function isOpaqueGlobalError(value: SentryExceptionValue): boolean {
  return (
    OPAQUE_GLOBAL_ERROR_MESSAGE.test(value.value ?? '') &&
    value.mechanism?.type === GLOBAL_ERROR_MECHANISM &&
    value.mechanism.handled === false
  );
}

/** True when an exception value matches known request-lifecycle browser noise. */
function isRequestLifecycleNoise(values: SentryExceptionValue[], message: string): boolean {
  return (
    values.length > 0 &&
    REQUEST_LIFECYCLE_MESSAGES.some((pattern) => pattern.test(message))
  );
}

/** True when a stack frame originates from the application rather than a bundled SDK. */
function isApplicationStackFrame(frame: { filename?: string }): boolean {
  const filename = frame.filename ?? '';
  if (!filename) {
    return true;
  }
  return (
    !/node_modules\//.test(filename) &&
    !/@firebase\//.test(filename) &&
    !/^firebase\//.test(filename)
  );
}

/** True when any exception value carries an application stack frame. */
function hasApplicationStackFrame(values: SentryExceptionValue[]): boolean {
  return values.some((value) =>
    (value.stacktrace?.frames ?? []).some(isApplicationStackFrame)
  );
}

/** True when the event is known browser noise that is safe to drop. */
function isKnownBrowserNoise(event: Event): boolean {
  const values = event.exception?.values ?? [];
  const message = values[0]?.value ?? event.message ?? '';
  const normalizedMessage = message.replace(/\s+/g, ' ').trim();

  if (values.some(isOpenLayersCanvasNoise)) {
    return true;
  }

  // Request-lifecycle noise (network failures, aborts, failed fetches) is safe to
  // drop unless the exception carries an application stack frame. Breadcrumbs from
  // ordinary user activity do not make a transport failure actionable (GFC-WEB-Q).
  if (isRequestLifecycleNoise(values, normalizedMessage)) {
    return !hasApplicationStackFrame(values);
  }

  // The opaque global error is only noise when it has neither an application stack
  // frame nor breadcrumbs that could explain what was happening.
  if (values.some(isOpaqueGlobalError)) {
    return !(hasApplicationStackFrame(values) || Boolean(event.breadcrumbs?.length));
  }

  return false;
}

/** Drops known no-stack browser noise while preserving actionable stacked errors. */
export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  return isKnownBrowserNoise(event) ? null : event;
}

/** Initializes Sentry when a DSN is present. No-op in local dev without a DSN. */
export function initSentry(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.init({
    dsn: getSentryDsn(),
    tunnel: '/api/sentry-tunnel',
    environment: getEnvironment(),
    release: getRelease(),
    sendDefaultPii: false,
    enableLogs: true,
    normalizeDepth: 10,
    beforeSend,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/gfc\.weatherboysuper\.com/,
      /^https:\/\/beta-gfc\.weatherboysuper\.com/,
      /^\/api/,
    ],
  });
}

initSentry();

export { Sentry };
