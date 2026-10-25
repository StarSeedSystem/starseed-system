/**
 * RTIMN1021I · Rescate de las pruebas de los ajustes de la imaginación.
 *
 * La rama nube/40145158800 probaba un componente `AjustesImaginacion` y un
 * reductor `aplicarCambio` que main ya no tiene: hoy la validación pura vive en
 * `validarAjustes`. Se conservan solo los casos que main no cubría.
 */
import { describe, expect, it } from "vitest";

import { validarAjustes } from "@/lib/mando/imaginacion-tipos";

describe("validarAjustes · rescate de los ajustes de la imaginación (RTIMN1021I)", () => {
  it("acota el rango 0–10 y nunca cruza mínimo y máximo", () => {
    expect(validarAjustes({ rango: { min: 12 } }).rango).toEqual({ min: 10, max: 10 });
    expect(validarAjustes({ rango: { max: -3 } }).rango).toEqual({ min: 0, max: 0 });
  });

  it("la imaginación profunda se acota a 0–365 días", () => {
    expect(validarAjustes({ profunda: { cada_dias: -5 } }).profunda.cada_dias).toBe(0);
  });
});
