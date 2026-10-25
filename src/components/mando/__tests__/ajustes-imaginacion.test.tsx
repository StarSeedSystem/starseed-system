/**
 * Rescate RTIMN1021I (rama nube/40145158800) de los ajustes de la imaginación,
 * adaptados a la API de hoy: la validez la fija `validarAjustes`
 * (src/lib/mando/imaginacion-tipos) y en main no hay vista propia de
 * rango/fuentes/horario: la vista del pulso solo guarda la sección automática.
 *
 * Descartados del original, ya cubiertos con otro nombre o bajo contratos que
 * main cambió a propósito:
 * · `textoRango` y `aplicarCambio` no existen en main; el rango (acotado 0–10,
 *   min ≤ max), las franjas válidas, modo, repartir, fuentes y profunda
 *   (999 → 365) se cubren en src/lib/mando/__tests__/imaginacion-tipos.test.ts.
 * · «Redondea 4,6 a 5»: la API de hoy valida por enteros estrictos y lo no
 *   entero vuelve al defecto (cubierto con { min: true, max: 2.5 }).
 * · Añadir/quitar franjas, pintarlas y guardar { rango, fuentes, horario,
 *   profunda } con POST: UI retirada; hoy el POST solo guarda el bloque `auto`
 *   (cubierto en panel-imaginacion.test.tsx).
 * Sobrevive, porque nadie lo cubría: el suelo de la imaginación profunda.
 */
import { describe, expect, it } from "vitest";
import { AJUSTES_POR_DEFECTO, validarAjustes } from "@/lib/mando/imaginacion-tipos";

describe("ajustes de la imaginación (rescate RTIMN1021I)", () => {
  it("la imaginación profunda acota cada_dias por los dos lados: 0–365", () => {
    expect(validarAjustes({ profunda: { cada_dias: -5 } }).profunda.cada_dias).toBe(0);
    expect(validarAjustes({ profunda: { cada_dias: 0 } }).profunda.cada_dias).toBe(0);
    expect(AJUSTES_POR_DEFECTO.profunda.cada_dias).toBe(7);
  });
});
