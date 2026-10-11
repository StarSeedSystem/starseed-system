/**
 * Bots de Astraura · PERSONALIDAD DESDE AURORA (BOT1011D1).
 * Puro: sin React, sin red, sin `node:*`, sin reloj ni aleatoriedad.
 * Lee los rasgos de Aurora (`params` / `emotions`) y los traduce a la
 * personalidad del bot (`Personalidad` del núcleo).
 */
import { RASGOS, acotar, type Personalidad } from "./tipos";

// Forma mínima que llega desde Aurora (no se importa `src/lib/aurora/types.ts`).
export interface EntradaAurora {
  params?: Record<string, number | string | undefined>;
  emotions?: Record<string, number>;
  tags?: string[];
}

// Pesos fijos para emociones sobre rasgos.
const EMO_PESO: Record<string, { rasgo: string; delta: number }> = {
  alegria: { rasgo: "energia", delta: 0.15 },
  alegria_humor: { rasgo: "humor", delta: 0.1 },
  calma: { rasgo: "energia", delta: -0.1 },
  joy: { rasgo: "energia", delta: 0.15 },
  joy_humor: { rasgo: "humor", delta: 0.1 },
  calm: { rasgo: "energia", delta: -0.1 },
};

/** Traduce `UserVoiceMood` (audio-emotion) al ánimo del contexto (`SenalesContexto.animo`). */
export const ANIMO_DESDE_VOZ: Record<string, { valencia: number; activacion: number }> = {
  alegre: { valencia: 0.7, activacion: 0.8 },
  sereno: { valencia: 0.3, activacion: 0.2 },
  tenso: { valencia: -0.2, activacion: 0.7 },
  triste: { valencia: -0.6, activacion: 0.15 },
  energetico: { valencia: 0.5, activacion: 0.9 },
  enérgico: { valencia: 0.5, activacion: 0.9 },
  neutral: { valencia: 0, activacion: 0.3 },
};

function leerValor(
  mapa: Record<string, unknown>,
  claves: string[],
): number | undefined {
  for (const k of claves) {
    const v = mapa[k];
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizarA01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v <= 1) return v; // ya está en escala 0..1
  if (v <= 100) return v / 100; // escala 0..100
  return 1; // todo lo mayor se acota a 1
}

export function rasgosDesdePersonalidad(
  p: EntradaAurora,
  base: Personalidad,
): Personalidad {
  const out = {} as Personalidad;
  const params = p.params || {};
  const emociones = p.emotions || {};

  // Mapeo de claves conocidas → rasgo (alias en inglés + español).
  const mapaClaves: Record<string, { rasgo: typeof RASGOS[number]; claves: string[] }> = {
    calidez: { rasgo: "calidez", claves: ["calidez", "warmth"] },
    energia: { rasgo: "energia", claves: ["energia", "energy"] },
    formalidad: { rasgo: "formalidad", claves: ["formalidad", "formality"] },
    curiosidad: { rasgo: "curiosidad", claves: ["curiosidad", "curiosity"] },
    humor: { rasgo: "humor", claves: ["humor"] },
    concision: { rasgo: "concision", claves: ["concision", "brevity"] },
  };

  for (const r of RASGOS) {
    const info = mapaClaves[r];
    let v = leerValor(params as Record<string, unknown>, info.claves);
    if (v !== undefined) {
      v = normalizarA01(v);
    } else {
      v = base[r];
    }
    out[r] = acotar(v, 0, 1);
  }

  // Emociones con pesos fijos.
  const alegria = leerValor(emociones as Record<string, unknown>, ["alegria", "joy", "alegria_joy"]);
  if (alegria !== undefined && Number.isFinite(alegria)) {
    const a = acotar(alegria / 100, 0, 1);
    out["energia"] = acotar(out["energia"] + 0.15 * a, 0, 1);
    out["humor"] = acotar(out["humor"] + 0.1 * a, 0, 1);
  }
  const calma = leerValor(emociones as Record<string, unknown>, ["calma", "calm", "calma_calm"]);
  if (calma !== undefined && Number.isFinite(calma)) {
    const c = acotar(calma / 100, 0, 1);
    out["energia"] = acotar(out["energia"] - 0.1 * c, 0, 1);
  }

  return out;
}
