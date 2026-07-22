import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['@splinetool/react-spline', 'react', 'react-dom', 'react-server-dom-client'],
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
    // ── FIX #310 (Minified React error #310 / Invalid hook call) ───────────────
    // En el build de Vercel (Linux) el CLIENTE resuelve `react` con la
    // condición de export `react-server` (shim de react-server-dom-client,
    // chunk 1255) en lugar del `react` real (chunk 4bd1b696) → useState
    // undefined. En macOS local no pasa (orden de resolución distinto).
    // Solución: en el bundle del CLIENTE, quitar `react-server` de
    // conditionNames para que `import ... from "react"` use siempre la
    // condición `browser`/`default` (react real). El SERVER la mantiene
    // (RSC la necesita) porque este bloque solo corre en !isServer.
    if (!isServer && Array.isArray(config.resolve.conditionNames)) {
      config.resolve.conditionNames = config.resolve.conditionNames.filter(
        (c: string) => c !== 'react-server'
      );
    }
    return config;
  },
};

export default nextConfig;
