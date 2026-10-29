/**
 * Bots de Astraura · TONO DEL BOT EN EL CHAT (BOT1011S). Contrato:
 * architecture/astraura-bots.md §4. Adaptador ligero sin React: lee las
 * preferencias de la persona (`starseed.astraura.bots.preferencias.v1`),
 * encarna la personalidad del agente activo (BOT1011D1) con `rasgosDesdePersonalidad`
 * y arma el bloque «TONO DEL BOT:» para el mensaje de sistema, que SIEMPRE
 * termina en los límites honestos (`instruccionesDeTono`). Todo con try/catch:
 * una preferencia rota jamás rompe el chat.
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

/** Clave de las preferencias de tono sincronizadas de la persona. */
export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

type RasgosParciales = NonNullable<PreferenciasPersona["rasgos"]>;
const CLAVES_RASGOS: ReadonlySet<string> = new Set([
  "calidez", "energia", "formalidad", "curiosidad", "humor", "concision",
]);

/** Palabras clave simples → situación del núcleo (SITUACIONES). */
const PALABRAS: ReadonlyArray<readonly [Situacion, readonly string[]]> = [
  ["crisis", ["crisis", "emergencia", "urgente"]],
  ["duelo", ["duelo", "muerte", "fallec", "pésame", "condolencia"]],
  ["trabajo", ["trabajo", "reunión", "oficina", "cliente"]],
  ["aprendizaje", ["aprend", "estudi", "lección", "práctica"]],
  ["juego", ["juego", "jugar", "partida", "divert"]],
];

/** Situación detectada por palabras clave simples; `neutra` si nada entraña. */
export function situacionDeTexto(texto: string): Situacion {
  const t = texto.toLowerCase();
  if (!t) return "neutra";
  for (const [situacion, palabras] of PALABRAS) {
    if (palabras.some((p) => t.includes(p))) return situacion;
  }
  return "neutra";
}

/** Sanea lo guardado a `PreferenciasPersona`: lo que no se entiende, se descarta. */
export function parsearPreferencias(bruto: unknown): PreferenciasPersona {
  const out: PreferenciasPersona = {};
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return out;
  const r = bruto as Record<string, unknown>;
  if (r.sinHumor === true) out.sinHumor = true;
  if (r.brevedad === true) out.brevedad = true;
  if (typeof r.rasgos === "object" && r.rasgos !== null && !Array.isArray(r.rasgos)) {
    const rasgos: RasgosParciales = {};
    for (const [k, v] of Object.entries(r.rasgos as Record<string, unknown>)) {
      if (CLAVES_RASGOS.has(k) && typeof v === "number" && Number.isFinite(v)) {
        rasgos[k as keyof RasgosParciales] = v;
      }
    }
    if (Object.keys(rasgos).length > 0) out.rasgos = rasgos;
  }
  return out;
}

/** Preferencias de la persona; en SSR o sin datos → `{}` (nunca lanza). */
export function preferenciasPersona(): PreferenciasPersona {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(CLAVE_PREFERENCIAS);
    return parsearPreferencias(bruto === null ? null : JSON.parse(bruto));
  } catch {
    return {};
  }
}

/**
 * Bloque «TONO DEL BOT:» para el prompt de sistema, de ≤ 6 líneas: la mezcla
 * determinista del núcleo (base del bot → agente encarnado → situación →
 * preferencias de la persona) pasada por `instruccionesDeTono`.
 */
export function bloqueTono(
  bot: Bot,
  agente?: EntradaAurora,
  senales: SenalesContexto = { sesion: "privada" },
  prefs: PreferenciasPersona = preferenciasPersona(),
): string {
  const personalidadAgente = agente ? rasgosDesdePersonalidad(agente, bot.personalidad) : undefined;
  const p = mezclarPersonalidad(bot.personalidad, senales, personalidadAgente, prefs);
  const lineas: string[] = ["TONO DEL BOT:", ...instruccionesDeTono(p)];
  if (prefs.sinHumor) lineas.push("Sin humor: la persona lo fijó.");
  if (prefs.brevedad) lineas.push("Sé breve: la persona lo fijó.");
  return lineas.slice(0, 6).join("\n");
}
