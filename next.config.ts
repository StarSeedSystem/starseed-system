import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
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
    // Next 15 bundles its own copy at next/dist/compiled/react, which webpack
    // treats as a SEPARATE instance from node_modules/react. The layout's
    // useState resolved to that copy (no hook dispatcher) -> "Invalid hook call" (#310).
    // Alias Next's internal compiled react/react-dom to the canonical node_modules
    // copies (pinned to 19.0.0 via package.json overrides) so the WHOLE client
    // shares ONE React instance and the dispatcher is set correctly.
    if (!isServer) {
      // Only redirect the bare compiled 'react' to the canonical one. The hook
      // dispatcher (useState/useReducer) lives in react; react-dom sets it. Keeping
      // Next's own compiled react-dom/react-dom/client avoids breaking hydration.
      config.resolve.alias = {
        ...config.resolve.alias,
        'next/dist/compiled/react$': require.resolve('react'),
      };
    }
    return config;
  },
};

export default nextConfig;
