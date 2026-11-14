#!/usr/bin/env node
/**
 * scripts/readme/capturas.mjs — capturas reales del OS para la portada del README.
 *
 * Con Playwright (ya en devDependencies), saca de https://starseed-os.vercel.app
 * las pantallas públicas representativas en temas noche (oscuro) y nieve (claro),
 * a 1440×900 ×2, recortadas al viewport y en WebP de menos de 300 KB.
 * Guarda `capturas.json` junto a las imágenes con lo que muestra cada captura
 * (para los textos alternativos). Sin datos personales: solo páginas públicas;
 * si una pantalla necesita sesión y no hay cuenta de demostración, se omite.
 *
 * Uso: node scripts/readme/capturas.mjs [--base URL] [--salida assets/readme/capturas]
 *          [--paginas inicio,gobernanza] [--temas noche,nieve]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Límite de peso por captura, en bytes (300 KB). */
const LIMITE_BYTES = 300_000;
/** Viewport del escritorio y densidad de píxeles. */
const ANCHO = 1440, ALTO = 900, DENSIDAD = 2;
/** Versión del documento capturas.json. */
export const DOCUMENTO_VERSION = 1;

/** Los dos temas de marca: noche (oscuro) y nieve (claro), tokens del sistema de diseño. */
export const TEMAS = [
  { id: "noche", tema: "dark", esquema: "dark" },
  { id: "nieve", tema: "light", esquema: "light" },
];

/** Pantallas públicas candidatas. Las que necesitan sesión se omiten solas. */
export const PAGINAS = [
  { id: "inicio", ruta: "/", titulo: "Inicio", descripcion: "El escritorio del OS en vivo: widgets, la Red, la Biblioteca y Astraura en el dock." },
  { id: "gobernanza", ruta: "/network/politics", titulo: "Gobernanza", descripcion: "Ecosistema político de la red: democracia directa y propuestas." },
  { id: "biblioteca", ruta: "/library", titulo: "Biblioteca", descripcion: "La Biblioteca del OS: librería instalable, paquetes de la comunidad y descarga del sistema." },
  { id: "astraura", ruta: "/agent", titulo: "Astraura", descripcion: "El panel de Astraura, el sistema primario de inteligencia: personalidades, cerebros y ajustes." },
  { id: "instalar", ruta: "/instalar", titulo: "Instalar", descripcion: "Descargas por plataforma: macOS, Windows, Linux y Android." },
];

/** Nombre de archivo estable: `<página>-<tema>.webp`. */
export function nombreArchivo(paginaId, temaId) {
  return `${paginaId}-${temaId}.webp`;
}

/**
 * Plan de capturas: cruza las páginas elegidas (por defecto, todas) con los temas.
 * @param {{ paginas?: typeof PAGINAS, temas?: typeof TEMAS, ids?: string[], base?: string }} [opciones]
 */
export function planCapturas({ paginas = PAGINAS, temas = TEMAS, ids, base = "https://starseed-os.vercel.app" } = {}) {
  const elegidas = ids ? paginas.filter((p) => ids.includes(p.id)) : paginas;
  return elegidas.flatMap((pagina) =>
    temas.map((tema) => ({
      paginaId: pagina.id,
      ruta: pagina.ruta,
      titulo: pagina.titulo,
      descripcion: pagina.descripcion,
      temaId: tema.id,
      archivo: nombreArchivo(pagina.id, tema.id),
      url: `${base}${pagina.ruta === "/" ? "" : pagina.ruta}`,
    })),
  );
}

/** Semilla para next-themes: qué escribir en localStorage antes de cargar la página. */
export function semillaTema(tema) {
  return { clave: "theme", valor: tema.tema };
}

/** Marcas de arranque (ver src/lib/onboarding/primer-arranque.ts): sin sesión, nada se abre solo. */
export const MARCAS_ARRANQUE = [
  { clave: "starseed.primer-arranque.saltado.v1", valor: "1" },
  { clave: "starseed.guide.seen.v1", valor: "1" },
];

