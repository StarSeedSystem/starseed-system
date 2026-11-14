#!/usr/bin/env node
/**
 * scripts/readme/capturas.mjs — capturas reales del OS para la portada (RDM1113, §3.4).
 *
 * De https://starseed-os.vercel.app toma 4 pantallas públicas (inicio, gobernanza,
 * Astraura y Biblioteca) en tema noche y nieve, a 1440×900 y ×2, y las guarda como
 * WebP de menos de 300 KB junto a `capturas.json` (título, descripción y texto
 * alternativo de cada una).
 *
 * Reparación (RDM1113D): el intento anterior decodificaba los bytes del WebP como
 * UTF-8 y moría con «byte 0xd4 in position 4». Aquí el binario se mira byte a byte
 * (`leerWebp`), se escribe sin codificación y sólo el JSON se escribe en UTF-8.
 *
 * Uso: node scripts/readme/capturas.mjs [--base URL] [--tema noche,nieve]
 *      [--pantalla inicio,gobernanza,astraura,biblioteca] [--salida DIR] [--json RUTA]
 *      [--ancho 1440] [--alto 900] [--escala 2] [--max-kb 300] [--ejecutable RUTA]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");

export const BASE_POR_DEFECTO = "https://starseed-os.vercel.app";
export const MAX_KB_POR_DEFECTO = 300;
export const ANCHO_POR_DEFECTO = 1440;
export const ALTO_POR_DEFECTO = 900;
export const ESCALA_POR_DEFECTO = 2;
export const TEMA_ESQUEMA = Object.freeze({ noche: "dark", nieve: "light" });
export const TIEMPOS = Object.freeze({
  navegacionMs: 45_000,
  esperaMs: 6_000,
  maximoMs: 90_000,
});

export const PANTALLAS = Object.freeze([
  {
    id: "inicio",
    ruta: "/dashboard",
    titulo: "Inicio · el cielo ahora",
    descripcion:
      "Pantalla de inicio del OS: el cielo de hoy, la fecha y hora, y accesos a las áreas de política, educación, cultura, economía, clima y productividad.",
    alt:
      "Pantalla de inicio de StarSeed OS con el cielo de hoy, la fecha y hora, y los accesos a las áreas del OS",
  },
  {
    id: "gobernanza",
    ruta: "/decisiones",
    titulo: "Decisiones · Ontocracia",
    descripcion:
      "Motor de comandos democráticos: una decisión sólo se ejecuta cuando se cumple el formato democrático (tiempo, participación mínima y umbral).",
    alt:
      "Pantalla de Decisiones · Ontocracia del OS, con el motor de comandos democráticos y sus reglas de tiempo, participación y umbral",
  },
  {
    id: "astraura",
    ruta: "/agent",
    titulo: "Astraura IA y Orquestación",
    descripcion:
      "Área Astraura: orquestación, imaginación, notificaciones y chat multiagéntico con voz.",
    alt:
      "Pantalla Astraura IA y Orquestación del OS, con orquestación, imaginación, notificaciones y chat multiagéntico",
  },
  {
    id: "biblioteca",
    ruta: "/library",
    titulo: "Biblioteca",
    descripcion:
      "Biblioteca del OS: fuentes de IA, temas, apps, widgets y repos de la comunidad, con lo gratuito y de código abierto primero.",
    alt:
      "Pantalla de la Biblioteca del OS, con fuentes de IA, temas, apps, widgets y repos de la comunidad",
  },
]);

const PANTALLAS_POR_ID = new Map(PANTALLAS.map((p) => [p.id, p]));

/**
 * @typedef {{ pantalla: string, tema: string, motivo: string }} Omision
 * @typedef {{ pantalla: string, tema: string, bytes: number, ancho: number, alto: number, capturadaEn?: string }} Captura
 * @typedef {{ ancho: number, alto: number, escala: number, maxKb: number }} Medidas
 * @typedef {{ pantalla: string, tema: string, ruta: string, archivo: string, ancho: number, alto: number, bytes: number, kb: number, titulo: string, descripcion: string, texto_alternativo: string, capturada_en: string | null }} EntradaManifiesto
 */

/** Texto sin acentos, en minúsculas y con guiones: seguro para un nombre de archivo. */
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nombreDeArchivo(pantalla, tema) {
  return `${normalizar(pantalla) || "captura"}-${normalizar(tema) || "tema"}.webp`;
}

