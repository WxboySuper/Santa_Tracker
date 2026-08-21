import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWindows = process.platform === 'win32';

const nextConfig: NextConfig = {
  // ADR 0001 requires standalone output for the containerized VPS deployment.
  // Windows local builds lack symlink privileges, so we skip standalone locally
  // and keep it for CI/Linux production.
  ...(isWindows ? {} : { output: 'standalone' as const }),
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
  experimental: {
    // Keep RSC defaults; add typed routes and future flags here as needed.
  },
};

export default nextConfig;
