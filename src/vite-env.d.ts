/// <reference types="vite/client" />

declare const __GFC_COMING_SOON__: boolean;
declare const __GFC_APP_VERSION__: string;
declare const __GFC_BUILD_TARGET__: import('./config/buildTarget').BuildTarget;
declare const __GFC_DEV_MODE__: boolean;
declare const __GFC_BETA_MODE__: boolean;
declare const __GFC_BETA_INVITE_PATH__: string;
declare const __GFC_FIREBASE_API_KEY__: string;
declare const __GFC_FIREBASE_AUTH_DOMAIN__: string;
declare const __GFC_FIREBASE_PROJECT_ID__: string;
declare const __GFC_FIREBASE_APP_ID__: string;
declare const __GFC_SENTRY_DSN__: string;
declare const __GFC_SENTRY_ENVIRONMENT__: string;
declare const __GFC_UMAMI_HOST__: string;
declare const __GFC_UMAMI_PRODUCTION_WEBSITE_ID__: string;
declare const __GFC_UMAMI_BETA_WEBSITE_ID__: string;

interface ImportMetaEnv {
  readonly VITE_BUILD_TARGET?: import('./config/buildTarget').BuildTarget;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_UMAMI_HOST?: string;
  readonly VITE_UMAMI_PRODUCTION_WEBSITE_ID?: string;
  readonly VITE_UMAMI_BETA_WEBSITE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  var __GFC_COMING_SOON__: boolean;
  var __GFC_APP_VERSION__: string;
  var __GFC_BUILD_TARGET__: import('./config/buildTarget').BuildTarget;
  var __GFC_DEV_MODE__: boolean;
  var __GFC_BETA_MODE__: boolean;
  var __GFC_BETA_INVITE_PATH__: string;
  var __GFC_FIREBASE_API_KEY__: string;
  var __GFC_FIREBASE_AUTH_DOMAIN__: string;
  var __GFC_FIREBASE_PROJECT_ID__: string;
  var __GFC_FIREBASE_APP_ID__: string;
  var __GFC_SENTRY_DSN__: string;
  var __GFC_SENTRY_ENVIRONMENT__: string;
  var __GFC_UMAMI_HOST__: string;
  var __GFC_UMAMI_PRODUCTION_WEBSITE_ID__: string;
  var __GFC_UMAMI_BETA_WEBSITE_ID__: string;
}

export {};