/**
 * Lee la cabecera de un WebP MIRANDO BYTES, nunca con TextDecoder.
 * La versión anterior decodificaba el binario como UTF-8 y lanzaba
 * «byte 0xd4 in position 4» en cuanto el tamaño RIFF acababa en 0xd4.
 */
export function leerWebp(bytes) {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const texto = (desde, largo) =>
    String.fromCharCode(...datos.subarray(desde, desde + largo));
  const valido =
    datos.length >= 12 && texto(0, 4) === "RIFF" && texto(8, 4) === "WEBP";
  return { valido, bytes: datos.length };
}

export function validarTamano(bytes, maxKb) {
  const total = Number(bytes);
  const kb = Math.round((total / 1024) * 10) / 10;
  return { ok: Number.isFinite(total) && total <= Number(maxKb) * 1024, kb };
}
const RUTAS_CON_SESION = ["/login", "/bienvenida", "/onboarding", "/auth"];

/** Devuelve el motivo para omitir una pantalla, o null si se puede capturar. */
export function motivoOmision({ url = "", status = 200, texto = "" } = {}) {
  if (!url) return "sin URL final";
  if (Number(status) >= 400) return `HTTP ${status}`;

  const ruta = (() => {
    try {
      return new URL(url, BASE_POR_DEFECTO).pathname;
    } catch {
      return String(url);
    }
  })();
  if (RUTAS_CON_SESION.some((r) => ruta === r || ruta.startsWith(`${r}/`))) {
    return "requiere sesión";
  }

  const limpio = String(texto).replace(/\s+/g, " ").trim();
  if (limpio.length < 40) return "sin contenido visible";
  if (/application error|unhandled runtime error|página no encontrada/i.test(limpio)) {
    return "error en pantalla";
  }
  return null;
}

/** @param {Captura} captura */
export function construirEntrada(captura) {
  const pantalla = PANTALLAS_POR_ID.get(captura.pantalla);
  if (!pantalla) throw new Error(`Pantalla desconocida: ${captura.pantalla}`);
  const tema = captura.tema;
  const { kb } = validarTamano(captura.bytes, MAX_KB_POR_DEFECTO);
  return {
    pantalla: pantalla.id,
    tema,
    ruta: pantalla.ruta,
    archivo: nombreDeArchivo(pantalla.id, tema),
    ancho: captura.ancho,
    alto: captura.alto,
    bytes: captura.bytes,
    kb,
    titulo: pantalla.titulo,
    descripcion: pantalla.descripcion,
    texto_alternativo: `${pantalla.alt} (tema ${tema}).`,
    capturada_en: captura.capturadaEn ?? null,
  };
}

/**
 * @param {{ base: string, opciones: Medidas, capturas: EntradaManifiesto[], omitidas?: Omision[], generado?: string }} datos
 */
export function construirManifiesto({ base, opciones, capturas, omitidas = [], generado }) {
  const ordenPantalla = new Map(PANTALLAS.map((p, i) => [p.id, i]));
  const ordenTema = new Map(Object.keys(TEMA_ESQUEMA).map((t, i) => [t, i]));
  const ordenadas = [...capturas].sort((a, b) => {
    const p = (ordenPantalla.get(a.pantalla) ?? 99) - (ordenPantalla.get(b.pantalla) ?? 99);
    return p !== 0 ? p : (ordenTema.get(a.tema) ?? 99) - (ordenTema.get(b.tema) ?? 99);
  });
  return {
    generado: generado ?? new Date().toISOString(),
    base,
    ancho: opciones.ancho,
    alto: opciones.alto,
    escala: opciones.escala,
    max_kb: opciones.maxKb,
    total: ordenadas.length,
    capturas: ordenadas,
    omitidas,
  };
}
const BANDERAS = Object.freeze({
  "--base": "base",
  "--tema": "tema",
  "--temas": "tema",
  "--pantalla": "pantalla",
  "--pantallas": "pantalla",
  "--ancho": "ancho",
  "--alto": "alto",
  "--escala": "escala",
  "--max-kb": "maxKb",
  "--salida": "salida",
  "--json": "json",
  "--ejecutable": "ejecutable",
});
const AYUDAS = new Set(["--ayuda", "--help", "-h"]);

