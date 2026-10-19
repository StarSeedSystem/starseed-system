import { describe, it, expect } from "vitest";
import { tipoAparato, geometriaVentana, ZonaPulgar, zonaPulgar } from "@/lib/design/composicion";

describe("tipoAparato", () => {
  it("should return xr when xr is true", () => {
    expect(tipoAparato({ ancho: 100, alto: 100, puntero: false, xr: true })).toBe("xr");
  });

  it("should return telefono for width < 430", () => {
    expect(tipoAparato({ ancho: 400, alto: 800, puntero: false, xr: false })).toBe("telefono");
  });

  it("should return tableta for width between 430 and 768", () => {
    expect(tipoAparato({ ancho: 600, alto: 800, puntero: false, xr: false })).toBe("tableta");
  });

  it("should return escritorio for width between 768 and 1280", () => {
    expect(tipoAparato({ ancho: 1000, alto: 800, puntero: false, xr: false })).toBe("escritorio");
  });

  it("should return grande for width >= 1280", () => {
    expect(tipoAparato({ ancho: 1400, alto: 800, puntero: false, xr: false })).toBe("grande");
  });
});

describe("geometriaVentana", () => {
  it("should center a dialogo on large screen", () => {
    const viewport = { ancho: 1920, alto: 1080 };
    const result = geometriaVentana(viewport, { tipo: "dialogo" });
    expect(result.ancho).toBeCloseTo(0.9 * Math.min(1920, 1186)); // 0.9 * 1186 = 1067.4
    expect(result.alto).toBeCloseTo(0.8 * 1080); // 864
    expect(result.x).toBeCloseTo((1920 - result.ancho) / 2);
    expect(result.y).toBeCloseTo((1080 - result.alto) / 2);
    expect(result.origen).toBe("top-left");
  });

  it("should respect minimum margin on telefono", () => {
    const viewport = { ancho: 400, alto: 800 };
    const result = geometriaVentana(viewport, { tipo: "dialogo" });
    // Expect horizontal margin of 16px on each side, so available width = 400 - 32 = 368
    // Width should be 0.9 * 368 = 331.2, but also clamped by maxWidth (which is 368 since 368 < 1186)
    expect(result.ancho).toBeCloseTo(0.9 * (400 - 32));
    // Check that the x is at least 16 (left margin)
    expect(result.x).toBeGreaterThanOrEqual(16);
    // And that x + ancho <= viewport.ancho - 16 (right margin)
    expect(result.x + result.ancho).toBeLessThanOrEqual(400 - 16);
  });

  it("should position hoja at bottom on telefono", () => {
    const viewport = { ancho: 400, alto: 800 };
    const result = geometriaVentana(viewport, { tipo: "hoja" });
    expect(result.y).toBeCloseTo(viewport.alto - result.alto); // top-left y is viewport.height - height
    expect(result.origen).toBe("top-left");
  });

  it("should respect provided ancho and alto", () => {
    const viewport = { ancho: 1920, alto: 1080 };
    const result = geometriaVentana(viewport, { tipo: "dialogo", ancho: 500, alto: 300 });
    expect(result.ancho).toBe(500);
    expect(result.alto).toBe(300);
    expect(result.x).toBeCloseTo((1920 - 500) / 2);
    expect(result.y).toBeCloseTo((1080 - 300) / 2);
  });
});

describe("zonaPulgar", () => {
  it("should return a zone at the bottom of the viewport", () => {
    const viewport = { ancho: 400, alto: 800 };
    const result = zonaPulgar(viewport);
    expect(result.alto).toBe(140);
    expect(result.ancho).toBe(viewport.ancho);
    expect(result.y).toBe(viewport.alto - 140);
    expect(result.x).toBe(0);
  });
});