/**
 * medidas-oido.ts — de las medidas anotadas (`medidas-voz.ts`) a la entrada del
 * elector del oído (`elegirOido`). Módulo PURO: no lee almacén ni reloj, todo
 * entra por parámetro. Lo que el elector ordena es `tiempo-real-oido` (menor =
 * mejor): el retraso del oído en ESTA neurona, no la ficha del fabricante.
 */

import type { MedidaVoz } from "@/lib/aurora/medidas-voz";

/** Las más recientes que cuentan por motor (las mismas que usa `vozMedida`). */
export const OIDO_MEDIDAS_POR_MOTOR = 20;
/** Una medida más vieja que esto ya no dice nada del motor de hoy. */
export const OIDO_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

export interface OpcionesMedidasOido {
  /** Solo las medidas de esta neurona; sin él, cuentan todas las que lleguen. */
  neurona?: string;
  /** Idioma del tramo («es-ES» → «es»). Las medidas sin idioma también cuentan. */
  idioma?: string;
  /** Reloj inyectable (ms). */
  ahora?: number;
  /** Vigencia de una medida; por defecto, `OIDO_VIGENCIA_MS`. */
  vigenciaMs?: number;
  /** Cuántas medidas recientes entran en la mediana de cada motor. */
  maxPorMotor?: number;
}

const esPositivo = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/** «es-ES» → «es»; lo que no parezca un idioma, null. */
const baseIdioma = (v: unknown): string | null => {
  const base = typeof v === "string" ? v.trim().toLowerCase().split(/[-_]/)[0] : "";
  return /^[a-z]{2,3}$/.test(base) ? base : null;
};

const mediana = (valores: number[]): number => {
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * medidasOido — mediana de `tiempo-real-oido` por motor, de las últimas
 * `maxPorMotor` medidas vigentes de esa neurona (y de ese idioma, cuando se
 * sabe). Devuelve `{ motor: ms }`, listo para `elegirOido({ medidas })`.
 * Nunca lanza: lo que no encaja se descarta y, sin nada válido, `{}`.
 */
export function medidasOido(
  medidas: readonly MedidaVoz[] | null | undefined,
  opciones: OpcionesMedidasOido = {},
): Record<string, number> {
  try {
    const ahora = opciones.ahora ?? Date.now();
    const vigencia = opciones.vigenciaMs ?? OIDO_VIGENCIA_MS;
    const maxPorMotor = Math.max(1, Math.trunc(opciones.maxPorMotor ?? OIDO_MEDIDAS_POR_MOTOR));
    const idioma = baseIdioma(opciones.idioma);
    const grupos = new Map<string, MedidaVoz[]>();
    for (const m of Array.isArray(medidas) ? medidas : []) {
      if (!m || m.tipo !== "tiempo-real-oido") continue;
      if (opciones.neurona !== undefined && m.neurona !== opciones.neurona) continue;
      if (typeof m.motor !== "string" || m.motor.trim() === "") continue;
      if (!esPositivo(m.valor)) continue;
      if (typeof m.timestamp !== "number" || !Number.isFinite(m.timestamp)) continue;
      if (m.timestamp > ahora || ahora - m.timestamp > vigencia) continue;
      const delMedida = baseIdioma(m.idioma);
      if (idioma && delMedida && delMedida !== idioma) continue;
      const motor = m.motor.trim();
      grupos.set(motor, [...(grupos.get(motor) ?? []), m]);
    }
    const salida: Record<string, number> = {};
    for (const [motor, lista] of grupos) {
      const ultimas = [...lista].sort((a, b) => a.timestamp - b.timestamp).slice(-maxPorMotor);
      salida[motor] = mediana(ultimas.map((m) => m.valor));
    }
    return salida;
  } catch {
    return {};
  }
}
