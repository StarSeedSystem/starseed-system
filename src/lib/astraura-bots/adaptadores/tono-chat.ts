import { type Personalidad } from "@/lib/astraura-bots/tipos";
import { type ParamMap } from "@/lib/aurora/types";
import { type SenalesContexto, mezclarPersonalidad, instruccionesDeTono } from "@/lib/astraura-bots/personalidad-adaptable";
import { rasgosDesdePersonalidad } from "@/lib/astraura-bots/personalidad-desde-aurora";

export interface PreferenciasPersona {
  rasgos?: Partial<Personalidad>;
  sinHumor?: boolean;
  brevedad?: boolean;
}

/**
 * Lee las preferencias del bot del storage (`starseed.astraura.bots.preferencias.v1`).
 * Configuración editable por la persona: rasgos fijados, sin humor, brevedad.
 * Si el storage no existe o da error, devuelve un objeto vacío (el bot usa sus valores por defecto).
 */
export function preferenciasPersona(): PreferenciasPersona {
  try {
    const storage = (globalThis as unknown as { STARSEED_memory?: unknown }).STARSEED_memory;
    if (!storage || typeof (storage as { get: unknown }).get !== "function") return {};
    const raw = (storage as { get: (key: string) => unknown }).get("starseed.astraura.bots.preferencias.v1");
    if (!raw) return {};
    const data = raw as unknown as Record<string, unknown>;
    const rasgosRaw = data?.rasgos;
    const sinHumorRaw = data?.sinHumor;
    const brevedadRaw = data?.brevedad;

    const rasgos = typeof rasgosRaw === "object" && rasgosRaw && typeof (rasgosRaw as Record<string, unknown>).calidez === "number"
      ? (rasgosRaw as Record<string, number>)
      : undefined;

    return {
      rasgos,
      sinHumor: typeof sinHumorRaw === "boolean" ? sinHumorRaw : undefined,
      brevedad: typeof brevedadRaw === "boolean" ? brevedadRaw : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Construye el bloque «TONO DEL BOT:» que va en el mensaje del sistema del modelo.
 * - Si se pasa `agente`, usa su personalidad Aurora para enriquecer la base.
 * - Los `senales` pueden indicar la situación (trabajo, aprendizaje, juego, duelo/crisis).
 * El bloque tiene ≤ 6 líneas y termina SIEMPRE con los límites honestos.
 */
export function bloqueTono(bot: { personalidad: Personalidad; }, agente?: { personalidadAurora?: { params?: Record<string, number>; emotions?: Record<string, number>; } | undefined; }, senales?: SenalesContexto): string {
  const prefs = preferenciasPersona();

  let base = { ...bot.personalidad };
  if (agente?.personalidadAurora) {
    const rasgosAgente = rasgosDesdePersonalidad(
      {
        params: agente.personalidadAurora?.params,
        emotions: agente.personalidadAurora?.emotions,
      },
      bot.personalidad,
    );
    base = mezclarPersonalidad(bot.personalidad, { situacion: "neutra", sesion: "privada" }, rasgosAgente, prefs);
  }

  const senalesCompletas: SenalesContexto = senales ?? { situacion: "neutra", sesion: "privada" };
  const mezcla = mezclarPersonalidad(base, senalesCompletas, undefined, prefs);
  const lineas = instruccionesDeTono(mezcla);
  const limites = "Limites honestos: nunca adulo, nunca urgencia falsa, nunca culpa; empatía ≤50 %, valencia ≥ −0,3; siempre reconozco que soy una IA.";

  return `TONO DEL BOT:\n${lineas.join("\n")}\n${limites}`;
}
