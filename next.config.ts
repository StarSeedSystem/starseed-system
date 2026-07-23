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
    const webpack = require('webpack');
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
    // y reclama el module-id que `react` real debería tener → el root layout
    // resuelve `react` al shim server (useState undefined). Excluimos
    // react-server-dom-client del cliente: la hidratación de RSC en el browser
    // usa el runtime que Next inyecta aparte, no este shim. Así el module-id de
    // `react` queda limpio y los hooks resuelven a la copia real.
    // Solo en !isServer (el server SÍ necesita react-server-dom-client para RSC).
    if (!isServer) {
      // [fix #310] En el CLIENTE, react-server-dom-client (el shim server de RSC)
      // colisiona con el module-id de `react` real → el root layout resuelve
      // useState al shim server (undefined) → "Minified React error #310".
      // NormalModuleReplacementPlugin reemplaza CUALQUIER import de
      // react-server-dom-client por la copia REAL de react EN EL GRAFO DE
      // WEBPACK (antes de resolver), así ambos resuelven a la MISMA copia real
      // y el module-id 1255 deja de ser el shim server. La hidratación de RSC
      // usa react real (compatible). Solo en !isServer.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^react-server-dom-client$/,
          require.resolve('react')
        )
      );
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
          // [fix #310] En el CLIENTE, cualquier referencia a react-server-dom-client
          // (el shim server que colisiona con el module-id de react en Vercel/Linux)
          // se redirige a la copia REAL de react. Así el chunk 1255 deja de ser el
          // shim server y useState resuelve a react real → no hay Invalid hook call.
          'react-server-dom-client$': react,
        };
      } catch {
        /* si require.resolve falla, dejamos el alias de Next intacto */
      }
    }
    return config;
  },
}

export default nextConfig;
