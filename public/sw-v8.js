/*
 * StarSeed OS — Service Worker v8 (SW1107A · 2026-11-07): la app entera disponible sin conexión.
 * ----------------------------------------------------------------------------
 * Petición de Alex (07-11): las apps instaladas deben funcionar sin internet en todas las secciones.
 * En escritorio manda el servidor local (APP1107A); en Android, en las apps ya instaladas y en el
 * navegador, este service worker. Contrato: architecture/apps-autonomas-sin-internet.md §9.1.
 *
 *   · Navegaciones: red primero (sin caché del edge: cada despliegue llega al momento, como antes). Sin
 *     red, con la pasarela caída (502/503/504) o a los 10 s sin respuesta: la página guardada (la de
 *     la build precargada o la última visitada) y, si no hay, /offline.html con lo que sí está guardado.
 *   · Cargas RSC (navegación interna de Next): red primero; sin red, la carga COMPLETA de esa ruta
 *     guardada en la precarga. Si no hay, una respuesta que hace a Next navegar «a la antigua» (y
 *     entonces entra la página guardada).
 *   · /_next/static/** (nombres con hash, inmutables) y medios: caché primero.
 *   · GET /api/* de lectura: red primero; sin red, la última respuesta buena (con la cabecera
 *     X-StarSeed-Sin-Conexion: 1). Solo los catálogos públicos de la lista blanca revisada de
 *     sw-logica.js (probada contra las rutas reales); lo de sesión, claves, consolas o estados en vivo
 *     nunca se guarda. POST/PUT/DELETE: nunca se tocan (sin red, los gestiona la app).
 *   · Precarga en segundo plano: tras el primer arranque con red, la página pide «PRECARGAR» y este SW
 *     baja el manifiesto del build (/precarga.json, lo escribe scripts/precarga-sw.mjs) y guarda, por
 *     orden de prioridad y con poca concurrencia, el código, el HTML y la carga RSC de cada página
 *     principal y los archivos de public/. Respeta el espacio libre, el ahorro de datos y los datos
 *     móviles; nunca en el servidor local de la app de escritorio (127.0.0.1). Se reanuda donde se quedó.
 *
 * Toda decisión vive en /sw-logica.js (pura). Sube SW_VERSION para invalidar las cachés del SW
 * (las de cada build se retiran solas cuando la siguiente build termina de precargarse).
 */
importScripts("/sw-logica.js");

const L = self.StarSeedSW;
const SW_VERSION = "v9-2026-11-07";
const PRECACHE = `starseed-precache-${SW_VERSION}`;
const RUNTIME = `starseed-runtime-${SW_VERSION}`;
const OFFLINE_URL = L.URL_SIN_CONEXION;

// Mínimo del arranque (se guarda al instalar; si alguno falla, se tolera).
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon-48.png",
  "/starseed-symbol-192.png",
  "/starseed-symbol-square.png",
];

// ── Instalar / activar ──────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PRECACHE);
        await Promise.all(
          PRECACHE_URLS.map(async (url) => {
            try {
              await cache.add(new Request(url, { cache: "reload" }));
            } catch (_) {
              /* recurso opcional */
            }
          })
        );
      } catch (_) {
        /* nunca bloqueamos la instalación */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sobran = L.cachesSobrantes(await caches.keys(), { precache: PRECACHE, runtime: RUNTIME });
        await Promise.all(sobran.map((k) => caches.delete(k)));
      } catch (_) {
        /* limpieza best-effort */
      }
      await self.clients.claim();
    })()
  );
});

