/**
 * Selector de avatar · prueba de la función pura que elige el visor (SUC1018F-d2).
 * PURO: sin red, sin disco, sin procesos lanzados.
 */
import { describe, expect, it } from "vitest";
import { seleccionarVisor } from "@/lib/avatares/seleccion-visor";

describe("seleccionarVisor", () => {
  it("devuelve visor de modelo para URLs GLB auténticas", () => {
    const resultado = seleccionarVisor("https://example.com/model.glb");
    expect(resultado).toEqual({
      tipo: "modelo",
      props: {
        fuente: { tipo: "glb", url: "https://example.com/model.glb" },
      },
    });
  });

  it("devuelve visor VRM para referencias de biblioteca", () => {
    const resultado = seleccionarVisor("biblioteca:avatar/persona");
    expect(resultado).toEqual({
      tipo: "vrm",
      props: {
        adn: expect.any(Object),
        calidad: "vrm",
      },
    });
  });

  it("devuelve visor procedural para referencias inválidas o de génesis", () => {
    const resultado1 = seleccionarVisor("genesis:algo");
    expect(resultado1).toEqual({
      tipo: "procedural",
      props: {
        fuente: { tipo: "procedural", svg: "" },
      },
    });

    const resultado2 = seleccionarVisor("https://example.com/model.txt"); // No es GLB
    expect(resultado2).toEqual({
      tipo: "procedural",
      props: {
        fuente: { tipo: "procedural", svg: "" },
      },
    });
  });

  it("devuelve visor de imagen para URLs de imagen", () => {
    const resultado = seleccionarVisor("https://example.com/avatar.png");
    expect(resultado).toEqual({
      tipo: "imagen",
      props: {
        fuente: { tipo: "imagen", url: "https://example.com/avatar.png" },
      },
    });
  });
});