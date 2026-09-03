// (Ola 223) Relevo preventivo por presupuesto: umbrales y función pura de
// descarte/penalización por consumo del cupo diario de una fuente. Extraído
// del router para que la regla sea testeable y explícita (I1F).

export const PRESUPUESTO_DESCARTE = 90;
export const PRESUPUESTO_PENALIZACION = 70;

/**
 * Decide si una fuente debe descartarse o penalizarse según su porcentaje
 * de cupo diario consumido.
 * - dailyPercent undefined/null/NaN → sin efecto (fuente no medida).
 * - Fuentes locales: nunca se descartan ni penalizan (no gastan presupuesto).
 * - Remotas >= PRESUPUESTO_DESCARTE → descartar.
 * - Remotas en [PRESUPUESTO_PENALIZACION, PRESUPUESTO_DESCARTE) → penalización
 *   proporcional de 0 a 20 puntos (70% → 0, 90% → 20).
 * - Remotas < PRESUPUESTO_PENALIZACION → sin efecto.
 */
export function penalizacionPorPresupuesto(
  dailyPercent: number | null | undefined,
  esLocal: boolean,
): { descartar: boolean; penalizacion: number } {
  if (dailyPercent === null || dailyPercent === undefined || Number.isNaN(dailyPercent)) {
    return { descartar: false, penalizacion: 0 };
  }
  if (esLocal) return { descartar: false, penalizacion: 0 };
  if (dailyPercent >= PRESUPUESTO_DESCARTE) return { descartar: true, penalizacion: 0 };
  if (dailyPercent >= PRESUPUESTO_PENALIZACION) {
    const tramo =
      (dailyPercent - PRESUPUESTO_PENALIZACION) / (PRESUPUESTO_DESCARTE - PRESUPUESTO_PENALIZACION);
    return { descartar: false, penalizacion: tramo * 20 };
  }
  return { descartar: false, penalizacion: 0 };
}
