// scripts/precarga-sw.mjs — manifiesto de precarga del service worker (SW1107A · 2026-11-07)
//
// Corre en `postbuild` (npm lo lanza solo tras `npm run build`, como `prebuild` con version.json) y lo
// puede lanzar el CI a mano. Lee el build de Next (`.next` o `STARSEED_DIST`) y escribe
// `public/precarga.json`: todos los `/_next/static/**` del build, las páginas principales (sin las de
// desarrolladores ni las de parámetros), los chunks iniciales de cada página y los archivos de `public/`.
// El service worker (`public/sw-v8.js`) lo lee para dejar la app entera disponible sin conexión.
//
// NUNCA rompe un build: si algo falla avisa, borra un `precarga.json` viejo (apuntaría a otra build) y
// sale con 0. Con `--estricto` sale con 1 (para probarlo). Contrato: architecture/apps-autonomas-sin-internet.md §9.1.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// La MISMA lógica que usa el service worker: una sola lista de rutas excluidas y una sola normalización.
const L = require("../public/sw-logica.js");

export const NOMBRE_SALIDA = "precarga.json";
export const MAX_BYTES_PUBLICO = 2 * 1000 * 1000;
/** Archivos de `public/` que no se precargan: los del propio SW, los generados por build y los de depuración. */
const PUBLICOS_FUERA = /^\/(?:sw-[\w-]+\.js|version\.json|precarga\.json|inject[\w-]*\.html)$/;

function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf-8"));
}

function aPosix(r) {
  return r.split(sep).join("/");
}

/** Como `encodeURIPath` de Next: cada tramo con encodeURIComponent («[id]» → «%5Bid%5D»). */
export function codificarRuta(rel) {
  return rel.split("/").map((t) => encodeURIComponent(t)).join("/");
}