function enteroPositivo(valor, bandera) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`El valor de ${bandera} debe ser un entero positivo (recibí «${valor}»)`);
  }
  return numero;
}

function listaDe(valor) {
  return String(valor)
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);
}

export function leerOpciones(argv = []) {
  const leidos = { tema: [], pantalla: [] };
  let ayuda = false;

  for (let i = 0; i < argv.length; i += 1) {
    const crudo = String(argv[i]);
    if (AYUDAS.has(crudo)) {
      ayuda = true;
      continue;
    }
    const [bandera, ...resto] = crudo.split("=");
    const destino = BANDERAS[bandera];
    if (!destino) throw new Error(`Bandera desconocida: ${bandera}`);
    let valor;
    if (resto.length) {
      valor = resto.join("=");
    } else {
      i += 1;
      valor = argv[i];
      if (valor === undefined) throw new Error(`Falta el valor de ${bandera}`);
    }
    if (destino === "tema" || destino === "pantalla") leidos[destino].push(...listaDe(valor));
    else leidos[destino] = valor;
  }

  const temas = leidos.tema.length ? [...new Set(leidos.tema)] : Object.keys(TEMA_ESQUEMA);
  for (const tema of temas) {
    if (!(tema in TEMA_ESQUEMA)) {
      throw new Error(`Tema desconocido: «${tema}». Válidos: ${Object.keys(TEMA_ESQUEMA).join(", ")}`);
    }
  }

  const ids = leidos.pantalla.length
    ? [...new Set(leidos.pantalla)]
    : PANTALLAS.map((p) => p.id);
  const pantallas = ids.map((id) => {
    const pantalla = PANTALLAS_POR_ID.get(id);
    if (!pantalla) {
      throw new Error(
        `Pantalla desconocida: «${id}». Válidas: ${PANTALLAS.map((p) => p.id).join(", ")}`,
      );
    }
    return pantalla;
  });

  return {
    ayuda,
    base: leidos.base ? String(leidos.base).replace(/\/+$/, "") : BASE_POR_DEFECTO,
    ancho: leidos.ancho ? enteroPositivo(leidos.ancho, "--ancho") : ANCHO_POR_DEFECTO,
    alto: leidos.alto ? enteroPositivo(leidos.alto, "--alto") : ALTO_POR_DEFECTO,
    escala: leidos.escala ? enteroPositivo(leidos.escala, "--escala") : ESCALA_POR_DEFECTO,
    maxKb: leidos["maxKb"] ? enteroPositivo(leidos["maxKb"], "--max-kb") : MAX_KB_POR_DEFECTO,
    temas,
    pantallas,
    ejecutable: leidos.ejecutable ? resolve(RAIZ, leidos.ejecutable) : "",
    salidaImagenes: leidos.salida
      ? resolve(RAIZ, leidos.salida)
      : join(RAIZ, "assets", "readme", "capturas"),
    salidaJson: leidos.json
      ? resolve(RAIZ, leidos.json)
      : join(RAIZ, "assets", "readme", "capturas.json"),
  };
}

const CSS_CONGELAR = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scrollbar-width: none !important; }
  html::-webkit-scrollbar { display: none !important; }
  [data-privado], [data-private], .dato-privado { filter: blur(12px) !important; }
