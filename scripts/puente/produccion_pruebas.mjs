// Humo de producción sobre una vista previa (puerta 4 de §3 del director de producción).
// Uso: node produccion_pruebas.mjs --base <url> --rutas /,/escritorios --sha <sha>
//      --salida <json> [--ultima-buena <json>] [--sin-capturas]
// Sale con código 1 si hay bloqueos.

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const TAMANOS = [
  [360, 780], [430, 932], [768, 1024], [1280, 800], [1920, 1080],
];
const PRESUPUESTO_TTFB_MS = 800;
const ANCHO_MOVIL_MAX = 767;

function presupuestoLcp(ancho) {
  return ancho <= ANCHO_MOVIL_MAX ? 4000 : 2500;
}

function leerPermitidos() {
  const ruta = join(AQUI, "produccion-consola-permitidos.json");
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    return Array.isArray(datos.permitidos) ? datos.permitidos : [];
  } catch {
    return [];
  }
}

function errorPermitido(texto, permitidos) {
  return permitidos.some((patron) => texto.includes(patron));
}

function combinaciones() {
  const combos = [];
  for (const [ancho, alto] of TAMANOS) {
    for (const modo of ["claro", "oscuro"]) {
      combos.push({ ancho, alto, modo, movimientoReducido: false });
    }
  }
  combos.push({ ancho: 430, alto: 932, modo: "claro", movimientoReducido: true });
  return combos;
}

const destinoCapturas = (sha, carpeta) =>
  join(RAIZ, "starseed_memory_root", "produccion", "capturas", sha, carpeta);

async function versionServida(base) {
  try {
    const respuesta = await fetch(base.replace(/\/$/, "") + "/version.json", {
      signal: AbortSignal.timeout(10000),
    });
    if (!respuesta.ok) return null;
    return await respuesta.json();
  } catch {
    return null;
  }
}

async function ejecutarLote(lote, base, sha, capturas, resultados, fallos, avisos) {
  const opciones = {};
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    opciones.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
  }
  const navegador = await chromium.launch(opciones);
  try {
    for (const ruta of lote) {
      const permiteConcurrencia = 3;
      for (let i = 0; i < combinaciones().length; i += permiteConcurrencia) {
        const trozo = combinaciones().slice(i, i + permiteConcurrencia);
        await Promise.all(trozo.map(async (combo) => {
          const contexto = await navegador.newContext({
            viewport: { width: combo.ancho, height: combo.alto },
            colorScheme: combo.modo === "oscuro" ? "dark" : "light",
            reducedMotion: combo.movimientoReducido ? "reduce" : "no-preference",
          });
          const nombreBase = ruta.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "raiz";
          let r;
          try {
            r = await probarPagina(contexto, base, ruta, combo, capturas, nombreBase);
          } catch (error) {
            r = { estado: 0, errores: ["pagina: " + String(error)], ttfb_ms: null,
                  lcp_ms: null, hidratacion: false, desborde: false, sw: false };
          } finally {
            await contexto.close();
          }
          const clave = `${ruta} @ ${combo.ancho}x${combo.alto} ${combo.modo}` +
            (combo.movimientoReducido ? " mr" : "");
          resultados[clave] = r;
          if (r.estado >= 400 || r.estado === 0) {
            fallos.push(`${clave}: HTTP ${r.estado}`);
          }
          if (r.hidratacion) fallos.push(`${clave}: error de hidratación`);
          if (r.desborde) fallos.push(`${clave}: desborde horizontal`);
          if (!r.sw) avisos.push(`${clave}: service worker no registrado`);
          if (r.ttfb_ms != null && r.ttfb_ms > PRESUPUESTO_TTFB_MS) {
            avisos.push(`${clave}: TTFB ${r.ttfb_ms} ms > ${PRESUPUESTO_TTFB_MS}`);
          }
          if (r.lcp_ms != null && r.lcp_ms > presupuestoLcp(combo.ancho)) {
            avisos.push(`${clave}: LCP ${r.lcp_ms} ms > ${presupuestoLcp(combo.ancho)}`);
          }
        }));
      }
    }
  } finally {
    await navegador.close();
  }
  return sha;
}

