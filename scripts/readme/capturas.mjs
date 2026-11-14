#!/usr/bin/env node
// Capturas reales del OS para la portada del README (RDM1113, §3.4 de
// architecture/readme-portada-1113.md): Playwright sobre las páginas públicas de
// https://starseed-os.vercel.app, en temas noche y nieve, a 1440×900 con escala ×2,
// recortadas al viewport y guardadas en WebP de menos de 300 KB, junto a capturas.json
// con lo que muestra cada una (los textos alternativos de la portada).
//
// Reparación de la objeción «escalada agotada tras 8 intentos (libre×8): requiere una
// persona»: aquí no hay intervención humana ni insistir a ciegas — solo pantallas
// públicas (las que piden sesión se omiten solas), y la compresión reintenta con una
// secuencia FINITA de calidades; si nada cabe por debajo del límite, la entrada se
// registra como omitida con su motivo y el guion sigue y termina por sí solo.
//
// Ejecución: node scripts/readme/capturas.mjs (los navegadores de Playwright ya están
// instalados en la Mac; la lógica pura del plan y del manifest la prueba
// src/lib/__tests__/capturas.test.ts).

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const BASE_URL_POR_DEFECTO = "https://starseed-os.vercel.app";
export const ANCHO = 1440;
export const ALTO = 900;
export const ESCALA = 2;
export const PESO_MAXIMO_BYTES = 300 * 1024;
export const CALIDADES_WEBP = [85, 70, 55];

// Pantallas públicas candidatas: sin datos personales, sin sesión. Si una acaba
// redirigiendo a /login en tiempo de ejecución, el guion la omite y sigue.
export const PANTALLAS = [
  {
    id: "inicio",
    ruta: "/",
    titulo: "Inicio",
    descripcion: "Portada pública de StarSeed OS con su símbolo y los accesos principales.",
  },
  {
    id: "gobernanza",
    ruta: "/network/politics",
    titulo: "Gobernanza",
    descripcion: "Gobernanza de la red: democracia directa, propuestas y voto delegado.",
  },
  {
    id: "astraura",
    ruta: "/agent",
    titulo: "Astraura",
    descripcion: "Estudio de Astraura, la inteligencia soberana 1.58-bit del sistema.",
  },
  {
    id: "biblioteca",
    ruta: "/library",
    titulo: "Biblioteca",
    descripcion: "Biblioteca universal del OS, con sus recursos e instalables.",
  },
];

export const TEMAS = [
  { id: "noche", colorScheme: "dark" },
  { id: "nieve", colorScheme: "light" },
];

export function esPublica(pantalla) {
  return !pantalla.requiereSesion;
}

