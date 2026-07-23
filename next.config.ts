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
    // DIAGNÓSTICO: alias removido. Confirmar si el alias doble (react+react-dom)
    // rompía la hidratación del subtree de /escritorios en Vercel (useEffect de
    // seedIfEmpty no corría -> store local vacío -> fondo vacío). Si sin alias
    // el useEffect corre (desktopsLS se crea), el alias era el culpable y la
    // solución es refactorizar el layout a Server Component (eliminar #310 de
    // raíz) en vez de usar alias.
    return config;
  },
};

export default nextConfig;
