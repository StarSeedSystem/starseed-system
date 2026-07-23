import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['@splinetool/react-spline', 'react', 'react-dom'],
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
    // ── FIX #310 (Minified React error #310 / Invalid hook call) ─────────────
    // En el build de Vercel (Linux) el bundle del CLIENTE sufre una colisión de
    // module-id: `react-server-dom-client` (chunk 1255) se incluye en el cliente
    // y reclama el module-id que `react` real debería tener → VoiceNeuronOnboarding
    // resuelve `react` al shim server (useState undefined). Forzamos UNA sola
    // copia real de react/react-dom en el CLIENTE vía require.resolve() con
    // matchers EXACTOS ($) para no tragarse subpaths como react/jsx-runtime.
    // Solo en !isServer (el server necesita react-server-dom-client para RSC).
    if (!isServer) {
      try {
        const react = require.resolve('react');
        const reactJsxRuntime = require.resolve('react/jsx-runtime');
        const reactJsxDevRuntime = require.resolve('react/jsx-dev-runtime');
        const reactDom = require.resolve('react-dom');
        const reactDomClient = require.resolve('react-dom/client');
        config.resolve.alias = {
          ...config.resolve.alias,
          'react$': react,
          'react/jsx-runtime$': reactJsxRuntime,
          'react/jsx-dev-runtime$': reactJsxDevRuntime,
          'react-dom$': reactDom,
          'react-dom/client$': reactDomClient,
        };
      } catch {
        /* si require.resolve falla, dejamos el alias de Next intacto */
      }
    }
    return config;
  },
}

export default nextConfig;
