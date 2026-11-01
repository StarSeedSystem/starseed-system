/**
 * Prueba del átomo «Opciones de imagen de Astraura» (IMG1011J). Sin red ni GPU:
 * solo definición y parámetros puros.
 */
import { describe, expect, it } from "vitest";
import {
  TARJETA_IMAGENES,
  opcionesTarjeta,
} from "../imagen-tarjeta";

describe("átomo tarjeta-imagenes", () => {
  it("declara vista de componente, control total con su parámetro y tope de 8 opciones", () => {
    expect(TARJETA_IMAGENES.vista).toEqual({ tipo: "componente", id: "tarjeta-imagenes" });
    expect(TARJETA_IMAGENES.categoria).toBe("imagen");
    expect(TARJETA_IMAGENES.control).toBe("total");
    expect(TARJETA_IMAGENES.parametros.map((p) => p.id)).toEqual(["opciones"]);
    expect(TARJETA_IMAGENES.parametros[0]?.max).toBe(8);
  });

  it("opcionesTarjeta corrige lo que se salga de los topes y no inventa cuando no hay número", () => {
    expect(opcionesTarjeta(undefined)).toBe(4);
    expect(opcionesTarjeta("muchas")).toBe(4);
    expect(opcionesTarjeta(2.7)).toBe(2);
    expect(opcionesTarjeta(0)).toBe(1);
    expect(opcionesTarjeta(99)).toBe(8);
    expect(opcionesTarjeta(4)).toBe(4);
  });
});
