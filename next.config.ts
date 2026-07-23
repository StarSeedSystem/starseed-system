import type { NextConfig } from 'next';
import path from 'path';
import { execSync } from 'child_process';

// buildId único por commit (cambia en cada deploy) -> los paths
// /_next/static/<buildId>/ cambian y el navegador descarga los chunks
// nuevos, rompiendo cualquier cache de disk de builds anteriores sin
// que el usuario deba hacer hard-refresh (ver memoria: fixes cache-stale).
function commitHash(): string {
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `b${Date.now().toString(36)}`;
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  generateBuildId: async () => `ss-${commitHash()}`,
  transpilePackages: ['@splinetool/react-spline'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/**',
      }
    ],
  },
  webpack: (config, { isServer }) => {
    // Fix for @splinetool/react-spline ESM-only package (no CJS "require" in exports)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@splinetool/react-spline': path.resolve(
        __dirname,
        'node_modules/@splinetool/react-spline/dist/react-spline.js'
      ),
    };
    // FIX #310 (root cause: duplicate React instance in the client bundle).
    // Next 15 bundles its own copy at next/dist/compiled/react AND react-dom,
    // which webpack treats as SEPARATE instances from node_modules/react(-dom).
    // The layout's hooks (useState) resolved to the compiled copy (no hook
    // dispatcher) -> "Invalid hook call" (#310). Alias BOTH next/dist/compiled
    // react AND react-dom to the canonical node_modules copies (pinned to 19.0.0
    // via package.json overrides) so the WHOLE client shares ONE React instance
    // and the dispatcher is set correctly. We deliberately do NOT alias
    // 'react-dom/client' (that broke hydration -> global-error in an earlier
    // attempt); aliasing the bare 'react-dom' is enough to unify the instance.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'next/dist/compiled/react$': require.resolve('react'),
        'next/dist/compiled/react-dom$': require.resolve('react-dom'),
      };
    }
    return config;
  },
};

export default nextConfig;