`;

async function cargarSharp() {
  try {
    const modulo = await import("sharp");
    return modulo.default ?? modulo;
  } catch {
    throw new Error(
      "Falta «sharp» para convertir a WebP. Instálalo con: npm install --include=dev sharp",
    );
  }
}

function rutasDeNavegador(indicada) {
  return [
    indicada,
    process.env.PLAYWRIGHT_CHROMIUM,
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
}

async function lanzarNavegador(chromium, indicada) {
  const opciones = { args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  const intentos = [
    indicada,
    "",
    chromium.executablePath?.(),
    ...rutasDeNavegador(indicada),
  ].filter((ruta, i, todas) => ruta !== undefined && todas.indexOf(ruta) === i);
  let ultimoError = null;
  for (const ruta of intentos) {
    if (ruta && !existsSync(ruta)) continue;
    try {
      return await chromium.launch({ ...opciones, executablePath: ruta || undefined });
    } catch (error) {
      ultimoError = error;
    }
  }
  throw new Error(`No se pudo lanzar Chromium: ${ultimoError?.message ?? "sin ejecutable"}`);
}

async function nuevoContexto(navegador, opciones, tema) {
  const esquema = TEMA_ESQUEMA[tema];
  const contexto = await navegador.newContext({
    viewport: { width: opciones.ancho, height: opciones.alto },
    deviceScaleFactor: opciones.escala,
    colorScheme: esquema,
    reducedMotion: "reduce",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    serviceWorkers: "block",
  });
  await contexto.addInitScript((valor) => {
    try {
      localStorage.setItem("theme", valor);
      localStorage.setItem("starseed-tema", valor);
      // Bienvenidas y guías tapaban el contenido: se marcan como vistas para que
      // la captura enseñe la pantalla, no el modal de primer arranque.
      localStorage.setItem("starseed.primer-arranque.saltado.v1", "1");
      localStorage.setItem("starseed.neuron.setup.v1", "1");
      localStorage.setItem(
        "starseed.aurora.setup.v1",
        JSON.stringify({ done: true, version: 1, at: "2026-01-01T00:00:00.000Z" }),
      );
      // La ventana de sistemas de Astraura se pospone lejos: no es contenido de la portada.
      localStorage.setItem(
        "starseed.astraura.startup.v1",
        JSON.stringify({
          autoUpdate: true,
          strategy: "auto",
          firstRunDone: true,
          snoozeUntil: 4102444800000,
          seenAt: 1767225600000,
        }),
      );
      sessionStorage.setItem("starseed:welcome-seen", "1");
      sessionStorage.setItem("starseed.primer-arranque.aviso-web.v1", "1");
    } catch {
      /* almacenamiento bloqueado: colorScheme ya fija el esquema */
    }
    document.documentElement?.classList?.add(valor);
  }, esquema);
  return contexto;
}

async function asentar(pagina, tema) {
  await pagina.waitForLoadState("domcontentloaded").catch(() => {});
  await pagina.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await pagina
    .evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    })
    .catch(() => {});
  await pagina
    .waitForFunction(
      (esquema) => document.documentElement.classList.contains(esquema),
      TEMA_ESQUEMA[tema],
      { timeout: 5_000 },
    )
    .catch(() => {});
  await pagina.waitForTimeout(1_800);
}

async function aWebp(sharp, png, maxKb) {
  const maximo = Number(maxKb) * 1024;
  const meta = await sharp(png).metadata();
  const anchoBase = meta.width ?? 0;
  let factor = 1;
  let ultimoPeso = 0;
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    for (const calidad of [84, 76, 68, 60, 52, 44]) {
      let salida = sharp(png);
      if (factor !== 1) {
        salida = salida.resize({
          width: Math.max(1, Math.round(anchoBase * factor)),
          withoutEnlargement: true,
        });
      }
      const { data, info } = await salida
        .webp({ quality: calidad, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      ultimoPeso = data.length;
      if (data.length <= maximo) {
        return { buffer: data, ancho: info.width, alto: info.height, calidad };
      }
    }
    factor *= 0.85;
  }
  throw new Error(
    `No se pudo bajar de ${maxKb} KB: la mejor pasada pesó ${Math.round(ultimoPeso / 102.4) / 10} KB`,
  );
}

async function estadoDePagina(pagina) {
  return pagina.evaluate(() => ({
    url: location.href,
    titulo: document.title,
    tema: document.documentElement.className,
    texto: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim(),
  }));
}

export async function capturar(opciones) {
  const { chromium } = await import("playwright");
  const sharp = await cargarSharp();
  mkdirSync(opciones.salidaImagenes, { recursive: true });

  const navegador = await lanzarNavegador(chromium, opciones.ejecutable);
  const capturas = [];
  const omitidas = [];
  try {
    for (const tema of opciones.temas) {
      const contexto = await nuevoContexto(navegador, opciones, tema);
      try {
        for (const pantalla of opciones.pantallas) {
          const pagina = await contexto.newPage();
          try {
            const respuesta = await pagina.goto(`${opciones.base}${pantalla.ruta}`, {
              waitUntil: "domcontentloaded",
              timeout: TIEMPOS.navegacionMs,
            });
            await asentar(pagina, tema);
            const estado = await estadoDePagina(pagina);
            const motivo = motivoOmision({
              url: estado.url,
              status: respuesta?.status() ?? 200,
              texto: estado.texto,
            });
            if (motivo) {
              omitidas.push({ pantalla: pantalla.id, tema, motivo });
              console.warn(`· ${pantalla.id} · ${tema}: omitida (${motivo})`);
              continue;
            }

            await pagina.addStyleTag({ content: CSS_CONGELAR });
            const png = await pagina.screenshot({
              type: "png",
              animations: "disabled",
              caret: "hide",
              fullPage: false,
              timeout: TIEMPOS.navegacionMs,
            });
            const webp = await aWebp(sharp, png, opciones.maxKb);
            const verificacion = leerWebp(webp.buffer);
            if (!verificacion.valido) {
              throw new Error("la conversión no devolvió un WebP válido");
            }
            if (!validarTamano(webp.buffer.length, opciones.maxKb).ok) {
              throw new Error(`el WebP pesa más de ${opciones.maxKb} KB`);
            }

            const archivo = nombreDeArchivo(pantalla.id, tema);
            // Bytes tal cual: escribir binario con «utf8» es justo lo que rompía antes.
            writeFileSync(join(opciones.salidaImagenes, archivo), webp.buffer);
            const { kb } = validarTamano(webp.buffer.length, opciones.maxKb);
            capturas.push(
              construirEntrada({
                pantalla: pantalla.id,
                tema,
                bytes: webp.buffer.length,
                ancho: webp.ancho,
                alto: webp.alto,
                capturadaEn: new Date().toISOString(),
              }),
            );
            console.log(`✓ ${archivo} (${kb} KB · q${webp.calidad})`);
          } catch (error) {
            omitidas.push({
              pantalla: pantalla.id,
              tema,
              motivo: `error: ${error?.message ?? error}`,
            });
            console.warn(`✗ ${pantalla.id} · ${tema}: ${error?.message ?? error}`);
          } finally {
            await pagina.close().catch(() => {});
          }
        }
      } finally {
        await contexto.close().catch(() => {});
      }
    }
  } finally {
    await navegador.close().catch(() => {});
  }
  return { capturas, omitidas };
}

function imprimirAyuda() {
  console.log(`Capturas reales del OS para la portada del README (RDM1113 · §3.4).

