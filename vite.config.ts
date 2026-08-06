import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { resolveBuildTarget } from './src/config/buildTarget';

/** Vendor chunk families matched by package substrings, in priority order. */
const VENDOR_CHUNK_RULES: Array<{ family: string; markers: string[] }> = [
  { family: 'openlayers', markers: ['node_modules/ol/', 'node_modules/ol-mapbox-style/'] },
  { family: 'leaflet', markers: ['node_modules/leaflet/'] },
  { family: 'turf', markers: ['node_modules/@turf/'] },
  { family: 'firebase', markers: ['node_modules/firebase/', 'node_modules/@firebase/'] },
  { family: 'react', markers: ['node_modules/react/', 'node_modules/react-dom/'] },
  { family: 'redux', markers: ['node_modules/@reduxjs/', 'node_modules/redux/'] },
];

/** Maps an import module id to a named vendor chunk family, or undefined to leave it in the default chunk. */
const vendorChunkFor = (id: string): string | undefined =>
  VENDOR_CHUNK_RULES.find(({ markers }) => markers.some((marker) => id.includes(marker)))?.family;
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildTarget = resolveBuildTarget(env.VITE_BUILD_TARGET);
  const base = env.PUBLIC_URL || '/';
  const pkgPath = path.resolve(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const releaseName = `graphical-forecast-creator@${pkg.version}`;
  const uploadSourceMaps = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
  );
  const sentryPlugins =
    uploadSourceMaps
      ? [
          sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            release: { name: releaseName },
            // Local sourcemaps are deliberately NOT deleted here. The
            // verify-sentry-sourcemaps script confirms publication against the
            // Sentry API first, then deletes maps only on verified success so a
            // failed upload preserves recovery artifacts and fails the deploy.
            sourcemaps: {
              assets: ['**/*.js', '**/*.map'],
            },
          }),
        ]
      : [];

  return {
    base,
    define: {
      __GFC_APP_VERSION__: JSON.stringify(pkg.version),
      __GFC_BUILD_TARGET__: JSON.stringify(buildTarget),
      __GFC_DEV_MODE__: JSON.stringify(mode === 'development'),
      __GFC_COMING_SOON__: JSON.stringify(env.VITE_COMING_SOON === 'true'),
      __GFC_BETA_MODE__: JSON.stringify(env.VITE_BETA_MODE === 'true'),
      __GFC_BETA_INVITE_PATH__: JSON.stringify(env.VITE_BETA_INVITE_PATH ?? ''),
      __GFC_FIREBASE_API_KEY__: JSON.stringify(env.VITE_FIREBASE_API_KEY ?? ''),
      __GFC_FIREBASE_AUTH_DOMAIN__: JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN ?? ''),
      __GFC_FIREBASE_PROJECT_ID__: JSON.stringify(env.VITE_FIREBASE_PROJECT_ID ?? ''),
      __GFC_FIREBASE_APP_ID__: JSON.stringify(env.VITE_FIREBASE_APP_ID ?? ''),
      __GFC_SENTRY_DSN__: JSON.stringify(env.VITE_SENTRY_DSN ?? ''),
      __GFC_SENTRY_ENVIRONMENT__: JSON.stringify(env.VITE_SENTRY_ENVIRONMENT ?? ''),
      __GFC_UMAMI_HOST__: JSON.stringify(env.VITE_UMAMI_HOST ?? ''),
      __GFC_UMAMI_PRODUCTION_WEBSITE_ID__: JSON.stringify(env.VITE_UMAMI_PRODUCTION_WEBSITE_ID ?? ''),
      __GFC_UMAMI_BETA_WEBSITE_ID__: JSON.stringify(env.VITE_UMAMI_BETA_WEBSITE_ID ?? ''),
    },
    plugins: [react(), ...sentryPlugins],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      sourcemap: uploadSourceMaps ? 'hidden' : false,
      // Separate the heaviest third-party families into their own chunks so the
      // application shell stays independent of map/editor and utility bundles.
      rollupOptions: {
        output: {
          manualChunks: (id: string) => vendorChunkFor(id),
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3006',
          changeOrigin: false,
        },
      },
    },
  };
});
