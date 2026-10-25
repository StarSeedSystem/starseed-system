/**
 * Rescate RTIMN1021I · ajustes de la imaginación.
 *
 * La rama `nube/40145158800` probaba `aplicarCambio` y `textoRango` de un componente que main
 * no integró: hoy los ajustes se validan con `validarAjustes` (puro, en `imaginacion-tipos`).
 * Se conservan solo los bordes de ese contrato que la suite de `imaginacion-tipos` aún no cubre.
 */
import { describe, expect, it } from "vitest";

import { validarAjustes } from "@/lib/mando/imaginacion-tipos";

describe("ajustes de imaginación · bordes de rango y de días profundos", () => {
  it("rango: acota cada extremo a 0–10 y mantiene min ≤ max", () => {
    expect(validarAjustes({ rango: { min: 12 } }).rango).toEqual({ min: 10, max: 10 });
    expect(validarAjustes({ rango: { max: -3 } }).rango).toEqual({ min: 0, max: 0 });
    expect(validarAjustes({ rango: { min: 9, max: 6 } }).rango).toEqual({ min: 6, max: 6 });
    expect(validarAjustes({ rango: { min: 3, max: 1 } }).rango).toEqual({ min: 1, max: 1 });
  });

  it("profunda: nunca es negativa y 0 se respeta", () => {
    expect(validarAjustes({ profunda: { cada_dias: -5 } }).profunda.cada_dias).toBe(0);
    expect(validarAjustes({ profunda: { cada_dias: 0 } }).profunda.cada_dias).toBe(0);
  });
});
