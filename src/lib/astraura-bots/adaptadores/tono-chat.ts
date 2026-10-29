/**
 * Bots/dots de Astraura · TONO EN EL CHAT (BOT1011S · 2026-10-29). Contrato: architecture/astraura-bots.md §4.
 *
 * Bloque «TONO DEL BOT:» para el mensaje de sistema del chat: personalidad del bot → personalidad
 * del agente que encarna (rasgosDesdePersonalidad, BOT1011D1) → preferencias de la persona
 * (`starseed.astraura.bots.preferencias.v1`: lo fijado a mano gana) → situación del turno.
 * Los límites honestos SIEMPRE van (última línea de `instruccionesDeTono`) y el bloque mide ≤ 6 líneas.
 * Defensivo y SSR-safe: cualquier preferencia rota devuelve {} y el tono nunca lanza.
 */
import { RASGOS, type Bot } from "../tipos";
import {
  instruccionesDeTono, mezclarPersonalidad,
  type PreferenciasPersona, type SenalesContexto, type Situacion,
} from "../personalidad-adaptable";
import { rasgosDesdePersonalidad, type EntradaAurora } from "../personalidad-desde-aurora";

/** Clave de preferencias sincronizadas (BOT1011B). */
export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const esRegistro = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Sanea preferencias desconocidas: solo lo que reconoce, sin lanzar. */
export function sanearPreferencias(bruto: unknown): PreferenciasPersona {
  if (!esRegistro(bruto)) return {};
  const out: PreferenciasPersona = {};
  const rasgos = esRegistro(bruto.rasgos) ? bruto.rasgos : null;
  if (rasgos) {
    out.rasgos = {};
    for (const r of RASGOS) {
      const v = rasgos[r];
      if (esNumero(v) && v >= 0 && v <= 1) out.rasgos[r] = v;
    }
  }
  if (bruto.sinHumor === true) out.sinHumor = true;
  if (bruto.brevedad === true) out.brevedad = true;
  return out;
}

/** Lee `starseed.astraura.bots.preferencias.v1` (localStorage). Sin ventana → {}. */
export function preferenciasPersona(): PreferenciasPersona {
  if (typeof window === "undefined") return {};
  try {
    const crudo = window.localStorage.getItem(CLAVE_PREFERENCIAS);
    if (!crudo) return {};
    return sanearPreferencias(JSON.parse(crudo));
  } catch {
    return {};
  }
}

/** Palabras simples de un turno que delatan la situación (sin modelo; tolerante a acentos). */
const PALABRAS: [Situacion, string[]][] = [
  ["duelo", ["fallecio", "murio", "duelo", "pesame", "condolencia", "entierro"]],
  ["crisis", ["emergencia", "urgente", "accidente", "auxilio", "incendio"]],
  ["trabajo", ["trabajo", "oficina", "reunion", "cliente"]],
  ["aprendizaje", ["aprender", "estudiar", "curso", "clase"]],
  ["juego", ["jugar", "partida", "videojuego"]],
];

export function situacionDeTexto(texto: string): Situacion | undefined {
  const n = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [situacion, palabras] of PALABRAS) {
    if (palabras.some((p) => n.includes(p))) return situacion;
  }
  return undefined;
}

/**
 * Bloque «TONO DEL BOT:» para el system prompt (≤ 6 líneas, termina en los límites honestos).
 * Si se encarna un agente entra CON su personalidad (BOT1011D1); las preferencias de la
 * persona ganan sobre lo demás; la situación ajusta sin traicionar al bot.
 */
export function bloqueTono(
  bot: Bot, agente?: EntradaAurora, senales?: SenalesContexto, prefs?: PreferenciasPersona,
): string {
  const agenteEfectivo = agente
    ? rasgosDesdePersonalidad(agente, bot.personalidad)
    : undefined;
  const mezcla = mezclarPersonalidad(
    bot.personalidad, senales ?? { sesion: "privada" }, agenteEfectivo, prefs ?? preferenciasPersona(),
  );
  return ["TONO DEL BOT:", ...instruccionesDeTono(mezcla)].join("\n");
}