/** Pasos de compresión WebP: de la calidad alta hacia abajo, recortando escala al final. */
export function pasosWebp() {
  return [
    { calidad: 85, escala: 1 },
    { calidad: 75, escala: 1 },
    { calidad: 65, escala: 0.85 },
    { calidad: 55, escala: 0.8 },
    { calidad: 45, escala: 0.75 },
    { calidad: 35, escala: 0.7 },
  ];
}

/** Valida el peso de una captura contra el límite de 300 KB. */
export function validarCaptura(bytes) {
  if (bytes <= LIMITE_BYTES) return { ok: true };
  return { ok: false, motivo: `supera el límite de 300 KB (${Math.round(bytes / 1000)} KB)` };
}

/** Texto alternativo en español, con pantalla y tema, para el README. */
export function textoAlt({ titulo, temaId, descripcion }) {
  const detalle = descripcion.charAt(0).toLowerCase() + descripcion.slice(1);
  return `StarSeed OS · ${titulo} en tema ${temaId} — ${detalle}`;
}

/** Documento capturas.json: separa las capturas válidas de las omitidas, con su motivo. */
export function documentoCapturas({ base, plan, resultados, generado }) {
  const capturas = [];
  const omitidas = [];
  for (const resultado of resultados) {
    const delPlan = plan.find((p) => p.paginaId === resultado.paginaId && p.temaId === resultado.temaId);
    if (!delPlan) continue;
    if (resultado.estado === "ok") {
      capturas.push({
        paginaId: delPlan.paginaId,
        temaId: delPlan.temaId,
        archivo: resultado.archivo,
        ruta: delPlan.ruta,
        url: delPlan.url,
        titulo: delPlan.titulo,
        descripcion: delPlan.descripcion,
        alt: textoAlt({ titulo: delPlan.titulo, temaId: delPlan.temaId, descripcion: delPlan.descripcion }),
        bytes: resultado.bytes,
        ancho: resultado.ancho,
        alto: resultado.alto,
      });
    } else {
      omitidas.push({ paginaId: delPlan.paginaId, temaId: delPlan.temaId, motivo: resultado.motivo ?? "sin motivo" });
    }
  }
  return { version: DOCUMENTO_VERSION, generado, base, viewport: `${ANCHO}x${ALTO}@${DENSIDAD}`, limiteBytes: LIMITE_BYTES, capturas, omitidas };
}

/** Abre el navegador, recorre páginas y temas, y escribe WebP + JSON. */
export async function capturar({ base = "https://starseed-os.vercel.app", salida = "assets/readme/capturas", ids, temas = TEMAS } = {}) {
  const { chromium } = await import("playwright");
  const plan = planCapturas({ ids, temas, base });
  const resultados = [];
  const navegador = await chromium.launch();
  try {
    for (const entrada of plan) {
      const contexto = await navegador.newContext({
        viewport: { width: ANCHO, height: ALTO },
        deviceScaleFactor: DENSIDAD,
        colorScheme: entrada.temaId === "noche" ? "dark" : "light",
      });
      const temaElegido = temas.find((t) => t.id === entrada.temaId);
      const semillas = [semillaTema(temaElegido), ...MARCAS_ARRANQUE].map((s) => [s.clave, s.valor]);
      await contexto.addInitScript((pares) => {
        for (const [clave, valor] of pares) localStorage.setItem(clave, valor);
      }, semillas);
      const pagina = await contexto.newPage();
      const resultado = await capturarPagina(pagina, entrada);
      resultados.push(resultado);
      if (resultado.estado === "ok") {
        await mkdir(salida, { recursive: true });
        await writeFile(path.join(salida, resultado.archivo), resultado.contenido);
      }
      await contexto.close();
      const kb = resultado.estado === "ok" ? `${Math.round(resultado.bytes / 1000)} KB` : resultado.motivo;
      console.log(`· ${entrada.archivo}: ${resultado.estado === "ok" ? kb : `omitida (${kb})`}`);
    }
  } finally {
    await navegador.close();
  }
  const documento = documentoCapturas({
    base,
    plan,
    resultados: resultados.map(({ contenido, ...resto }) => resto),
    generado: new Date().toISOString(),
  });
  await mkdir(salida, { recursive: true });
  await writeFile(path.join(salida, "..", "capturas.json"), `${JSON.stringify(documento, null, 2)}\n`);
  return documento;
}

