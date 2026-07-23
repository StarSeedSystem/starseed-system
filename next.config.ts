import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  // NOTA: NO incluir 'react' ni 'react-dom' en transpilePackages — transpilar
  // React mismo crea una 2ª copia con distinta identidad de módulo y colisiona
  // con react-server-dom-client en el cliente → Minified React error #310.
  // Solo @splinetool/react-spline (ESM-only, necesita alias explícito).
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
    // FIX #310: en el cliente, react-server-dom-client se fusiona con 'react'
    // en el mismo chunk (scope-hoisting de webpack), de modo que el root layout
    // resuelve useState al shim server → "Invalid hook call" (#310).
    // Forzamos a 'react' y 'react-dom' a un vendor chunk propio con cacheGroups,
    // dándoles identidad de módulo separada de react-server-dom-client.
    if (!isServer) {
      config.optimization = config.optimization || {};
      config.optimization.splitChunks = {
        ...(config.optimization.splitChunks || {}),
        cacheGroups: {
          ...((config.optimization.splitChunks || {}).cacheGroups || {}),
          reactVendor: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-dom\/client)[\\/]/,
            name: 'react-vendor',
            chunks: 'all',
            priority: 50,
            enforce: true,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
