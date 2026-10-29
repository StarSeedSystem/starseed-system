"use client";
/**
 * Bots/dots de Astraura · TONO EN EL CHAT (BOT1011S). Contrato: architecture/astraura-bots.md §4.
 *
 * Une la personalidad del bot, la del agente que encarna y lo que la persona fijó
 * (`starseed.astraura.bots.preferencias.v1`) en un bloque corto para el prompt.
 * Los límites honestos de `instruccionesDeTono` van SIEMPRE, en la última línea.
 */
import type { Bot, Personalidad, TipoSesion } from "../tipos";
import { acotar, RASGOS } from "../tipos";
import {
  instruccionesDeTono,
  mezclarPersonalidad,
  type PreferenciasPersona,
  type SenalesContexto,
  type Situacion,
} from "../personalidad-adaptable";
import { rasgosDesdePersonalidad, type EntradaAurora } from "../personalidad-desde-aurora";

export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

/** Almacén mínimo de lectura: `localStorage` en el navegador, inyectable en pruebas. */
export interface AlmacenLectura {
  getItem(clave: string): string | null;
}

export interface SenalesTono {
  situacion?: Situacion;
  sesion?: TipoSesion;
  animo?: { valencia: number; activacion: number };
  /** Preferencias ya leídas; si faltan se leen del almacén de la persona. */
  preferencias?: PreferenciasPersona;
}

function esRegistro(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function sanearPreferencias(bruto: unknown): PreferenciasPersona {
  if (!esRegistro(bruto)) return {};
  const out: PreferenciasPersona = {};
  if (esRegistro(bruto.rasgos)) {
    const rasgos: Partial<Personalidad> = {};
    for (const k of RASGOS) {
      const v = bruto.rasgos[k];
      if (typeof v === "number" && Number.isFinite(v)) rasgos[k] = acotar(v);
    }
    if (Object.keys(rasgos).length > 0) out.rasgos = rasgos;
  }
  if (bruto.sinHumor === true) out.sinHumor = true;
  if (bruto.brevedad === true) out.brevedad = true;
  return out;
}

/** Lee y sanea las preferencias guardadas; cualquier basura cae a `{}` sin lanzar. */
export function preferenciasPersona(almacen?: AlmacenLectura | null): PreferenciasPersona {
  try {
    const fuente = almacen === undefined
      ? (typeof window !== "undefined" ? window.localStorage : null)
      : almacen;
    if (!fuente) return {};
    const crudo = fuente.getItem(CLAVE_PREFERENCIAS);
    if (!crudo) return {};
    return sanearPreferencias(JSON.parse(crudo));
  } catch {
    return {};
  }
}

const PALABRAS: ReadonlyArray<readonly [Situacion, readonly string[]]> = [
  ["crisis", ["crisis", "emergencia", "urgente", "socorro", "ansiedad", "panico", "ataque"]],
  ["duelo", ["duelo", "luto", "muerte", "murio", "fallecio", "perdi", "triste", "tristeza"]],
  ["juego", ["juego", "jugar", "partida", "videojuego", "diversion"]],
  ["aprendizaje", ["aprender", "aprendizaje", "estudiar", "estudio", "explicar", "ensenar", "curso"]],
  ["trabajo", ["trabajo", "trabajar", "proyecto", "reunion", "informe", "oficina", "codigo", "tarea"]],
];

const normalizar = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Situación del turno por palabras clave simples; la crisis y el duelo mandan. */
export function situacionDeTexto(texto: string): Situacion {
  if (typeof texto !== "string" || texto.length === 0) return "neutra";
  const palabras = normalizar(texto).split(/[^a-z0-9ñ]+/).filter(Boolean);
  for (const [situacion, claves] of PALABRAS) {
    if (palabras.some((p) => claves.some((c) => p.startsWith(c)))) return situacion;
  }
  return "neutra";
}

/** Bloque «TONO DEL BOT:» para el mensaje de sistema (≤ 6 líneas, límites al final). */
export function bloqueTono(
  bot: Pick<Bot, "personalidad">,
  agente?: EntradaAurora | null,
  senales: SenalesTono = {},
): string {
  const prefs = senales.preferencias ?? preferenciasPersona();
  const contexto: SenalesContexto = {
    situacion: senales.situacion ?? "neutra",
    sesion: senales.sesion ?? "privada",
    ...(senales.animo ? { animo: senales.animo } : {}),
  };
  const personalidadAgente = agente ? rasgosDesdePersonalidad(agente, bot.personalidad) : undefined;
  const efectiva = mezclarPersonalidad(bot.personalidad, contexto, personalidadAgente, prefs);
  const lineas = instruccionesDeTono(efectiva);
  // Cabecera + como mucho 5 líneas de instrucción: los límites honestos, al final.
  const cuerpo = lineas.slice(0, -1).slice(0, 4);
  const visibles = [...cuerpo, ...lineas.slice(-1)];
  return ["TONO DEL BOT:", ...visibles.map((l) => `- ${l}`)].join("\n");
}
