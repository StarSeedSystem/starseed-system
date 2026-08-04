import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['@splinetool/react-spline'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts', '@radix-ui/react-icons'],
  },
  // Chequeo de tipos REACTIVADO (Adenda 130): `tsc --noEmit` pasa limpio hoy, así que
  // activar el gate tiene coste 0 y evita que una regresión de tipos se despliegue en
  // silencio (antes `ignoreBuildErrors:true` la ocultaba). ESLint sigue desactivado en
  // build: su config no está migrada a flat-config (ESLint 9) y no ejecuta — tarea aparte.
  typescript: {
    ignoreBuildErrors: false,
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
  // El SCRIPT del service worker y el manifest NUNCA se cachean: así el navegador
  // revalida siempre y detecta al instante cada despliegue nuevo (causa raíz del
  // "no se actualiza": un SW cacheado por el CDN/navegador no veía la versión
  // nueva). El resto de assets siguen con su caché normal.
  async headers() {
    const noCache = [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
    ];
    // Cabeceras de seguridad de BAJO RIESGO en TODAS las rutas (Adenda 139).
    // Deliberadamente NO incluye CSP ni Permissions-Policy: ambas requieren afinado
    // contra las features sensoriales (cámara/micro/geo de "sentidos") e iframe del OS
    // y romperían funciones si se ponen restrictivas sin pruebas en runtime — quedan
    // para una ola dedicada (CSP en report-only + recolección de violaciones primero).
    // X-Frame-Options SAMEORIGIN: anti-clickjacking; permite el auto-encuadre same-origin
    // que sí usa el OS y solo bloquea que un tercero enmarque el OS.
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ];
    return [
      { source: '/:path*', headers: security },
      { source: '/sw-v7.js', headers: [...noCache, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/manifest.webmanifest', headers: noCache },
      { source: '/version.json', headers: noCache },
    ];
  },
  webpack: (config) => {
    // Fix for @splinetool/react-spline ESM-only package (no CJS "require" in exports)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@splinetool/react-spline': path.resolve(
        __dirname,
        'node_modules/@splinetool/react-spline/dist/react-spline.js'
      ),
    };
    return config;
  },
};

export default nextConfig;
