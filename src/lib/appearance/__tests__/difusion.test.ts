/**
 * difusion.test.ts — Pruebas unitarias para las funciones puras de difusión (Ola 1018F)
 * ============================================================================
 */

import { describe, it, expect } from "vitest";
import { estiloDifusion, generarTexturaSvg } from "../difusion";
import type { DifusionConfig } from "../background-layers";

describe("difusion.ts (funciones puras)", () => {
  it("genera textura vacía cuando es 'ninguna'", () => {
    expect(generarTexturaSvg("ninguna")).toBe("");
  });

  it("genera data URL SVG para grano, papel y escarcha", () => {
    const grano = generarTexturaSvg("grano");
    expect(grano).toContain("data:image/svg+xml");
    expect(grano).toContain("fractalNoise");

    const papel = generarTexturaSvg("papel");
    expect(papel).toContain("data:image/svg+xml");

    const escarcha = generarTexturaSvg("escarcha");
    expect(escarcha).toContain("data:image/svg+xml");
  });

  it("genera estilos correctos para modo transparente", () => {
    const config: DifusionConfig = {
      modo: "transparente",
      desenfoquePx: 0,
      opacidad: 1,
      textura: "ninguna",
    };
    const estilos = estiloDifusion(config);
    expect(estilos.backgroundColor).toBe("transparent");
  });

  it("genera estilos correctos para modo blanco con desenfoque y textura", () => {
    const config: DifusionConfig = {
      modo: "blanco",
      desenfoquePx: 12,
      opacidad: 0.8,
      textura: "grano",
    };
    const estilos = estiloDifusion(config);
    expect(estilos.backgroundColor).toContain("rgba(255, 255, 255, 0.8)");
    expect(estilos.backdropFilter).toContain("blur(12px)");
    expect(estilos.backgroundImage).toContain("data:image/svg+xml");
  });

  it("genera estilos correctos para modo tono", () => {
    const config: DifusionConfig = {
      modo: "tono",
      tono: "rgba(124, 58, 237, 0.5)",
      desenfoquePx: 5,
      opacidad: 1,
      textura: "ninguna",
    };
    const estilos = estiloDifusion(config);
    expect(estilos.backgroundColor).toBe("rgba(124, 58, 237, 0.5)");
    expect(estilos.backdropFilter).toContain("blur(5px)");
  });
});
