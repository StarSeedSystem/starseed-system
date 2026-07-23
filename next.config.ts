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
    // FIX #310: en el cliente, react-server-dom-client (vendored por Next) se
    // fusiona con 'react' en el mismo chunk (scope-hoisting), de modo que el root
    // layout resuelve useState al shim server → "Invalid hook call" (#310).
    // 1) alias a rutas absolutas: TODAS las importaciones de react/react-dom
    //    (incluidas las de react-server-dom-client) resuelven al MISMO archivo
    //    físico → una sola copia de react en todo el bundle cliente.
    // 2) splitChunks mueve esa única copia a 'react-vendor', así el chunk 1255
    //    (react-server-dom-client) queda SIN react inlineado.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'react$': require.resolve('react'),
        'react-dom$': require.resolve('react-dom'),
        'react-dom/client$': require.resolve('react-dom/client'),
      };
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
