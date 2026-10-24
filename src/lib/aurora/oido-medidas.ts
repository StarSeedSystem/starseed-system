/**
 * oido-medidas — de las medidas de `medidas-voz.ts` a la tabla que entiende el
 * elector del oído (`elegirOido`): motor → mediana de sus últimas medidas de
 * `tiempo-real-oido` (menor = mejor). Módulo PURO: entrada → salida, sin DOM,
 * red ni disco; nunca lanza.
 *
 * Se calcula con la misma regla que `vozMedida` (`capacidades-nodo.ts`): las
 * últimas 20 de cada motor y la mediana de sus valores. `buildRecognition`
 * pasa el resultado al elector para que el oído aprenda de lo medido en ESTA
 * neurona, sin bloquear el arranque del reconocimiento.
 */

import type { MedidaVoz } from "@/lib/aurora/medidas-voz";

/** Las medidas más recientes de cada motor que entran en la mediana. */
export const OIDO_MEDIDAS_POR_MOTOR = 20;

/** Tabla motor → mediana del retraso del oído, en la unidad con que se midió. */
export type MedidasOido = Record<string, number>;

const esPositivo = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const esMotor = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "" && v.length <= 64;

function mediana(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
}

export function medidasOido(
  medidas: readonly MedidaVoz[] | null | undefined,
  opciones: { maxPorMotor?: number } = {},
): MedidasOido {
  try {
    const pedido = opciones.maxPorMotor;
    const max =
      typeof pedido === "number" && Number.isFinite(pedido) && pedido > 0
        ? Math.floor(pedido)
        : OIDO_MEDIDAS_POR_MOTOR;
    const grupos = new Map<string, MedidaVoz[]>();
    for (const m of Array.isArray(medidas) ? medidas : []) {
      if (!m || m.tipo !== "tiempo-real-oido" || !esMotor(m.motor) || !esPositivo(m.valor)) continue;
      if (typeof m.timestamp !== "number" || !Number.isFinite(m.timestamp)) continue;
      const motor = m.motor.trim();
      const lista = grupos.get(motor);
      if (lista) lista.push(m);
      else grupos.set(motor, [m]);
    }
    const salida: MedidasOido = {};
    for (const [motor, lista] of grupos) {
      const ultimas = [...lista]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-max)
        .map((m) => m.valor);
      salida[motor] = mediana(ultimas);
    }
    return salida;
  } catch {
    return {};
  }
}
