"use client";
/**
 * Bots de Astraura · TONO EN EL CHAT (BOT1011S). Contrato: architecture/astraura-bots.md §4.
 *
 * La personalidad del bot (mezcla con la del agente que encarna, la situación y lo que la
 * persona fijó a mano) se traduce a UN bloque de texto «TONO DEL BOT:» para el mensaje de
 * sistema del chat. Termina SIEMPRE en los límites honestos (última línea de
 * `instruccionesDeTono`): reconocerse IA, sin prisa, sin adulación, sin culpa.
 * Sin `node:*`, sin red; solo lectura defensiva de `localStorage` con guarda y try/catch.
 */
import type { Bot } from "../tipos";
import {
  instruccionesDeTono,
  mezclarPersonalidad,
  type PreferenciasPersona,
  type SenalesContexto,
  type Situacion,
} from "../personalidad-adaptable";
import { rasgosDesdePersonalidad, type EntradaAurora } from "../personalidad-desde-aurora";

/** Clave de las preferencias de tono de la persona (rasgos fijados, sinHumor, brevedad). */
export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

const esRegistro = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const esCadenaNoClave = (x: unknown): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= 2000;

/** Rasgo fijado ACEPTABLE: número finito en [0, 1]. Nada más pasa. */
const esRasgo = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
const RASGOS_TONO = ["calidez", "energia", "formalidad", "curiosidad", "humor", "concision"] as const;

/** Sanea las preferencias guardadas (JSON ya parseado): descarta todo lo que no entienda. */
export function leerPreferencias(bruto: unknown): PreferenciasPersona {
  if (!esRegistro(bruto)) return {};
  const out: PreferenciasPersona = {};
  const rasgos = esRegistro(bruto.rasgos) ? bruto.rasgos : null;
  if (rasgos) {
    const fijados: NonNullable<PreferenciasPersona["rasgos"]> = {};
    for (const r of RASGOS_TONO) {
      const v = rasgos[r];
      if (v !== undefined && v !== null && v !== "" && esRasgo(v)) fijados[r] = v;
    }
    if (Object.keys(fijados).length) out.rasgos = fijados;
  }
  if (bruto.sinHumor === true) out.sinHumor = true;
  if (bruto.brevedad === true) out.brevedad = true;
  return out;
}

/** Lee `starseed.astraura.bots.preferencias.v1` de ESTA neurona; nunca lanza. */
export function preferenciasPersona(): PreferenciasPersona {
  try {
    if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") return {};
    const bruto = window.localStorage.getItem(CLAVE_PREFERENCIAS);
    if (!esCadenaNoClave(bruto)) return {};
    return leerPreferencias(JSON.parse(bruto));
  } catch {
    return {};
  }
}

/* ── adelante ───────────────────────────────────────────────────────────── */

const NES = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palabras clave simples, sin acentos; el duelo y la crisis van delante (cuidado, no juego). */
const PALABRAS_SITUACION: readonly (readonly [Situacion, readonly string[]])[] = [
  ["duelo", ["duelo", "murio", "murió", "fallec", "muerte", "funeral", "luto", "perdida", "pérdida"]],
  ["crisis", ["crisis", "urgente", "emergencia", "desastre", "grave problema", "no puedo pagar"]],
  ["trabajo", ["trabajo", "curro", "jefe", "empleo", "reunion", "reunión", "oficina", "proyecto laboral"]],
  ["aprendizaje", ["aprender", "aprendizaje", "estudiar", "estudio", "examen", "curso", "leccion", "lección"]],
  ["juego", ["juego", "jugar", "partida", "divertir", "ocio", "pasatiempo"]],
];

/** Situación detectada en el texto con palabras clave simples; `null` si es neutra. */
export function situacionDesdeTexto(texto: string): Situacion | null {
  const n = NES((texto || "").toLowerCase()).trim();
  if (!n) return null;
  for (const [s, claves] of PALABRAS_SITUACION) {
    for (const c of claves) if (n.includes(NES(c))) return s;
  }
  return null;
}

/**
 * Bloque «TONO DEL BOT:» para el mensaje de sistema del chat (≤ 6 líneas).
 * `agente` es la personalidad de Aurora (params/emotions) que el bot encarna; la persona (su
 * rasgo fijado, sinHumor, brevedad) GANA siempre. Los límites honestos van SIEMPRE: son la
 * última línea de `instruccionesDeTono`.
 */
export function bloqueTono(
  bot: Pick<Bot, "personalidad">,
  agente?: EntradaAurora,
  senales: SenalesContexto = { sesion: "privada" },
  prefs: PreferenciasPersona = preferenciasPersona(),
): string {
  const rasgosAgente = agente ? rasgosDesdePersonalidad(agente, bot.personalidad) : undefined;
  const p = mezclarPersonalidad(bot.personalidad, senales, rasgosAgente, prefs);
  return ["TONO DEL BOT:", ...instruccionesDeTono(p)].join("\n");
}