async function probarPagina(contexto, base, ruta, combo, capturas, nombreBase) {
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("console", (mensaje) => {
    if (mensaje.type() === "error") errores.push(mensaje.text());
  });
  pagina.on("pageerror", (error) => errores.push(String(error)));
  const url = base.replace(/\/$/, "") + ruta;
  let estado = 0;
  let inicio = Date.now();
  let respuesta = null;
  try {
    respuesta = await pagina.goto(url, { waitUntil: "load", timeout: 45000 });
    estado = respuesta ? respuesta.status() : 0;
    await pagina.waitForTimeout(800);
  } catch (error) {
    errores.push("navegacion: " + String(error && error.message ? error.message : error));
  }
  const ttfbMs = respuesta
    ? (await respuesta.request().timing()).responseStart ?? null
    : null;
  const datos = await pagina.evaluate(() => {
    const salida = { lcpMs: null, hidratacion: false, desborde: false };
    const entradas = performance.getEntriesByType("largest-contentful-paint");
    if (entradas.length > 0) {
      salida.lcpMs = Math.round(entradas[entradas.length - 1].startTime);
    } else {
      const pintura = performance.getEntriesByType("paint")
        .filter((e) => e.name === "largest-contentful-paint");
      if (pintura.length > 0) salida.lcpMs = Math.round(pintura[0].startTime);
    }
    salida.desborde =
      document.documentElement.scrollWidth > window.innerWidth + 1;
    const cuerpo = document.body ? document.body.innerText : "";
    salida.hidratacion = /Hydration failed|hydrat/i.test(cuerpo);
    return salida;
  }).catch(() => ({ lcpMs: null, hidratacion: false, desborde: false }));
  let swRegistrado = false;
  try {
    swRegistrado = await pagina.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registros = await navigator.serviceWorker.getRegistrations();
      return registros.length > 0;
    });
  } catch { /* sin SW accesible */ }
  if (capturas) {
    const carpeta = destinoCapturas(capturas, `${combo.ancho}x${combo.alto}`);
    mkdirSync(carpeta, { recursive: true });
    const nombre = `${nombreBase}-${combo.modo}${combo.movimientoReducido ? "-mr" : ""}.png`;
    await pagina.screenshot({ path: join(carpeta, nombre) }).catch(() => {});
  }
  await pagina.close();
  return {
    estado,
    ttfb_ms: ttfbMs != null ? Math.max(0, Math.round(ttfbMs)) : null,
    lcp_ms: datos.lcpMs,
    duracion_ms: Date.now() - inicio,
    errores,
    hidratacion: datos.hidratacion,
    desborde: datos.desborde,
    sw: swRegistrado,
  };
}

function argumentos(argv) {
  const args = { rutas: "/", sinCapturas: false, ultimaBuena: null, salida: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--rutas") args.rutas = argv[++i];
    else if (a === "--sha") args.sha = argv[++i];
    else if (a === "--salida") args.salida = argv[++i];
    else if (a === "--ultima-buena") args.ultimaBuena = argv[++i];
    else if (a === "--sin-capturas") args.sinCapturas = true;
  }
  if (!args.base || !args.sha) {
    console.error("uso: --base <url> --sha <sha> [--rutas a,b] [--salida json] [--ultima-buena json]");
    process.exit(2);
  }
  return args;
}

function compararRegresion(actualPorRuta, ultimaBuena) {
  const bloqueos = [];
  const avisos = [];
  for (const [ruta, ahora] of Object.entries(actualPorRuta)) {
    const antes = ultimaBuena[ruta];
    if (!antes || typeof antes !== "object") continue;
    if (typeof antes.estado === "number" && antes.estado < 400 && ahora.estado >= 400) {
      bloqueos.push(`${ruta}: daba ${antes.estado} y ahora da ${ahora.estado}`);
    }
    for (const clave of ["ttfb_ms", "lcp_ms"]) {
      if (antes[clave] > 0 && ahora[clave] != null && ahora[clave] > antes[clave] * 1.5) {
        avisos.push(`${ruta}: ${clave} empeoró ${(ahora[clave] / antes[clave]).toFixed(1)}x`);
      }
    }
  }
  return { bloqueos, avisos };
}

async function main() {
  const args = argumentos(process.argv);
  const permitidos = leerPermitidos();
  const rutas = args.rutas.split(",").map((r) => r.trim()).filter(Boolean);
  const capturas = args.sinCapturas ? null : args.sha;

  const fallos = [];
  const avisos = [];
  const version = await versionServida(args.base);
  const shaVersion = version && (version.sha || version.commitSha || null);
  if (!shaVersion || !String(shaVersion).startsWith(args.sha.slice(0, 7))) {
    fallos.push(`version.json sirve ${shaVersion || "nada"} y no ${args.sha.slice(0, 7)}`);
  }

  const resultados = {};
  await ejecutarLote(rutas, args.base, args.sha, capturas, resultados, fallos, avisos);

  for (const [clave, r] of Object.entries(resultados)) {
    const nuevos = (r.errores || []).filter((e) => !errorPermitido(e, permitidos));
    r.errores_nuevos = nuevos;
    for (const e of nuevos) fallos.push(`${clave}: consola: ${e.slice(0, 200)}`);
    delete r.errores;
  }

  if (args.ultimaBuena) {
    let ultima = {};
    try { ultima = JSON.parse(readFileSync(args.ultimaBuena, "utf8")); } catch { /* sin datos */ }
    const peorPorRuta = {};
    for (const [clave, r] of Object.entries(resultados)) {
      const ruta = clave.split(" @ ")[0];
      const p = peorPorRuta[ruta] || { estado: 0, ttfb_ms: 0, lcp_ms: 0 };
      p.estado = Math.max(p.estado, r.estado || 0);
      p.ttfb_ms = Math.max(p.ttfb_ms, r.ttfb_ms || 0);
      p.lcp_ms = Math.max(p.lcp_ms, r.lcp_ms || 0);
      peorPorRuta[ruta] = p;
    }
    const regresion = compararRegresion(peorPorRuta, ultima);
    fallos.push(...regresion.bloqueos);
    avisos.push(...regresion.avisos);
  }

  const informe = {
    sha: args.sha,
    base: args.base,
    generado: new Date().toISOString(),
    ok: fallos.length === 0,
    bloqueos: fallos,
    avisos,
    combinaciones: resultados,
  };
  const texto = JSON.stringify(informe, null, 2);
  if (args.salida) {
    mkdirSync(dirname(args.salida), { recursive: true });
    writeFileSync(args.salida, texto + "\n");
  }
  console.log(texto);
  process.exit(fallos.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("produccion_pruebas: " + String((error && error.stack) || error));
  process.exit(1);
});
