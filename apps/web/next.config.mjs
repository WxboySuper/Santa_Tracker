// @ts-check

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const isVinextBuild = process.env.VINEXT_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ADR 0001 requires standalone output for the containerized VPS deployment.
  // Windows local builds lack symlink privileges, so we skip standalone locally
  // and keep it for CI/Linux production.
  ...(isWindows || isVinextBuild ? {} : { output: 'standalone' }),
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: [
    '@santa-tracker/contracts',
    '@santa-tracker/config',
    '@santa-tracker/database',
    '@santa-tracker/route-engine',
    '@santa-tracker/ui',
    '@santa-tracker/activity-sdk',
    '@santa-tracker/test-fixtures',
  ],
  headers: () => Promise.resolve([
      {
        source: '/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=900, stale-while-revalidate=3600' },
        ],
      },
    ]),
};

export default nextConfig;