/** Archivos de una carpeta, recursivo, ordenados (salida determinista). */
function listar(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const pila = [dir];
  while (pila.length) {
    const d = pila.pop();
    for (const nombre of readdirSync(d)) {
      if (nombre.startsWith(".")) continue;
      const ruta = join(d, nombre);
      const st = statSync(ruta);
      if (st.isDirectory()) pila.push(ruta);
      else if (st.isFile()) out.push({ ruta, rel: aPosix(relative(dir, ruta)), bytes: st.size });
    }
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** Claves del app-build-manifest que cuelgan de una página: sus layouts, plantillas, cargas y errores. */
export function clavesDePagina(clavePagina) {
  const base = clavePagina.replace(/\/page$/, "");
  const tramos = base.split("/").filter(Boolean);
  const claves = [];
  for (let i = 0; i <= tramos.length; i++) {
    const prefijo = i === 0 ? "" : "/" + tramos.slice(0, i).join("/");
    for (const tipo of ["layout", "template", "loading", "error", "not-found"]) claves.push(`${prefijo}/${tipo}`);
  }
  claves.push(clavePagina);
  return claves;
}

/** Tamaño de HTML + RSC prerenderizados de una ruta (0 si no hay). */
function bytesPrerender(dist, ruta) {
  const base = ruta === "/" ? "index" : ruta.slice(1);
  let total = 0;
  for (const ext of [".html", ".rsc"]) {
    try { total += statSync(join(dist, "server", "app", base + ext)).size; } catch { /* dinámica */ }
  }
  return total;
}

/**
 * Construye el manifiesto a partir de un build de Next. Lanza si falta algo imprescindible.
 * @param {{dist:string, publico:string, generado?:string}} op
 */
export function construirManifiesto({ dist, publico, generado }) {
  const buildId = readFileSync(join(dist, "BUILD_ID"), "utf-8").trim();
  if (!/^[\w-]{1,64}$/.test(buildId)) throw new Error(`BUILD_ID raro: «${buildId.slice(0, 80)}»`);
  const rutasApp = leerJson(join(dist, "app-path-routes-manifest.json"));
  let prerender = {};
  try { prerender = leerJson(join(dist, "prerender-manifest.json")).routes || {}; } catch { /* sin SSG */ }
  let appBuild = {};
  try { appBuild = leerJson(join(dist, "app-build-manifest.json")).pages || {}; } catch { /* sin chunks por página */ }
  let buildManifest = {};
  try { buildManifest = leerJson(join(dist, "build-manifest.json")); } catch { /* opcional */ }

  // Estáticos: TODO /_next/static/** (sin mapas de código), con la URL codificada como la pide el navegador.
  const estaticos = [];
  const tamanos = [];
  const indice = new Map(); // ruta cruda dentro de static/ → índice
  for (const f of listar(join(dist, "static"))) {
    if (f.rel.endsWith(".map")) continue;
    indice.set(f.rel, estaticos.length);
    estaticos.push(`/_next/static/${codificarRuta(f.rel)}`);
    tamanos.push(f.bytes);
  }
  const aIndices = (lista) => {
    const out = [];
    for (const archivo of lista || []) {
      const i = indice.get(String(archivo).replace(/^\/+/, "").replace(/^static\//, ""));
      if (i !== undefined && !out.includes(i)) out.push(i);
    }
    return out;
  };

  // Código común a todas las páginas: arranque de Next + layout raíz.
  const comunes = aIndices([
    ...(buildManifest.rootMainFiles || []),
    ...(buildManifest.polyfillFiles || []),
    ...(appBuild["/layout"] || []),
  ]);
  const enComunes = new Set(comunes);

  // Páginas: solo `…/page`, sin parámetros ni consolas (misma regla que el SW).
  const porRuta = new Map();
  for (const [clave, ruta] of Object.entries(rutasApp)) {
    if (!clave.endsWith("/page") || typeof ruta !== "string") continue;
    const r = L.normalizarRuta(ruta);
    if (L.rutaExcluida(r) || porRuta.has(r)) continue;
    const chunks = [];
    for (const k of clavesDePagina(clave)) chunks.push(...(appBuild[k] || []));
    const c = aIndices(chunks).filter((i) => !enComunes.has(i));
    const medido = bytesPrerender(dist, r);
    porRuta.set(r, { r, e: prerender[r] ? 1 : 0, c, b: medido > 0 ? medido : L.BYTES_RUTA_POR_DEFECTO });
  }
  const rutas = [...porRuta.values()].sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));

  // public/: lo que pide la página (iconos, imágenes, sonidos) sin lo del SW ni lo de depuración.
  const publicos = [];
  const tamanosPublicos = [];
  for (const f of listar(publico)) {
    if (PUBLICOS_FUERA.test(`/${f.rel}`) || f.rel.endsWith(".map") || f.bytes > MAX_BYTES_PUBLICO) continue;
    const url = `/${codificarRuta(f.rel)}`;
    publicos.push(url);
    tamanosPublicos.push(f.bytes);
  }

  const manifiesto = {
    formato: L.FORMATO_MANIFIESTO,
    buildId,
    generado: generado || new Date().toISOString(),
    estaticos,
    tamanos,
    comunes,
    rutas,
    publicos,
    tamanosPublicos,
  };
  const suma = (xs) => xs.reduce((a, b) => a + b, 0);
  const esenciales = new Set(comunes);
  for (const r of rutas) for (const i of r.c) esenciales.add(i);
  const resumen = {
    buildId,
    rutas: rutas.length,
    rutasEstaticas: rutas.filter((r) => r.e).length,
    estaticos: estaticos.length,
    bytesEstaticos: suma(tamanos),
    esenciales: esenciales.size,
    bytesEsenciales: suma([...esenciales].map((i) => tamanos[i])),
    publicos: publicos.length,
    bytesPublicos: suma(tamanosPublicos),
    bytesPaginas: suma(rutas.map((r) => r.b)),
  };
  resumen.bytesTotales = resumen.bytesEstaticos + resumen.bytesPublicos + resumen.bytesPaginas;
  return { manifiesto, resumen };
}

function mb(n) {
  return `${(n / 1e6).toFixed(1)} MB`;
}

/** Escribe `<publico>/precarga.json` sin dejarlo nunca a medias (temporal + renombrar). */
export function escribirManifiesto(publico, manifiesto) {
  mkdirSync(publico, { recursive: true });
  const destino = join(publico, NOMBRE_SALIDA);
  const tmp = `${destino}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(manifiesto));
  renameSync(tmp, destino);
  return destino;
}

function argumento(argv, nombre) {
  const i = argv.indexOf(nombre);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

/**
 * CLI. Devuelve el código de salida (0 salvo `--estricto` con fallo).
 * @param {string[]} [argv]
 * @param {Record<string, string | undefined>} [entorno]
 * @param {string} [cwd]
 * @returns {number}
 */
export function principal(argv = process.argv.slice(2), entorno = process.env, cwd = process.cwd()) {
  const estricto = argv.includes("--estricto");
  const dist = resolve(cwd, argumento(argv, "--dist") || entorno.STARSEED_DIST || ".next");
  const publico = resolve(cwd, argumento(argv, "--public") || "public");
  const aviso = (msg) => {
    // eslint-disable-next-line no-console
    console.warn(`${entorno.GITHUB_ACTIONS ? "::warning::" : ""}[precarga-sw] ${msg}`);
  };
  try {
    const { manifiesto, resumen } = construirManifiesto({ dist, publico });
    const destino = escribirManifiesto(publico, manifiesto);
    // eslint-disable-next-line no-console
    console.log(
      `[precarga-sw] ${relative(cwd, destino) || destino} → build ${resumen.buildId} · ${resumen.rutas} páginas ` +
        `(${resumen.rutasEstaticas} estáticas) · ${resumen.estaticos} estáticos (${mb(resumen.bytesEstaticos)}; ` +
        `iniciales ${resumen.esenciales}, ${mb(resumen.bytesEsenciales)}) · ${resumen.publicos} de public/ ` +
        `(${mb(resumen.bytesPublicos)}) · HTML+RSC ≈ ${mb(resumen.bytesPaginas)} · total ≈ ${mb(resumen.bytesTotales)}`,
    );
    return 0;
  } catch (e) {
    aviso(`no se generó el manifiesto (${e && e.message ? e.message : e}); la app sigue con la caché de ejecución.`);
    try { rmSync(join(publico, NOMBRE_SALIDA), { force: true }); } catch { /* nada que borrar */ }
    return estricto ? 1 : 0;
  }
}

const esCli = (() => {
  try { return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (esCli) process.exitCode = principal();
