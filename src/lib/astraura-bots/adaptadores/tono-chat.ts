/**
 * Bots de Astraura · TONO EN EL CHAT (BOT1011S). Contrato: architecture/astraura-bots.md §4.
 *
 * Pasa la personalidad del bot (mezclada con la del agente encarnado y las preferencias de la
 * persona) al prompt del chat, en un bloque «TONO DEL BOT:» de ≤ 6 líneas que SIEMPRE termina
 * con los límites honestos de `instruccionesDeTono`. Adaptador: lee `localStorage`, así que las
 * partes probables en node (`saneaPreferencias`, `situacionDeTexto`, `bloqueTono`) son puras y
 * la lectura del navegador queda aislada y a prueba de basura.
 */
import { RASGOS, acotar, type Personalidad } from "../tipos";
import {
  instruccionesDeTono,
  mezclarPersonalidad,
  SITUACIONES,
  type PreferenciasPersona,
  type SenalesContexto,
  type Situacion,
} from "../personalidad-adaptable";
import { rasgosDesdePersonalidad, type EntradaAurora } from "../personalidad-desde-aurora";
import { botPredeterminado } from "../predeterminado";

/** Clave de las preferencias sincronizadas de la persona (rasgos fijados a mano). */
export const CLAVE_PREFERENCIAS = "starseed.astraura.bots.preferencias.v1";

export const CABECERA_TONO = "TONO DEL BOT:";

export function saneaPreferencias(raw: unknown): PreferenciasPersona {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: PreferenciasPersona = {};
  if (r.sinHumor === true) out.sinHumor = true;
  if (r.brevedad === true) out.brevedad = true;
  if (typeof r.rasgos === "object" && r.rasgos !== null && !Array.isArray(r.rasgos)) {
    const crudos = r.rasgos as Record<string, unknown>;
    const rasgos: Partial<Personalidad> = {};
    for (const k of RASGOS) {
      const v = crudos[k];
      if (typeof v === "number" && Number.isFinite(v)) rasgos[k] = acotar(v);
    }
    if (Object.keys(rasgos).length > 0) out.rasgos = rasgos;
  }
  return out;
}

/** Lee las preferencias fijadas por la persona (navegador) sin lanzar nunca, ni con basura guardada. */
export function preferenciasPersona(leer?: () => unknown): PreferenciasPersona {
  try {
    const bruto = leer ? leer() : typeof localStorage === "undefined" ? null : localStorage.getItem(CLAVE_PREFERENCIAS);
    if (typeof bruto === "string" && bruto.trim() !== "") return saneaPreferencias(JSON.parse(bruto));
    if (typeof bruto !== "string") return saneaPreferencias(bruto);
    return {};
  } catch {
    return {};
  }
}

const PALABRAS_SITUACION: ReadonlyArray<readonly [Situacion, readonly string[]]> = [
  ["crisis", ["crisis", "urgente", "emergencia", "auxilio"]],
  ["duelo", ["duelo", "luto", "fallec"]],
  ["trabajo", ["trabajo", "proyecto"]],
  ["aprendizaje", ["aprendo", "aprender", "estudi", "enseñ"]],
  ["juego", ["juego", "jugar", "partida"]],
];

/** Situación desde el texto, por palabras clave simples (crisis y duelo primero: son cuidado). */
export function situacionDeTexto(texto: string): Situacion {
  const minuscula = (texto || "").toLowerCase();
  for (const [situacion, palabras] of PALABRAS_SITUACION) {
    if (palabras.some((p) => minuscula.includes(p))) return situacion;
  }
  return "neutra";
}

/** Bloque «TONO DEL BOT:» para el prompt: personalidad del bot + agente encarnado +
 *  situación + preferencias de la persona. ≤ 6 líneas y SIEMPRE termina con los
 *  límites honestos (la última línea de `instruccionesDeTono`). */
export function bloqueTono(
  bot: { personalidad: Personalidad },
  agente?: EntradaAurora,
  senales?: Partial<SenalesContexto>,
  prefs?: PreferenciasPersona,
): string {
  const base = bot.personalidad;
  const situacion = senales?.situacion && (SITUACIONES as readonly string[]).includes(senales.situacion)
    ? senales.situacion
    : "neutra";
  const delAgente = agente ? rasgosDesdePersonalidad(agente, base) : undefined;
  const p = mezclarPersonalidad(base, { sesion: senales?.sesion ?? "privada", situacion }, delAgente, prefs ?? preferenciasPersona());
  const [rasgos1, rasgos2, limites] = instruccionesDeTono(p);
  const lineas = [CABECERA_TONO, rasgos1, rasgos2];
  if (situacion !== "neutra") lineas.push(`Situación: ${situacion}. Acompañas con calma, sin prisa ni presión.`);
  lineas.push(limites);
  return lineas.join("\n");
}

/** Bloque de tono para el chat del bot predeterminado (Astraura), con las señales sacadas del texto. */
export function tonoDeChatAstraura(texto: string, agente?: EntradaAurora): string {
  const bot = botPredeterminado("chat-astraura", "chat-astraura");
  return bloqueTono(bot, agente, { sesion: "privada", situacion: situacionDeTexto(texto) });
}
