/**
 * Bots de Astraura · TONO EN EL CHAT (BOT1011S). Contrato: architecture/astraura-bots.md §4.
 *
 * Une la personalidad del bot con la del AGENTE que encarna (`rasgosDesdePersonalidad`
 * de BOT1011D1), las señales de contexto y las PREFERENCIAS DE LA PERSONA
 * (`starseed.astraura.bots.preferencias.v1`), y produce el bloque «TONO DEL BOT:»
 * que se añade al prompt de sistema del chat. Los límites honestos SIEMPRE van:
 * son la última línea de `instruccionesDeTono` (núcleo §4) — este módulo no puede quitarlos.
 *
 * Cliente: la lectura de `window.localStorage` SIEMPRE va en try/catch — nunca lanza.
 */
import type { Bot, Personalidad } from "../tipos";
import {
  instruccionesDeTono,
  mezclarPersonalidad,
  type PreferenciasPersona,
  type SenalesContexto,
  type Situacion,
} from "../personalidad-adaptable";
import { rasgosDesdePersonalidad, type EntradaAurora } from "../personalidad-desde-aurora";

export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

/** Sanea el JSON guardado a `PreferenciasPersona`. La basura da `{}`, nunca lanza. */
export function preferenciasDesdeJson(bruto: string | null | undefined): PreferenciasPersona {
  if (!bruto) return {};
  try {
    const d = JSON.parse(bruto) as unknown;
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    const out: PreferenciasPersona = {};
    const rasgos = (d as Record<string, unknown>).rasgos;
    if (rasgos && typeof rasgos === "object" && !Array.isArray(rasgos)) {
      const fijos: Partial<Personalidad> = {};
      for (const [k, v] of Object.entries(rasgos as Record<string, unknown>)) {
        // Solo rasgos reales del núcleo y números acotados a [0, 1].
        if (typeof v === "number" && Number.isFinite(v) && k in ({ calidez: 1, energia: 1, formalidad: 1, curiosidad: 1, humor: 1, concision: 1 } as const)) {
          fijos[k as keyof Personalidad] = Math.min(1, Math.max(0, v));
        }
      }
      if (Object.keys(fijos).length > 0) out.rasgos = fijos;
    }
    if ((d as Record<string, unknown>).sinHumor === true) out.sinHumor = true;
    if ((d as Record<string, unknown>).brevedad === true) out.brevedad = true;
    return out;
  } catch {
    return {};
  }
}

/** Lee las preferencias de la persona del almacén local (try/catch: nunca lanza). */
export function preferenciasPersona(): PreferenciasPersona {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    return preferenciasDesdeJson(window.localStorage.getItem(CLAVE_PREFERENCIAS));
  } catch {
    return {};
  }
}

/** Palabras clave simples → situación del núcleo (`SITUACIONES`). Sin diacríticos. */
const PALABRAS_SITUACION: [Situacion, string[]][] = [
  ["duelo", ["duelo", "falleci", "murio", "perdida", "condolencia", "luto"]],
  ["crisis", ["crisis", "emergencia", "urgente", "auxilio", "socorro", "ayudame"]],
  ["trabajo", ["trabajo", "reunion", "informe", "cliente", "oficina", "proyecto"]],
  ["aprendizaje", ["aprender", "aprendizaje", "estudi", "clase", "curso"]],
  ["juego", ["juego", "jugar", "partida", "partido", "videojuego"]],
];

/** Detecta la situación de un turno por palabras clave. La primera que aparece gana. */
export function situacionDeTexto(texto: string): Situacion | undefined {
  const n = (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!n) return undefined;
  for (const [situacion, palabras] of PALABRAS_SITUACION) {
    if (palabras.some((p) => n.includes(p))) return situacion;
  }
  return undefined;
}

/**
 * Bloque «TONO DEL BOT:» para el prompt de sistema: ≤ 6 líneas, con la
 * personalidad del agente si el bot encarna uno, las preferencias de la persona
 * por delante y los límites honestos SIEMPRE al final (los pone el núcleo).
 */
export function bloqueTono(
  bot: Bot,
  agente?: EntradaAurora,
  senales?: SenalesContexto,
  prefs?: PreferenciasPersona,
): string {
  try {
    const preferencias = prefs ?? preferenciasPersona();
    const personalidadAgente = agente ? rasgosDesdePersonalidad(agente, bot.personalidad) : undefined;
    const contexto: SenalesContexto = senales ?? { sesion: "privada" };
    const p = mezclarPersonalidad(bot.personalidad, contexto, personalidadAgente, preferencias);
    return ["TONO DEL BOT:", ...instruccionesDeTono(p)].join("\n");
  } catch {
    return "";
  }
}
