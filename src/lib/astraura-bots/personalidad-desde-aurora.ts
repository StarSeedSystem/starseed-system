/**
 * Bots/dots de Astraura · PERSONALIDAD DESDE AURORA (BOT1011D1).
 * Contrato: architecture/astraura-bots.md §15 (núcleo escrito).
 *
 * Convierte la entrada de Aurora (params y emotions) en ajustes de rasgos
 * para la función mezclarPersonalidad. PURO: sin React, sin red, sin reloj.
 */
import { RASGOS, acotar, type Personalidad, type Rasgo } from "./tipos";

/** Mapeo de UserVoiceMood de src/lib/aurora/audio-emotion.ts a SenalesContexto.animo. */
export const ANIMO_DESDE_VOZ: Record<string, { valencia: number; activacion: number }> = {
  alegre: { valencia: 0.8, activacion: 0.7 },
  sereno: { valencia: 0.5, activacion: 0.3 },
  tenso: { valencia: -0.3, activacion: 0.8 },
  triste: { valencia: -0.7, activacion: 0.2 },
  enérgico: { valencia: 0.6, activacion: 0.9 },
  neutral: { valencia: 0.0, activacion: 0.5 },
};

/**
 * Lee claves numéricas conocidas de params (0-1 o 0-100) y emotions con pesos fijos,
 * acota con acotar y cae a base en lo que falte. Nunca lanza.
 * @param p Entrada de Aurora con params y emotions opcionales
 * @param base Personalidad base del bot
 * @return Personalidad ajustada
 */
export function rasgosDesdePersonalidad(
  p: { params?: Record<string, number | string | undefined>; emotions?: Record<string, number>; tags?: string[] },
  base: Personalidad,
): Personalidad {
  const out = { ...base };
  const params = p.params ?? {};
  const emotions = p.emotions ?? {};

  // Mapeo de aliases en inglés a rasgos españoles
  const alias: Record<string, Rasgo> = {
    warmth: "calidez",
    energy: "energia",
    formality: "formalidad",
    curiosity: "curiosidad",
    brevity: "concision",
  };

  // Procesar params (acepta 0-1 y 0-100)
  for (const [key, value] of Object.entries(params)) {
    let rasgo: Rasgo | undefined;
    let numValue: number | undefined;

    // Detectar si es un alias en inglés
    if (alias[key]) {
      rasgo = alias[key];
      numValue = typeof value === "number" ? value : undefined;
    } else if (RASGOS.includes(key as Rasgo)) {
      rasgo = key as Rasgo;
      numValue = typeof value === "number" ? value : undefined;
    }

    if (rasgo && numValue !== undefined) {
      // Convertir de 0-100 a 0-1 si es necesario
      const normalized = numValue > 1 ? numValue / 100 : numValue;
      // Peso fijo para params: 0.5 (mitad del efecto)
      out[rasgo] = acotar(base[rasgo] + 0.5 * (normalized - base[rasgo]));
    }
  }

   // Procesar emotions con pesos fijos
   if (emotions.alegria !== undefined) {
     const valor = typeof emotions.alegria === "number" ? emotions.alegria : 0;
     const normalized = valor > 1 ? valor / 100 : valor;
     // alegria sube energía y humor (peso 0.3 cada uno)
     out.energia = acotar(out.energia + 0.3 * normalized);
     out.humor = acotar(out.humor + 0.3 * normalized);
   }
   if (emotions.joy !== undefined) {
     // Alias en inglés for alegria
     const valor = typeof emotions.joy === "number" ? emotions.joy : 0;
     const normalized = valor > 1 ? valor / 100 : valor;
     out.energia = acotar(out.energia + 0.3 * normalized);
     out.humor = acotar(out.humor + 0.3 * normalized);
   }

   if (emotions.calma !== undefined) {
     const valor = typeof emotions.calma === "number" ? emotions.calma : 0;
     const normalized = valor > 1 ? valor / 100 : valor;
     // calma baja energía (peso 0.3)
     out.energia = acotar(out.energia - 0.3 * normalized);
   }
   if (emotions.calm !== undefined) {
     // Alias en inglés for calma
     const valor = typeof emotions.calm === "number" ? emotions.calm : 0;
     const normalized = valor > 1 ? valor / 100 : valor;
     out.energia = acotar(out.energia - 0.3 * normalized);
   }

  // Asegurar que todos los rasgos estén en [0,1] (acotar ya lo hace en cada paso, pero por seguridad)
  for (const k of RASGOS) {
    out[k] = acotar(out[k]);
  }

  return out;
}