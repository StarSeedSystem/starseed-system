import { mezclarPersonalidad, instruccionesDeTono, type Personalidad, type SenalesContexto, type PreferenciasPersona } from "../personalidad-adaptable";
import { rasgosDesdePersonalidad } from "../personalidad-desde-aurora";

/**
 * Lee las preferencias de la persona desde localStorage.
 * Clave: starseed.astraura.bots.preferencias.v1
 * Devuelve un objeto con rasgos fijados, sinHumor y brevedad.
 * Si falla, devuelve valores por defecto (vacíos).
 */
export function preferenciasPersona(): PreferenciasPersona {
  try {
    const raw = window.localStorage.getItem("starseed.astraura.bots.preferencias.v1");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Validamos que tenga la estructura esperada
    return {
      rasgos: parsed.rasgos ?? undefined,
      sinHumor: Boolean(parsed.sinHumor),
      brevedad: Boolean(parsed.brevedad),
    };
  } catch {
    return {};
  }
}

/**
 * Devuelve el bloque de tono para el prompt del modelo.
 * @param bot - Personalidad base del bot
 * @param agente - Personalidad del agente que encarna (opcional)
 * @param senales - Señales de contexto (situación, sesión, ánimo)
 * @returns Texto "TONO DEL BOT:" seguido de hasta 6 líneas de instrucciones de tono.
 */
export function bloqueTono(
  bot: Personalidad,
  agente: Personalidad | undefined,
  senales: SenalesContexto
): string {
  // 1. Mezclar personalidad: base del bot + agente (si existe) + señales + preferencias
  const prefs = preferenciasPersona();
  const mezclada = mezclarPersonalidad(bot, senales, agente, prefs);
  // 2. Obtener instrucciones de tono (líneas separadas)
  const lineas = instruccionesDeTono(mezclada);
  // 3. Unir con encabezado y límite de 6 líneas
  const encabezado = "TONO DEL BOT:";
  const lineasTomadas = lineas.slice(0, 6);
  const bloque = [encabezado, ...lineasTomadas].join("\n");
  return bloque;
}