export function nombreArchivo(idPantalla, idTema) {
  const normalizado = (texto) =>
    texto.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalizado(idPantalla)}-${normalizado(idTema)}.webp`;
}

export function planDeCapturas() {
  return PANTALLAS.filter(esPublica).flatMap((pantalla) =>
    TEMAS.map((tema) => ({
      id: `${pantalla.id}-${tema.id}`,
      pantalla: pantalla.id,
      ruta: pantalla.ruta,
      tema: tema.id,
      archivo: nombreArchivo(pantalla.id, tema.id),
      ancho: ANCHO,
      alto: ALTO,
      escala: ESCALA,
      descripcion: pantalla.descripcion,
    })),
  );
}

export function siguienteCalidad(indice) {
  return CALIDADES_WEBP[indice] ?? null;
}

export async function capturarConReintentos(conversion, pesoMaximo) {
  for (let i = 0; i < CALIDADES_WEBP.length; i += 1) {
    const calidad = siguienteCalidad(i);
    const bytes = await conversion(calidad);
    if (bytes <= pesoMaximo) return { ok: true, calidad, intentos: i + 1 };
  }
  return { ok: false, motivo: `peso: nada baja de ${pesoMaximo} bytes en ${CALIDADES_WEBP.length} intentos` };
}

// El id de cada captura es `<pantalla>-<tema>`; la pantalla se deduce por prefijo,
// así el manifest funciona con entradas del plan o con resultados sueltos.
function pantallaDe(id) {
  return PANTALLAS.find((p) => id === p.id || id.startsWith(`${p.id}-`));
}

export function capturasJson(resultados) {
  const pantallas = [];
  const omitidas = [];
  for (const r of resultados) {
    const pantalla = pantallaDe(r.id);
    if (r.ok) {
      pantallas.push({
        id: r.id,
        pantalla: pantalla?.id ?? r.id,
        archivo: r.archivo,
        peso_bytes: r.bytes,
        texto_alternativo: pantalla?.descripcion ?? "",
      });
    } else {
      omitidas.push({ id: r.id, archivo: r.archivo, motivo: r.motivo });
    }
  }
  return { base: BASE_URL_POR_DEFECTO, pantallas, omitidas };
}

// Navega a la página pública, comprueba que no haya acabado en un muro de sesión y
// captura el viewport en WebP reintentando con la secuencia finita de calidades.
// Devuelve el registro del resultado (con el buffer aparte, que solo sirve en memoria).
export async function capturarUna(page, entrada, pesoMaximo) {
  try {
    const respuesta = await page.goto(`${BASE_URL_POR_DEFECTO}${entrada.ruta}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    if (page.url().includes("/login")) {
      return { id: entrada.id, ok: false, archivo: entrada.archivo, motivo: "necesita sesión: redirige a /login" };
    }
    if (respuesta && respuesta.status() >= 400) {
      return { id: entrada.id, ok: false, archivo: entrada.archivo, motivo: `la página respondió ${respuesta.status()}` };
    }
    await page.waitForTimeout(2_000);
    let ultimoBuffer;
    const conversion = async (calidad) => {
      ultimoBuffer = await page.screenshot({ type: "webp", quality: calidad });
      return ultimoBuffer.length;
    };
    const intento = await capturarConReintentos(conversion, pesoMaximo);
    if (!intento.ok) {
      return { id: entrada.id, ok: false, archivo: entrada.archivo, motivo: intento.motivo };
    }
    return {
      id: entrada.id,
      ok: true,
      archivo: entrada.archivo,
      bytes: ultimoBuffer.length,
      buffer: ultimoBuffer,
    };
  } catch (error) {
    return { id: entrada.id, ok: false, archivo: entrada.archivo, motivo: `error: ${error.message}` };
  }
}

// Recorre el plan completo: cada pantalla en cada tema, un contexto propio con el
// color scheme y el viewport del plan; escribe los WebP y capturas.json. Nunca se
// detiene por una pantalla fallida: la omite, la declara y sigue.
export async function main(argv = process.argv) {
  const destino = path.join(RAIZ, "assets", "readme", "capturas");
  mkdirSync(destino, { recursive: true });
  const { chromium } = await import("playwright");
  const navegador = await chromium.launch();
  const plan = planDeCapturas();
  const resultados = [];
  try {
    for (const entrada of plan) {
      const esquema = TEMAS.find((t) => t.id === entrada.tema)?.colorScheme ?? "dark";
      const contexto = await navegador.newContext({
        viewport: { width: entrada.ancho, height: entrada.alto },
        deviceScaleFactor: entrada.escala,
        colorScheme: esquema,
        reducedMotion: "reduce",
      });
      const page = await contexto.newPage();
      const { buffer, ...registro } = await capturarUna(page, entrada, PESO_MAXIMO_BYTES);
      if (registro.ok) writeFileSync(path.join(destino, entrada.archivo), buffer);
      resultados.push(registro);
      console.log(
        `${registro.ok ? "capturada" : "omitida"} ${entrada.id}: ${registro.ok ? `${registro.bytes} bytes` : registro.motivo}`,
      );
      await contexto.close();
    }
  } finally {
    await navegador.close();
  }
  const manifest = capturasJson(resultados);
  writeFileSync(path.join(destino, "capturas.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `capturas.json: ${manifest.pantallas.length} de ${plan.length} guardadas en assets/readme/capturas (omitidas: ${manifest.omitidas.length}).`,
  );
  return manifest;
}

const ES_ENTRADA = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ES_ENTRADA) await main();
