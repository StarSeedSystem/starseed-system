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

// buildId único por timestamp -> TODOS los assets bajo
// /_next/static/ss-{buildId}/ cambian de ruta en cada deploy.
// Rompe la cache de edge de Vercel (que YO provoqué con vercel.json
// max-age=31536000) sin depender del dashboard: el HTML nuevo
// referencia el chunk nuevo en ruta sin cache.
function buildIdStamp(): string {
  return `ss-${commitHash()}-${Date.now().toString(36)}`;
}

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  generateBuildId: async () => buildIdStamp(),
  transpilePackages: [
    '@splinetool/react-spline',
    '@splinetool/runtime',
    '@react-three/fiber',
    '@react-three/drei',
    'three',
    'postprocessing',
  ],
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
      // Singleton de react-dom: evita el "Multiple instances" / react-dom
      // duplicado que causa Minified React error #310 (Invalid hook call) en
      // Vercel. Solo aliasamos `react-dom` (no `react`), para NO romper
      // el server rendering de Next (que usa react-server-dom-client).
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
    };
    return config;
  },
};

export default nextConfig;
