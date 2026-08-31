import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ADR 0001 requires standalone output for the containerized VPS deployment.
  // Windows local builds lack symlink privileges, so we skip standalone locally
  // and keep it for CI/Linux production.
  ...(isWindows ? {} : { output: 'standalone' }),
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
  async rewrites() {
    return [
      { source: '/static/data/santa_route.json', destination: '/api/route' },
      { source: '/data/santa_route.json', destination: '/api/route' },
    ];
  },
};

export default nextConfig;