Uso: node scripts/readme/capturas.mjs [opciones]

  --base URL         Sitio a capturar (por defecto ${BASE_POR_DEFECTO})
  --tema LISTA       noche,nieve (por defecto los dos)
  --pantalla LISTA   ${PANTALLAS.map((p) => p.id).join(", ")}
  --salida DIR       Carpeta de los WebP (por defecto assets/readme/capturas)
  --json RUTA        Manifiesto (por defecto assets/readme/capturas.json)
  --ancho N          Ancho CSS (por defecto ${ANCHO_POR_DEFECTO})
  --alto N           Alto CSS (por defecto ${ALTO_POR_DEFECTO})
  --escala N         Factor de píxeles (por defecto ${ESCALA_POR_DEFECTO})
  --max-kb N         Peso máximo por WebP (por defecto ${MAX_KB_POR_DEFECTO})
  --ejecutable RUTA  Chromium a usar (si no, el de Playwright o el del sistema)
  --ayuda            Esta ayuda`);
}

export async function main(argv = process.argv.slice(2)) {
  let opciones;
  try {
    opciones = leerOpciones(argv);
  } catch (error) {
    console.error(`capturas: ${error?.message ?? error}`);
    process.exitCode = 2;
    return;
  }
  if (opciones.ayuda) {
    imprimirAyuda();
    return;
  }

  const resultado = await capturar(opciones);
  const manifiesto = construirManifiesto({
    base: opciones.base,
    opciones,
    capturas: resultado.capturas,
    omitidas: resultado.omitidas,
  });
  mkdirSync(dirname(opciones.salidaJson), { recursive: true });
  writeFileSync(opciones.salidaJson, `${JSON.stringify(manifiesto, null, 2)}\n`, "utf8");

  console.log(
    `capturas: ${manifiesto.total} imágenes en ${opciones.salidaImagenes} · ${opciones.salidaJson}`,
  );
  if (resultado.omitidas.length) {
    console.warn(`capturas: ${resultado.omitidas.length} pantallas/temas omitidos`);
  }
  if (!manifiesto.total) process.exitCode = 1;
}

const ejecutadoDirecto =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (ejecutadoDirecto) {
  main().catch((error) => {
    console.error(`capturas: ${error?.message ?? error}`);
    process.exitCode = 1;
  });
}
