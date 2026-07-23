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
    // FIX #310 (root cause: two React instances in the client bundle):
    // webpack split a copy of React into chunk 1255 while react-dom (which sets
    // the hooks dispatcher) lived in another chunk (4bd1b696). The layout's
    // useState resolved to the 1255 copy -> no dispatcher -> #310.
    // Force react + react-dom (+ client) into ONE shared vendor chunk with
    // enforce:true so there is a single React instance for the whole client.
    if (!isServer) {
      config.optimization = config.optimization || {};
      config.optimization.splitChunks = {
        ...(config.optimization.splitChunks || {}),
        cacheGroups: {
          ...((config.optimization.splitChunks || {}).cacheGroups || {}),
          reactVendor: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-dom\/client|scheduler)[\\/]/,
            name: 'react-vendor',
            chunks: 'all',
            priority: 100,
            enforce: true,
            reuseExistingChunk: true,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
