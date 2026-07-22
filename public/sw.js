/*
 * StarSeed OS — Service Worker
 * ----------------------------------------------------------------------------
 * Estrategia (defensiva, no debe romper la app si algo falla):
 *   - Precarga del "app shell" + página offline de respaldo.
 *   - Navegaciones (documentos HTML): network-first → fallback a caché → offline.
 *   - /api/* y peticiones no-GET: network-only (NUNCA se cachean).
 *   - Estáticos (_next/static, imágenes, fuentes): cache-first con relleno.
 *   - Caché versionada; las versiones antiguas se limpian en 'activate'.
 *
 * Bumpea SW_VERSION cuando quieras invalidar todas las cachés anteriores.
 */

const SW_VERSION = "v6-2026-07-21";
const PRECACHE = `starseed-precache-${SW_VERSION}`;
const RUNTIME = `starseed-runtime-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Recursos mínimos del app shell. Se mantiene corto a propósito: si alguno
// falla al precargarse, lo toleramos (no abortamos la instalación).
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon-48.png",
  "/starseed-symbol-192.png",
  "/starseed-symbol-square.png",
];

// ── Install: precarga tolerante a fallos ────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PRECACHE);
        // addAll es atómico; si un recurso falla, falla todo. Por eso
        // precargamos uno a uno y absorbemos errores individuales.
        await Promise.all(
          PRECACHE_URLS.map(async (url) => {
            try {
              await cache.add(new Request(url, { cache: "reload" }));
            } catch (_) {
              /* recurso opcional; lo ignoramos */
            }
          })
        );
      } catch (_) {
        /* nunca bloqueamos la instalación */
      }
      // Activa el nuevo SW de inmediato (se complementa con clients.claim).
      await self.skipWaiting();
    })()
  );
});

// ── Activate: limpia cachés de versiones anteriores ─────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key !== PRECACHE && key !== RUNTIME)
            .filter((key) => key.startsWith("starseed-"))
            .map((key) => caches.delete(key))
        );
      } catch (_) {
        /* limpieza best-effort */
      }
      await self.clients.claim();
    })()
  );
});

// Permite a la app forzar la activación del SW en espera (postMessage).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
// SOLO medios verdaderamente inmutables van cache-first (imágenes, fuentes,
// audio). El CÓDIGO (js/css) va NETWORK-FIRST para que cada despliegue llegue
// SIEMPRE al usuario sin quedarse con una versión vieja cacheada (causa del
// "no se actualiza nada"). La caché de código queda solo como respaldo offline.
function isImmutableMedia(url) {
  return /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|mp3|wav|ogg|mp4|webm)$/i.test(
    url.pathname
  );
}
function isCode(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  return /\.(?:js|css)$/i.test(url.pathname);
}

// ── Fetch: enrutado por tipo de petición ────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo gestionamos GET. POST/PUT/DELETE y demás van directos a la red.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Solo mismo origen. Recursos de terceros (CDNs, analíticas, etc.) pasan.
  if (url.origin !== self.location.origin) return;

  // API: nunca cachear. Network-only para no servir datos obsoletos.
  if (url.pathname.startsWith("/api/")) return;

  // Navegaciones (documentos): network-first → caché → offline.
  const isNavigation =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Medios inmutables (imágenes/fuentes/audio): cache-first (rápido, no cambian).
  if (isImmutableMedia(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // CÓDIGO (js/css, _next/static): NETWORK-FIRST → siempre el último despliegue;
  // la caché solo sirve si NO hay red (offline). Esto garantiza que las
  // actualizaciones lleguen a TODOS los usuarios/dispositivos automáticamente.
  if (isCode(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Resto de GET mismo-origen: network-first ligero.
  event.respondWith(networkFirst(request));
});

// ── Estrategias ─────────────────────────────────────────────────────────────

// Navegación: intenta red (sin cache del edge, siempre build reciente); si
// falla, sirve la última versión cacheada de esa ruta y, en último término,
// la página offline. El `cache: 'no-store'` fuerza al edge a revalidar contra
// el origen y entregar el HTML/nuevo build, evitando servir HTML viejo (304)
// que invocaría chunks colisionantes cacheados.
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    // Guarda una copia para servir offline más adelante.
    try {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    } catch (_) {
      /* ignora errores de caché */
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Sin conexión", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

// Estáticos: sirve de caché si existe; si no, va a la red y la cachea.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        const cache = await caches.open(RUNTIME);
        cache.put(request, response.clone());
      } catch (_) {
        /* ignora errores de caché */
      }
    }
    return response;
  } catch (_) {
    // Sin red y sin caché: respuesta vacía controlada (no rompe la app).
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

// Genérica: red primero (sin cache del edge, siempre build reciente), caché
// como respaldo offline. El `cache: 'no-store'` evita que el edge sirva
// chunks viejos (304) que colisionan tras un despliegue.
async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      try {
        const cache = await caches.open(RUNTIME);
        cache.put(request, response.clone());
      } catch (_) {
        /* ignora errores de caché */
      }
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}
