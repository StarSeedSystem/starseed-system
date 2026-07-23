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
    // DIAGNÓSTICO: alias de react removido temporalmente para confirmar si
    // rompe el montaje del árbol en producción (Vercel). Si Vercel monta
    // children sin el alias, el alias era el culpable y la solución es otra
    // (actualizar Next para eliminar la duplicación de react, no aliasar).
    return config;
  },
};

export default nextConfig;
