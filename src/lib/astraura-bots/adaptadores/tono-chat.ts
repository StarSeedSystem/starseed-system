"use client";
/**
 * Bots de Astraura · TONO EN EL CHAT (BOT1011S). Contrato: architecture/astraura-bots.md §4.
 *
 * La orbe ES el bot: cuando Aurora/Astraura conversa, el prompt de sistema lleva el TONO
 * del bot predeterminado — la personalidad del bot mezclada con la del agente que encarna
 * (rasgosDesdePersonalidad de BOT1011D1), con las señales del momento (situación detectada
 * por palabras clave) y con lo que la persona fijó a mano. Los límites honestos van SIEMPRE:
 * son la última línea de `instruccionesDeTono`.
 * Cliente: lee `localStorage`; cualquier fallo da cadena u objeto vacío, nunca lanza.
 */
import type { Bot, Personalidad, Rasgo } from "../tipos";
import { RASGOS, acotar } from "../tipos";
import {
  instruccionesDeTono,
  mezclarPersonalidad,
  type PreferenciasPersona,
  type SenalesContexto,
  type Situacion,
} from "../personalidad-adaptable";
import { rasgosDesdePersonalidad, type EntradaAurora } from "../personalidad-desde-aurora";

/** Clave de preferencias de la persona (rasgos fijados, sinHumor, brevedad). */
export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Lee las preferencias guardadas en el OS (`try/catch`: sin almacén o basura → {}). */
export function preferenciasPersona(): PreferenciasPersona {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE_PREFERENCIAS);
    if (!crudo) return {};
    return sanearPreferencias(JSON.parse(crudo) as unknown);
  } catch {
    return {};
  }
}

/** Sanea un valor desconocido a `PreferenciasPersona`; lo que no vale se descarta. */
export function sanearPreferencias(bruto: unknown): PreferenciasPersona {
  const pref: PreferenciasPersona = {};
  if (!esObjeto(bruto)) return pref;
  if (esObjeto(bruto.rasgos)) {
    const rasgos: Partial<Personalidad> = {};
    for (const r of RASGOS) {
      const v = (bruto.rasgos as Record<string, unknown>)[r as Rasgo];
      if (typeof v === "number" && Number.isFinite(v)) rasgos[r as Rasgo] = acotar(v);
    }
    if (Object.keys(rasgos).length) pref.rasgos = rasgos;
  }
  if (bruto.sinHumor === true) pref.sinHumor = true;
  if (bruto.brevedad === true) pref.brevedad = true;
  return pref;
}

/* ── Situación del momento, por palabras clave simples (cuidado antes que juego) ── */

const PALABRAS: ReadonlyArray<readonly [RegExp, Situacion]> = [
  [/crisis|emergencia|p[aá]nico|urgente|desastre|se cay[oó]/i, "crisis"],
  [/duelo|falleci[oó]|muri[oó]|est[aá] de luto|se nos fue/i, "duelo"],
  [/juego|juega|jugamos|divert[ií]/i, "juego"],
  [/aprend|[eé]studia|expl[ií]came|ens[aá]jame|d[aú]d[aá]|tutor/i, "aprendizaje"],
  [/trabaj|reuni[oó]n|oficina|plazo|fecha l[ií]mite/i, "trabajo"],
];

/** La primera que gana; nada encaja → «neutra». Pura: sin estado. */
export function situacionDesdeTexto(texto: string): Situacion {
  const t = typeof texto === "string" ? texto : "";
  for (const [re, s] of PALABRAS) if (re.test(t)) return s;
  return "neutra";
}

/** Bloque «TONO DEL BOT:» para el prompt de sistema (≤ 6 líneas, límites honestos al final). */
export function bloqueTono(
  bot: Bot,
  agente?: EntradaAurora,
  senales: Partial<SenalesContexto> = {},
): string {
  const agenteP = agente ? rasgosDesdePersonalidad(agente, bot.personalidad) : undefined;
  const efectiva = mezclarPersonalidad(
    bot.personalidad,
    { sesion: senales.sesion ?? "privada", situacion: senales.situacion, animo: senales.animo },
    agenteP,
    preferenciasPersona(),
  );
  return `TONO DEL BOT:\n${instruccionesDeTono(efectiva).join("\n")}`;
}