// ── Mensajes de la página ───────────────────────────────────────────────────
//   "SKIP_WAITING"                 → activa ya el SW en espera (como siempre)
//   {tipo:"PRECARGAR", forzar?}    → una pasada de precarga (forzar: aunque haya datos móviles)
//   {tipo:"ESTADO_PRECARGA"}       → responde {tipo:"starseed:precarga", estado}
//   {tipo:"OLVIDAR_SESION"}        → borra lo guardado con datos de la sesión (al cerrar sesión)
self.addEventListener("message", (event) => {
  const d = event.data;
  if (d === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (!d || typeof d !== "object") return;
  const responder = (x) => {
    try {
      if (event.ports && event.ports[0]) event.ports[0].postMessage(x);
      else if (event.source && typeof event.source.postMessage === "function") event.source.postMessage(x);
    } catch (_) {
      /* la página se fue */
    }
  };
  if (d.tipo === "PRECARGAR") {
    event.waitUntil(precargar({ forzar: !!d.forzar }).then((e) => responder({ tipo: "starseed:precarga", estado: L.resumenEstado(e) })));
  } else if (d.tipo === "ESTADO_PRECARGA") {
    event.waitUntil(estadoActual().then((e) => responder({ tipo: "starseed:precarga", estado: L.resumenEstado(e) })));
  } else if (d.tipo === "OLVIDAR_SESION") {
    event.waitUntil(olvidarSesion().then(() => responder({ tipo: "starseed:sesion-olvidada" })));
  }
});

// ── (NOT1108A) Pulsar la notificación de un mensaje nuevo abre su chat ───────
// La pone la página (`showNotification` con `data.ruta`, src/lib/notifications/avisos-mensajes.ts). Si hay
// una ventana de la app, se enfoca y la página navega sin recargar (mensaje `starseed:abrir-ruta`); si no,
// se abre una en esa ruta. Solo rutas internas (`/…`, nunca `//…` ni otra web).
self.addEventListener("notificationclick", (event) => {
  const datos = (event.notification && event.notification.data) || {};
  const ruta =
    typeof datos.ruta === "string" && datos.ruta.startsWith("/") && !datos.ruta.startsWith("//") && datos.ruta.indexOf("\\") === -1
      ? datos.ruta
      : null;
  try {
    event.notification.close();
  } catch (_) {
    /* ya cerrada */
  }
  if (!ruta) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const propia = ventanas.find((v) => {
        try {
          return new URL(v.url).origin === self.location.origin;
        } catch (_) {
          return false;
        }
      });
      if (propia) {
        propia.postMessage({ type: "starseed:abrir-ruta", ruta });
        return typeof propia.focus === "function" ? propia.focus() : undefined;
      }
      return self.clients.openWindow ? self.clients.openWindow(ruta) : undefined;
    }),
  );
});

// ── Enrutado por tipo de petición (la clasificación es pura: sw-logica.js) ──
self.addEventListener("fetch", (event) => {
  const req = event.request;
  let tipo = "ignorar";
  try {
    tipo = L.clasificarPeticion({
      metodo: req.method,
      url: req.url,
      origen: self.location.origin,
      modo: req.mode,
      cabeceras: req.headers,
    });
  } catch (_) {
    return;
  }
  if (tipo === "navegacion") event.respondWith(navegacion(event));
  else if (tipo === "rsc") event.respondWith(cargaRsc(event));
  else if (tipo === "estatico") event.respondWith(recurso(event, true));
  else if (tipo === "medio") event.respondWith(recurso(event, false));
  else if (tipo === "api") {
    if (L.politicaApi({ url: req.url, cabeceras: req.headers }) === "respaldo") event.respondWith(api(event));
  } else if (tipo === "otro") event.respondWith(redPrimero(event));
  // 'ignorar' (y API sin respaldo): el navegador va directo a la red, como sin SW.
});

// ── Utilidades de caché ─────────────────────────────────────────────────────
let estadoMem = null;

