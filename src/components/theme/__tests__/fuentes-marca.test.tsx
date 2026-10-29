// Pruebas de `fuentes-marca.tsx` (Ola 1019D · DSN1019D)
import { describe, expect, it } from "vitest";
import {
  HOJA_QUICKSAND,
  HOJA_SATOSHI,
  VARIABLES_MARCA,
  hojasPendientes,
  normalizarPapel,
  usaDisplayEditorial,
  variablesDeMarca,
} from "@/components/theme/fuentes-marca";

describe("hojasPendientes", () => {
  it("pide la hoja de Satoshi por su CSS de Fontshare para el display editorial", () => {
    const pedidas = hojasPendientes({ displayEditorial: true });
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]).toEqual({ id: "satoshi", href: HOJA_SATOSHI });
    expect(pedidas[0].href).toContain("api.fontshare.com");
  });

  it("pide Quicksand de Google Fonts para el tema Natural", () => {
    const pedidas = hojasPendientes({ temaNatural: true });
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]).toEqual({ id: "quicksand", href: HOJA_QUICKSAND });
    expect(pedidas[0].href).toContain("fonts.googleapis.com");
  });

  it("no duplica enlaces que ya están en el documento", () => {
    const pedidas = hojasPendientes({
      displayEditorial: true,
      temaNatural: true,
      yaCargadas: ["satoshi", "quicksand"],
    });
    expect(pedidas).toEqual([]);
  });

  it("solo carga la hoja que falta cuando una ya está puesta", () => {
    const pedidas = hojasPendientes({
      displayEditorial: true,
      temaNatural: true,
      yaCargadas: ["satoshi"],
    });
    expect(pedidas.map((hoja) => hoja.id)).toEqual(["quicksand"]);
  });

  it("no pide ninguna hoja si la pieza no usa esos papeles", () => {
    expect(hojasPendientes({})).toEqual([]);
  });
});

describe("usaDisplayEditorial", () => {
  it("reconoce el papel por el registro o por la pieza, sin importar mayúsculas ni acentos", () => {
    expect(usaDisplayEditorial("Manifiesto")).toBe(true);
    expect(usaDisplayEditorial(undefined, "PORTADA")).toBe(true);
    expect(usaDisplayEditorial("presentación")).toBe(true);
  });

  it("no lo pide para registros técnicos o de cuerpo", () => {
    expect(usaDisplayEditorial("genesis", "cuerpo")).toBe(false);
    expect(usaDisplayEditorial(undefined, undefined)).toBe(false);
  });

  it("normaliza el nombre del papel", () => {
    expect(normalizarPapel("  Título-Vídeo ")).toBe("titulo-video");
  });
});

describe("variablesDeMarca", () => {
  it("expone las tres variables de la marca", () => {
    const variables = variablesDeMarca();
    expect(Object.keys(variables).sort()).toEqual(
      ["--ss-font-display", "--ss-font-organica", "--ss-font-titular"].sort(),
    );
  });

  it("siempre deja respaldo si la hoja no está disponible", () => {
    expect(VARIABLES_MARCA["--ss-font-display"]).toContain("'Satoshi'");
    expect(VARIABLES_MARCA["--ss-font-display"]).toContain("'Rajdhani'");
    expect(VARIABLES_MARCA["--ss-font-titular"]).toContain("'Rajdhani'");
    expect(VARIABLES_MARCA["--ss-font-organica"]).toContain("'Quicksand'");
    for (const valor of Object.values(VARIABLES_MARCA)) {
      expect(valor.split(",").length).toBeGreaterThanOrEqual(3);
    }
  });
});
