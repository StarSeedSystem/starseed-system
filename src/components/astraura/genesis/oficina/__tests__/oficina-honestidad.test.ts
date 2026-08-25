/**
 * oficina-honestidad.test.ts — `datosReales` manda por encima de todo lo
 * demás. Esta es la puerta que el encargo señala como la más importante:
 * "nada de animar trabajadores atareados que no están haciendo nada".
 */
import { describe, it, expect } from "vitest";
import { actividadVisible, debeAnimarOficina, mensajeHonestidad } from "../oficina-honestidad";

describe("debeAnimarOficina", () => {
  it("con datos reales, pestaña visible y sin movimiento reducido: anima", () => {
    expect(debeAnimarOficina({ datosReales: true, documentoVisible: true, movimientoReducido: false })).toBe(true);
  });

  it("datosReales=false GANA siempre, aunque todo lo demás diga que sí se podría animar", () => {
    expect(debeAnimarOficina({ datosReales: false, documentoVisible: true, movimientoReducido: false })).toBe(false);
  });

  it("pestaña en segundo plano detiene la animación aunque los datos sean reales", () => {
    expect(debeAnimarOficina({ datosReales: true, documentoVisible: false, movimientoReducido: false })).toBe(false);
  });

  it("movimiento reducido detiene la animación aunque los datos sean reales", () => {
    expect(debeAnimarOficina({ datosReales: true, documentoVisible: true, movimientoReducido: true })).toBe(false);
  });
});

describe("actividadVisible", () => {
  it("sin datos reales, la actividad mostrada es SIEMPRE 0 — aunque el backend mande otra cosa", () => {
    expect(actividadVisible(0.9, false)).toBe(0);
    expect(actividadVisible(1, false)).toBe(0);
  });

  it("con datos reales, se recorta a 0..1 pero se muestra tal cual", () => {
    expect(actividadVisible(0.4, true)).toBe(0.4);
    expect(actividadVisible(1.5, true)).toBe(1);
    expect(actividadVisible(-0.2, true)).toBe(0);
  });
});

describe("mensajeHonestidad", () => {
  it("sin datos reales, avisa explícitamente de que no están verificados", () => {
    const texto = mensajeHonestidad(false);
    expect(texto.length).toBeGreaterThan(0);
    expect(texto.toLowerCase()).toContain("no verificad");
  });

  it("con datos reales, el mensaje es distinto y no contiene la advertencia", () => {
    const texto = mensajeHonestidad(true);
    expect(texto.length).toBeGreaterThan(0);
    expect(texto.toLowerCase()).not.toContain("no verificad");
    expect(texto).not.toBe(mensajeHonestidad(false));
  });
});