/** Espera hasta que el texto visible se estabilice: si sigue cambiando (carga, hidratación), sigue esperando. */
async function estabilizarTexto(pagina, pausa = 1_500, tope = 30_000) {
  const inicio = Date.now();
  let anterior = await pagina.evaluate(() => document.body?.innerText ?? "");
  while (Date.now() - inicio < tope) {
    await pagina.waitForTimeout(pausa);
    const actual = await pagina.evaluate(() => document.body?.innerText ?? "");
    if (actual === anterior) return;
    anterior = actual;
  }
}

/** Aparta los diálogos que cubren la pantalla (rito de neurona, aviso de bienvenida, novedades). */
async function apartarDialogos(pagina) {
  const nombres = ["Cerrar el aviso", "Configurar luego", "Más tarde"];
  for (const nombre of nombres) {
    const boton = pagina.getByRole("button", { name: nombre }).first();
    if (await boton.isVisible().catch(() => false)) {
      await boton.click().catch(() => {});
      await pagina.waitForTimeout(800);
    }
  }
}

/** Captura una página del plan: navega, recorta al viewport y comprime en WebP. */
async function capturarPagina(pagina, entrada) {
  try {
    const respuesta = await pagina.goto(entrada.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!respuesta || !respuesta.ok()) return { ...entrada, estado: "omitida", motivo: `la página respondió ${respuesta ? respuesta.status() : "sin respuesta"}` };
    if (/\/(login|onboarding)/.test(pagina.url())) return { ...entrada, estado: "omitida", motivo: "requiere sesión" };
    // Asentamiento: hidratación y pinta inicial (el Realtime mantiene la red viva, por eso no hay networkidle).
    await pagina.waitForLoadState("load", { timeout: 45_000 }).catch(() => {});
    await estabilizarTexto(pagina);
    await apartarDialogos(pagina);
    const png = await pagina.screenshot({ clip: { x: 0, y: 0, width: ANCHO, height: ALTO } });
    const sharp = (await import("sharp")).default;
    const pasos = pasosWebp();
    for (const paso of pasos) {
      const ancho = Math.round(ANCHO * DENSIDAD * paso.escala);
      const alto = Math.round(ALTO * DENSIDAD * paso.escala);
      const contenido = await sharp(png).resize(ancho, alto).webp({ quality: paso.calidad }).toBuffer();
      const comprobacion = validarCaptura(contenido.length);
      const esUltimo = paso === pasos[pasos.length - 1];
      if (comprobacion.ok || esUltimo) {
        return { ...entrada, estado: comprobacion.ok ? "ok" : "omitida", motivo: comprobacion.motivo, bytes: contenido.length, ancho, alto, contenido };
      }
    }
  } catch (error) {
    return { ...entrada, estado: "omitida", motivo: `error al capturar: ${error.message}` };
  }
}

/** CLI: opciones --base, --salida, --paginas y --temas (listas separadas por comas). */
function opciones(argv) {
  const valor = (bandera, porDefecto) => {
    const índice = argv.indexOf(bandera);
    return índice >= 0 && argv[índice + 1] ? argv[índice + 1] : porDefecto;
  };
  const lista = (bandera, porDefecto) => {
    const crudo = valor(bandera, "");
    return crudo ? crudo.split(",").map((t) => t.trim()) : porDefecto;
  };
  return {
    base: valor("--base", "https://starseed-os.vercel.app"),
    salida: valor("--salida", "assets/readme/capturas"),
    ids: lista("--paginas", null),
    temas: lista("--temas", ["noche", "nieve"]).map((id) => TEMAS.find((t) => t.id === id)).filter(Boolean),
  };
}

const esGui = process.argv[1] && process.argv[1].endsWith("capturas.mjs");
if (esGui) {
  const o = opciones(process.argv.slice(2));
  const documento = await capturar(o);
  console.log(`Listo: ${documento.capturas.length} capturas y ${documento.omitidas.length} omitidas → ${o.salida} (capturas.json en ${path.join(o.salida, "..")})`);
}
