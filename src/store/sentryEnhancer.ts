import * as Sentry from '@sentry/react';
import type { UnknownAction } from '@reduxjs/toolkit';
import { isSentryEnabled } from '../instrument';

const FORECAST_ACTION_PREFIX = 'forecast/';

/** Redux enhancer for Sentry breadcrumbs and scope tags. No-op when Sentry is disabled. */
export function createSentryReduxEnhancer() {
  if (!isSentryEnabled()) return null;
  return Sentry.createReduxEnhancer({
      attachReduxState: false,
      actionTransformer: (action: UnknownAction) => {
        if (typeof action.type === 'string' && action.type.startsWith(FORECAST_ACTION_PREFIX)) {
          return { type: action.type };
        }
        return action;
      },
      configureScopeWithState(scope, state: { theme: { darkMode: boolean }; appMode: { mode: string } }) {
        scope.setTag('theme.darkMode', String(state.theme.darkMode));
        scope.setTag('app.mode', state.appMode.mode);
      },
    });
}

/** Applies the optional Sentry enhancer to an arbitrary default enhancer list. */
export function appendSentryReduxEnhancer<TE extends readonly unknown[]>(getDefaultEnhancers: () => TE) {
  const defaults = getDefaultEnhancers();
  const sentryEnhancer = createSentryReduxEnhancer();
  return sentryEnhancer ? [...defaults, sentryEnhancer] : defaults;
}
