import type { PerfTierAuto, ModoRendimiento } from '@/lib/perf/modo-rendimiento';
import { fpsObjetivo } from '@/lib/perf/modo-rendimiento';

/** Cuerpos visibles por tier del aparato (device-tier.ts). */
export const TOPE_CUERPOS: Record<PerfTierAuto, number> = {
  high: 5000,
  mid: 1500,
  low: 400,
};

const FACTOR_ARISTAS: Record<PerfTierAuto, number> = { high: 3, mid: 2, low: 1.5 };
const TOPE_PARTICULAS: Record<PerfTierAuto, number> = { high: 1200, mid: 400, low: 120 };
const TOPE_ETIQUETAS: Record<PerfTierAuto, number> = { high: 40, mid: 24, low: 12 };

export interface EntradaTopes {
  tier: PerfTierAuto;
  modo: ModoRendimiento;
  /** Sin uso: pestaña oculta o sin interacción reciente. */
  sinUso: boolean;
}

export interface TopesEscena {
  maxCuerpos: number;
  maxAristas: number;
  maxParticulas: number;
  maxEtiquetas: number;
  /** 0 = sin límite; >0 = cuadros por segundo; -1 = pausado. */
  cuadros: number;
}

export function topeCuerpos(tier: PerfTierAuto): number {
  return TOPE_CUERPOS[tier];
}

/** Cuadros por segundo: eco y eficiente bajan y pausan sin uso; alto no cambia. */
export function cuadrosPorSegundo(modo: ModoRendimiento, sinUso: boolean): number {
  const fps = fpsObjetivo(modo);
  if (fps > 0 && sinUso) return -1;
  return fps;
}

/** Topes de la escena. El modo baja cuadros y partículas, nunca cuerpos ni diseños. */
export function topesEscena({ tier, modo, sinUso }: EntradaTopes): TopesEscena {
  const maxCuerpos = TOPE_CUERPOS[tier];
  const ahorro = fpsObjetivo(modo) > 0 ? 0.5 : 1;
  return {
    maxCuerpos,
    maxAristas: Math.round(maxCuerpos * FACTOR_ARISTAS[tier]),
    maxParticulas: Math.round(TOPE_PARTICULAS[tier] * ahorro),
    maxEtiquetas: TOPE_ETIQUETAS[tier],
    cuadros: cuadrosPorSegundo(modo, sinUso),
  };
}

/** Lee un triple HSL de token CSS ("210 100% 50%") como [h, s, l] en 0..1; null si no lo entiende. */
export function parsearHsl(valor: string): [number, number, number] | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/.exec(valor);
  if (!m) return null;
  const h = ((Number(m[1]) % 360) + 360) % 360;
  return [h / 360, Math.min(1, Number(m[2]) / 100), Math.min(1, Number(m[3]) / 100)];
}

/** Índices visibles: los forzados primero, luego los de más peso; orden ascendente. */
export function seleccionarVisibles(
  pesos: ArrayLike<number>,
  tope: number,
  forzados: readonly number[],
): number[] {
  const n = pesos.length;
  if (tope <= 0) return [];
  if (n <= tope) return Array.from({ length: n }, (_, i) => i);
  const elegidos = new Set<number>();
  for (const i of forzados) {
    if (elegidos.size >= tope) break;
    if (i >= 0 && i < n) elegidos.add(i);
  }
  const resto: number[] = [];
  for (let i = 0; i < n; i++) if (!elegidos.has(i)) resto.push(i);
  resto.sort((a, b) => pesos[b] - pesos[a] || a - b);
  for (const i of resto) {
    if (elegidos.size >= tope) break;
    elegidos.add(i);
  }
  return Array.from(elegidos).sort((a, b) => a - b);
}
