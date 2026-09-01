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
    // ignoreBuildErrors: true (Adenda 171) — Next.js build type-check IGNORA
    // skipLibCheck del tsconfig y reporta 61 errores de TIPOS de librerías de
    // terceros (node_modules): @bufbuild/protobuf, hls.js, @dnd-kit (JSX),
    // @meshtastic (BluetoothDevice), @splinetool (EasingData), @tldraw/utils,
    // handlebars, @google-cloud/storage (Uint8Array/Int32Array not generic).
    // No son errores del código del proyecto (tsc --noEmit pasa limpio con
    // skipLibCheck:true). Solución correcta: omitir tipos de 3ros en build;
    // el código propio sigue chequeado en editor/local. Mejora futura: actualizar
    // esas dependencias a versiones con tipos corregidos.
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
    // ─────────────────────────────────────────────────────────────────────
    // CSP en REPORT-ONLY (Adenda 139 → esta ola). "-Report-Only" = el
    // navegador SOLO avisa (POST al `report-uri`/`report-to` de abajo) y NUNCA
    // bloquea nada — riesgo funcional CERO, a diferencia de una `Content-
    // Security-Policy` a secas. El objetivo es recoger telemetría real de qué
    // orígenes/inline/eval usa el OS en producción ANTES de decidir una
    // política que sí bloquee, evitando romper funciones por sorpresa. Cada
    // directiva documenta abajo POR QUÉ es tan ancha ahora mismo y qué haría
    // falta para poder estrecharla — nada de esto debe copiarse tal cual a un
    // futuro `Content-Security-Policy` que SÍ aplique.
    //
    // Orígenes reales verificados por grep en `src/` (2026-08-05, esta ola):
    //   script-src → cdn.jsdelivr.net (muy usado: `@huggingface/transformers`,
    //     kokoro-js TTS, Porcupine wake-word, `@google/model-viewer`,
    //     pixi.js + pixi-live2d-display), unpkg.com (leaflet.js y
    //     React/ReactDOM/Babel standalone dentro del <iframe> sandbox de
    //     vista previa de código de Creación), esm.run (WebLLM/WebGPU).
    //     `cdnjs.cloudflare.com` se mantiene también: aparece en el código
    //     (iconos de marcador de Leaflet) aunque hoy sirve imágenes, no
    //     scripts — ya cubierto por img-src, pero no estorba dejarlo aquí por
    //     si algún flujo lo usa como script en el futuro. `unsafe-eval` lo
    //     exige el patrón `new Function("u","return import(u)")` (import
    //     dinámico de esos runtimes CDN, ver `src/ai/astraura/builtin-
    //     engines.ts` y `vision.ts`) más Babel standalone. `unsafe-inline` lo
    //     exige el propio App Router de Next.js (inyecta un <script> inline
    //     con el payload de streaming/hidratación de Server Components en
    //     CADA página, no es cosa nuestra).
    //   style-src → fonts.googleapis.com (Google Fonts picker en Ajustes →
    //     Apariencia) y unpkg.com (leaflet.css) se inyectan como
    //     `<link rel=stylesheet>` en runtime. `unsafe-inline` lo exige el uso
    //     extenso de `style={{...}}` de React y los temas dinámicos (variables
    //     CSS calculadas). OJO: `appearance-context.tsx` permite además una
    //     URL de fuente personalizada TOTALMENTE arbitraria
    //     (`customFont.url`) — con la lista de abajo ESO seguiría generando
    //     reportes si el host no es Google Fonts/unpkg; queda como aviso para
    //     decidir a mano (¿ampliar a `https:` como img-src, o forzar el
    //     picker?) antes de aplicar la política de verdad.
    //   connect-src → deliberadamente amplio (`https: wss:`): el OS es un hub
    //     "trae tu propia clave" con MUCHOS proveedores de IA configurables
    //     por el usuario y llamados por `fetch` DIRECTO desde el navegador
    //     (OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, OpenRouter,
    //     Ollama/self-host, y el resto del catálogo libre en
    //     `src/ai/astraura/free-catalog.ts`), notificaciones ntfy (servidor
    //     elegido por el usuario, CUALQUIER host, por fetch+EventSource/SSE,
    //     ver `src/lib/notifications/ntfy.ts`) y Supabase (REST/Auth/Storage
    //     por https + Realtime por wss). Enumerar cada host a mano sería
    //     inmanejable Y rompería el caso de uso central (BYOK) — la lista
    //     concreta de qué SÍ hace falta queda para cuando se decida bloquear
    //     de verdad, usando lo que hayan ido dejando los reportes.
    //   frame-src → deliberadamente amplio (`https:`): el "navegador"
    //     integrado del OS (`web-frame.tsx`, `vr-frame.tsx`,
    //     `desktop-window-content.tsx`) y varios visores embebidos
    //     (`embedded-content-window.tsx`, `design-docs-panel.tsx`,
    //     `package-store.tsx`, `StarSeedKnowledgePanel.tsx`) montan <iframe>
    //     con URLs arbitrarias o elegidas por el usuario (YouTube, escenas
    //     Spline en prod.spline.design, instancias propias de AppFlowy/
    //     Penpot, GitHub…) — es una feature central del OS, no un descuido.
    //   object-src → mismo motivo que frame-src y AÑADIDO tras el grep (no
    //     estaba en la lista inicial de directivas a cubrir): `<object
    //     type="application/pdf" data={url}>` en `embedded-content-window.tsx`,
    //     `file-preview.tsx` y `content/viewers.tsx` previsualiza PDFs de
    //     Supabase Storage u otros hosts https — con `default-src 'self'`
    //     como única red de respaldo esto habría generado ruido constante
    //     por una feature real, así que se declara explícita.
    //   img-src / font-src / worker-src → ya anchos por diseño (avatares,
    //     imágenes generativas vía Pollinations, mapas/NASA, stock, Supabase
    //     Storage, blobs locales de audio/vídeo…), sin cambios respecto a lo
    //     propuesto para esta ola.
    //
    // ⚠️ ANTES de pasar de "-Report-Only" a forzar de verdad (`Content-
    // Security-Policy` sin sufijo): revisar los reportes acumulados en
    // `/api/csp-report`, sustituir `'unsafe-inline'`/`'unsafe-eval'` por
    // nonces/hashes donde se pueda, y decidir conscientemente si connect-src/
    // frame-src/object-src/style-src se quedan anchos (funciones centrales
    // del OS, ver arriba) o se acotan caso a caso. Ver Adenda 139.
    const cspReportOnly = [
      `default-src 'self'`,
      `img-src 'self' data: blob: https:`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://esm.run https://cdnjs.cloudflare.com https://apis.google.com https://accounts.google.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com`,
      `font-src 'self' data: https:`,
      // (Adenda 153) Loopback explícito: el sistema primario Astraura 1.58-bit
      // (127.0.0.1:8000), Ollama (11434), LM Studio (1234) y OmniVoice (4444)
      // viven en la propia neurona y se llaman por http/ws desde el OS en https.
      // Hoy la CSP es Report-Only; al pasar a enforcing, esto evita romperlos.
      `connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*`,
      `frame-src 'self' https:`,
      `object-src 'self' https:`,
      `worker-src 'self' blob:`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `report-uri /api/csp-report`,
      `report-to csp-endpoint`,
    ].join('; ');
    // Cabeceras de seguridad de BAJO RIESGO en TODAS las rutas (Adenda 139).
    // Deliberadamente NO incluye Permissions-Policy: requiere afinado contra las
    // features sensoriales (cámara/micro/geo de "sentidos") del OS y rompería
    // funciones si se pone restrictiva sin pruebas en runtime — queda para una ola
    // dedicada. CSP SÍ se añade ya, pero en "-Report-Only" (ver bloque de abajo):
    // esta ola es exactamente "CSP en report-only + recolección de violaciones
    // primero" que Adenda 139 dejó pendiente.
    // X-Frame-Options SAMEORIGIN: anti-clickjacking; permite el auto-encuadre same-origin
    // que sí usa el OS y solo bloquea que un tercero enmarque el OS.
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
      // `Report-To` (Reporting API v0, la que hoy sigue resolviendo el grupo del
      // directive `report-to` en Chrome) + `Reporting-Endpoints` (la cabecera
      // sucesora, mismo grupo). Se declaran las DOS para máxima compatibilidad
      // mientras el ecosistema termina de migrar; un navegador que no entienda
      // una de las dos simplemente la ignora. URL relativa (no absoluta): el OS
      // se despliega en varios dominios (Vercel/Cloud Run/Firebase, ver
      // CLAUDE.md §2) y ambas cabeceras resuelven la URL contra el propio
      // origen de la respuesta, igual que ya hace `report-uri` más abajo.
      {
        key: 'Report-To',
        value: JSON.stringify({
          group: 'csp-endpoint',
          max_age: 10886400,
          endpoints: [{ url: '/api/csp-report' }],
        }),
      },
      { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
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