async function leerEstado() {
  try {
    const c = await caches.open(L.CACHE_META);
    const r = await c.match(L.CLAVE_ESTADO);
    return r ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

async function estadoActual() {
  // `{}` = «leído y no hay»: no se vuelve a leer la caché en cada petición.
  if (!estadoMem) estadoMem = (await leerEstado()) || {};
  return estadoMem;
}

async function guardarEstado(e) {
  estadoMem = e;
  try {
    const c = await caches.open(L.CACHE_META);
    await c.put(L.CLAVE_ESTADO, new Response(JSON.stringify(e), { headers: { "Content-Type": "application/json" } }));
  } catch (_) {
    /* sin estado persistente: la próxima pasada recorre la lista */
  }
}

async function avisar(e) {
  try {
    const msg = { tipo: "starseed:precarga", estado: L.resumenEstado(e) };
    const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clientes) {
      try {
        c.postMessage(msg);
      } catch (_) {
        /* pestaña cerrada */
      }
    }
  } catch (_) {
    /* sin clientes */
  }
  return e;
}

async function guardarYAvisar(e) {
  await guardarEstado(e);
  return avisar(e);
}

/** Cachés donde buscar, en orden: builds (completas, la más nueva antes), arranque, ejecución. */
async function cachesEnOrden() {
  let builds = [];
  try {
    const e = await estadoActual();
    builds = L.ordenBuilds(await caches.keys(), (e && e.completos) || []);
  } catch (_) {
    /* sin Cache API */
  }
  return builds.concat([PRECACHE, RUNTIME]);
}

async function buscarEn(nombres, clave, opciones) {
  for (const n of nombres) {
    try {
      const c = await caches.open(n);
      const r = await c.match(clave, opciones);
      if (r) return r;
    } catch (_) {
      /* siguiente */
    }
  }
  return null;
}

async function buscarEnBuilds(clave) {
  const nombres = (await cachesEnOrden()).filter((n) => n.indexOf(L.PREFIJO_BUILD) === 0);
  return buscarEn(nombres, clave, { ignoreVary: true });
}

async function recortar(cache, max) {
  try {
    const claves = await cache.keys();
    const n = L.recortes(claves.length, max);
    for (let i = 0; i < n; i++) await cache.delete(claves[i]);
  } catch (_) {
    /* best-effort */
  }
}

let puestasRuntime = 0;
async function guardarRuntime(req, res) {
  try {
    const c = await caches.open(RUNTIME);
    await c.put(req, res);
    puestasRuntime++;
    if (puestasRuntime % 50 === 0) await recortar(c, L.MAX_RUNTIME);
  } catch (_) {
    /* sin espacio o respuesta no guardable: se sirve igual */
  }
}

/** Copia una respuesta con cabeceras nuevas (sin las de transporte, que ya no valen para el cuerpo leído). */
async function conCabeceras(res, extra) {
  const h = new Headers(res.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  for (const k of Object.keys(extra || {})) h.set(k, extra[k]);
  return new Response(await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers: h });
}

function datosRespuesta(res) {
  return {
    estado: res.status,
    tipo: res.headers.get("content-type"),
    cacheControl: res.headers.get("cache-control"),
    longitud: res.headers.get("content-length"),
    redirigida: res.redirected,
    opaca: res.type === "opaqueredirect",
  };
}

function vacia(estado, texto) {
  return new Response("", { status: estado, statusText: texto, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// ── Estrategias ─────────────────────────────────────────────────────────────
const AGOTADO = { agotado: true };

/** Página guardada para esta navegación: la de la build precargada y, si no, la última visitada. */
async function paginaGuardada(req) {
  const url = new URL(req.url);
  const deBuild = await buscarEnBuilds(L.claveHtml(url.origin, url.pathname));
  if (deBuild) return deBuild;
  try {
    const rt = await caches.open(RUNTIME);
    return (
      (await rt.match(req, { ignoreVary: true })) ||
      (await rt.match(req, { ignoreVary: true, ignoreSearch: true })) ||
      null
    );
  } catch (_) {
    return null;
  }
}

/** /offline.html: dice que esta página aún no está guardada y enseña las que sí. */
async function paginaSinConexion() {
  const r = await buscarEn(await cachesEnOrden(), OFFLINE_URL, { ignoreVary: true });
  return r || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// Navegación: red primero SIN caché del edge (cada despliegue llega al momento). La copia buena se
// guarda para después. Sin red → la página guardada → /offline.html. Red lenta (10 s) → la guardada si
// existe, y la de la red sigue llegando a la caché para la próxima vez.
async function navegacion(event) {
  const req = event.request;
  const red = fetch(req, { cache: "no-store" }).then((res) => {
    if (L.respuestaHtmlGuardable(datosRespuesta(res))) event.waitUntil(guardarRuntime(req, res.clone()));
    return res;
  });
  // Mantiene vivo el SW hasta que llegue la respuesta de la red aunque ya se haya servido la copia.
  event.waitUntil(red.then(() => {}, () => {}));
  let reloj = null;
  const tope = new Promise((resolver) => {
    reloj = setTimeout(() => resolver(AGOTADO), L.TOPE_NAVEGACION_MS);
  });
  try {
    const primero = await Promise.race([red, tope]);
    if (primero !== AGOTADO) {
      if (L.esFalloDePasarela(primero.status)) {
        const copia = await paginaGuardada(req);
        if (copia) return copia;
      }
      return primero;
    }
    const copia = await paginaGuardada(req);
    if (copia) return copia;
    return await red;
  } catch (_) {
    return (await paginaGuardada(req)) || (await paginaSinConexion());
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

// RSC (navegación interna del App Router): red primero. Sin red, la carga COMPLETA de la ruta guardada
// en la precarga (Next la aplica desde la raíz; si es de otra build, el propio Next navega «a la antigua»
// y entra la página guardada). Sin copia → 504 de texto: Next hace lo mismo. Las precargas por segmento
// (otro formato) nunca reciben la carga completa.
async function cargaRsc(event) {
  const req = event.request;
  try {
    return await fetch(req);
  } catch (_) {
    if (!L.esPrefetchSegmento(req.headers)) {
      const r = (await buscarEnBuilds(L.claveRsc(req.url))) || (await buscarEnBuilds(L.claveRsc(req.url, false)));
      if (r) return r;
    }
    return vacia(504, "Sin conexion");
  }
}

// /_next/static/** (hash en el nombre: inmutable) y medios de public/: caché primero; si no, red y se guarda.
async function recurso(event, conHash) {
  const req = event.request;
  const guardada = await buscarEn(await cachesEnOrden(), req, { ignoreVary: true, ignoreSearch: conHash });
  if (guardada) return guardada;
  try {
    const res = await fetch(req);
    if (res && res.ok && !res.redirected) event.waitUntil(guardarRuntime(req, res.clone()));
    return res;
  } catch (_) {
    return vacia(504, "Gateway Timeout");
  }
}

// GET /api/* de lectura (ya filtrado por politicaApi): red primero; sin red, la última respuesta buena.
async function api(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (L.respuestaApiGuardable(datosRespuesta(res))) event.waitUntil(guardarApi(req, res.clone()));
    return res;
  } catch (_) {
    const copia = await respaldoApi(req);
    return copia || Response.error();
  }
}

async function guardarApi(req, res) {
  try {
    const guardable = await conCabeceras(res, { "X-StarSeed-Guardado": new Date().toISOString() });
    const cuerpo = await guardable.clone().arrayBuffer();
    if (cuerpo.byteLength > L.MAX_BYTES_API) return;
    const c = await caches.open(L.CACHE_API);
    await c.put(req, guardable);
    await recortar(c, L.MAX_API);
  } catch (_) {
    /* sin espacio: no pasa nada */
  }
}

async function respaldoApi(req) {
  try {
    const c = await caches.open(L.CACHE_API);
    const r = await c.match(req, { ignoreVary: true });
    return r ? await conCabeceras(r, { "X-StarSeed-Sin-Conexion": "1" }) : null;
  } catch (_) {
    return null;
  }
}

// Resto de GET del mismo origen (manifest, /_next/image, JSON públicos…): red primero, copia sin red.
async function redPrimero(event) {
  const req = event.request;
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res && res.ok && !res.redirected) event.waitUntil(guardarRuntime(req, res.clone()));
    return res;
  } catch (_) {
    const r = await buscarEn(await cachesEnOrden(), req, { ignoreVary: true });
    return r || vacia(504, "Gateway Timeout");
  }
}

// ── Precarga en segundo plano ───────────────────────────────────────────────
let enCurso = null;

/** Una sola pasada a la vez; las peticiones que llegan mientras tanto esperan a la misma. */
function precargar(op) {
  if (enCurso) return enCurso;
  enCurso = pasadaDePrecarga(op || {})
    .catch(() => estadoMem)
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

function opcionesDescarga(clase) {
  // HTML y RSC: sin caché HTTP y SIN seguir redirecciones (una página que manda a /login no se guarda
  // como si fuera la página). RSC sin árbol del router → Next devuelve la carga completa desde la raíz.
  if (clase === "html") return { cache: "no-store", credentials: "same-origin", redirect: "manual", headers: { Accept: "text/html" } };
  if (clase === "rsc") return { cache: "no-store", credentials: "same-origin", redirect: "manual", headers: { RSC: "1" } };
  // public/ no lleva hash: se revalida (304 si no cambió). /_next/static sí: la caché HTTP vale.
  if (clase === "publico") return { cache: "no-cache", credentials: "same-origin" };
  return { cache: "default", credentials: "same-origin" };
}

/** Baja y guarda un elemento. → 'guardar' | 'permanente' | 'transitorio' | 'sin-espacio'. */
async function precargarElemento(cache, el) {
  try {
    if (await cache.match(el.clave, { ignoreVary: true })) return "guardar"; // ya estaba
    if (el.clase === "estatico") {
      // Mismo nombre con hash = mismo contenido: la copia de otra build (o de la caché de ejecución) vale.
      const otra = await caches.match(el.clave, { ignoreSearch: true, ignoreVary: true });
      if (otra) {
        await cache.put(el.clave, otra);
        return "guardar";
      }
    }
    let res;
    try {
      res = await fetch(el.url, opcionesDescarga(el.clase));
    } catch (_) {
      return "transitorio";
    }
    const veredicto = L.clasificarResultado(datosRespuesta(res), el.clase);
    if (veredicto !== "guardar") return veredicto;
    await cache.put(el.clave, res);
    return "guardar";
  } catch (e) {
    return e && e.name === "QuotaExceededError" ? "sin-espacio" : "transitorio";
  }
}

async function espacioLibre() {
  try {
    const est = await self.navigator.storage.estimate();
    if (est && typeof est.quota === "number" && typeof est.usage === "number") return Math.max(0, est.quota - est.usage);
  } catch (_) {
    /* sin StorageManager */
  }
  return null;
}

async function pasadaDePrecarga({ forzar }) {
  const ahora = Date.now();
  const previo = (await leerEstado()) || {};
  estadoMem = previo;
  const con = self.navigator && self.navigator.connection;
  const decision = L.debePrecargar({
    host: self.location.hostname,
    enLinea: self.navigator ? self.navigator.onLine : null,
    ahorroDatos: con ? con.saveData : null,
    tipoConexion: con ? con.type : null,
    efectiva: con ? con.effectiveType : null,
    forzar,
    ahora,
    ultimoIntento: previo.ultimoIntento,
  });
  if (!decision.si) return avisar({ ...previo, fase: previo.fase || "en-espera", motivo: decision.motivo });

  let manifiesto = null;
  try {
    const res = await fetch(L.URL_MANIFIESTO, { cache: "no-cache", credentials: "same-origin" });
    if (res.ok) manifiesto = L.validarManifiesto(await res.json());
  } catch (_) {
    /* sin manifiesto: queda la caché de ejecución */
  }
  if (!manifiesto) return guardarYAvisar({ ...previo, ultimoIntento: ahora, fase: "sin-manifiesto", motivo: "sin-manifiesto" });
  if (!L.hayQueRecorrer({ buildId: manifiesto.buildId, estado: previo, ahora, forzar })) {
    return guardarYAvisar({ ...previo, ultimoIntento: ahora });
  }

  const nombres = await caches.keys();
  const existentes = nombres.map(L.idDeBuild).filter(Boolean);
  const completos = (previo.completos || []).filter((id) => existentes.indexOf(id) !== -1 && id !== manifiesto.buildId);
  const bytesPorBuild = previo.bytesPorBuild || {};
  // Lo que ocupan las builds anteriores se libera cuando esta termine: cuenta como libre.
  let libres = await espacioLibre();
  if (libres != null) {
    for (const id of existentes) if (id !== manifiesto.buildId && typeof bytesPorBuild[id] === "number") libres += bytesPorBuild[id];
  }
  const plan = L.planificarPrecarga({ manifiesto, origen: self.location.origin, libres });
  const estado = {
    formato: 1,
    buildId: manifiesto.buildId,
    fase: "precargando",
    nivel: plan.nivel,
    planificados: plan.elementos.length,
    guardados: 0,
    permanentes: 0,
    transitorios: 0,
    rutas: plan.rutas,
    rutasTotales: plan.rutasTotales,
    bytes: 0,
    bytesPlan: plan.bytes,
    bytesTotales: plan.bytesTotales,
    empezado: ahora,
    terminado: null,
    ultimoIntento: ahora,
    motivo: null,
    completo: false,
    completos,
    bytesPorBuild,
    rutasEstaticas: manifiesto.rutas.filter((r) => r.e).map((r) => r.r),
  };
  if (plan.nivel === "nada") {
    return guardarYAvisar({ ...estado, fase: "sin-espacio", motivo: "sin-espacio", terminado: Date.now() });
  }
  await guardarYAvisar(estado);

  const cache = await caches.open(L.nombreBuild(manifiesto.buildId));
  const limite = Date.now() + L.TOPE_RUN_MS;
  let parar = null;
  let i = 0;
  let hechos = 0;
  const trabajador = async () => {
    while (!parar && i < plan.elementos.length) {
      if (Date.now() > limite) {
        parar = "pausa";
        break;
      }
      if (self.navigator && self.navigator.onLine === false) {
        parar = "sin-red";
        break;
      }
      const el = plan.elementos[i++];
      const r = await precargarElemento(cache, el);
      if (r === "guardar") {
        estado.guardados++;
        estado.bytes += el.bytes || 0;
      } else if (r === "permanente") estado.permanentes++;
      else if (r === "sin-espacio") {
        estado.transitorios++;
        parar = "sin-espacio";
      } else estado.transitorios++;
      hechos++;
      if (hechos % 40 === 0) await guardarYAvisar(estado);
    }
  };
  const trabajadores = [];
  for (let t = 0; t < L.CONCURRENCIA; t++) trabajadores.push(trabajador());
  await Promise.all(trabajadores);

  estado.terminado = Date.now();
  estado.completo = !parar && estado.transitorios === 0;
  estado.fase = estado.completo ? "lista" : parar === "pausa" ? "en-pausa" : parar || "incompleta";
  estado.motivo = parar || (estado.transitorios ? "errores-de-red" : null);
  estado.bytesPorBuild = { ...bytesPorBuild, [manifiesto.buildId]: estado.bytes };
  if (estado.completo) {
    // Esta build ya está entera: las anteriores sobran.
    try {
      const sobran = L.buildsSobrantes(await caches.keys(), manifiesto.buildId);
      await Promise.all(sobran.map((n) => caches.delete(n)));
    } catch (_) {
      /* se retiran en la próxima */
    }
    estado.completos = [manifiesto.buildId];
    estado.bytesPorBuild = { [manifiesto.buildId]: estado.bytes };
  }
  return guardarYAvisar(estado);
}

// ── Cerrar sesión: fuera lo guardado con datos de la sesión ─────────────────
async function olvidarSesion() {
  try {
    await caches.delete(L.CACHE_API);
  } catch (_) {
    /* no había */
  }
  const e = (await leerEstado()) || {};
  const estaticas = e.rutasEstaticas || [];
  let nombres = [];
  try {
    nombres = (await caches.keys()).filter((n) => n === RUNTIME || n.indexOf(L.PREFIJO_BUILD) === 0);
  } catch (_) {
    /* sin Cache API */
  }
  for (const n of nombres) {
    try {
      const c = await caches.open(n);
      for (const k of await c.keys()) if (L.esEntradaPersonal(k.url, estaticas)) await c.delete(k);
    } catch (_) {
      /* siguiente */
    }
  }
  // La build deja de estar completa: la próxima pasada (ya con la sesión nueva) rellena lo borrado.
  if (e.buildId) await guardarYAvisar({ ...e, completo: false, terminado: null, fase: "incompleta", motivo: "sesion-cerrada" });
}
