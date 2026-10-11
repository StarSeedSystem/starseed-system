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

const PESO_ALEGRIA_ENERGIA = 0.15;
const PESO_ALEGRIA_HUMOR = 0.1;
const PESO_CALMA_ENERGIA = -0.1;

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

  // Emociones con pesos fijos (alegría sube energía y humor; calma baja energía).
  const alegria = leerValor(emociones as Record<string, unknown>, ["alegria", "joy"]);
  if (alegria !== undefined) {
    const a = normalizarA01(alegria);
    out.energia = acotar(out.energia + PESO_ALEGRIA_ENERGIA * a);
    out.humor = acotar(out.humor + PESO_ALEGRIA_HUMOR * a);
  }
  const calma = leerValor(emociones as Record<string, unknown>, ["calma", "calm"]);
  if (calma !== undefined) {
    out.energia = acotar(out.energia + PESO_CALMA_ENERGIA * normalizarA01(calma));
  }

  return out;
}
