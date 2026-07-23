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
    // FIX #310: forzar module-ids distintos para react y react-server-dom-client
    // (root cause: colision de module-id por scope-hoisting). concatenateModules:false
    // ademas cambia el hash del chunk 1255 respecto al build roto cacheado en el
    // edge de Vercel, rompiendo la cache de chunks estaticos sin hard-refresh.
    if (!isServer) {
      config.optimization = config.optimization || {};
      config.optimization.concatenateModules = false;
    }
    return config;
  },
};

export default nextConfig;
