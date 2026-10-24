// Fuentes de la marca (DSN1019D): Satoshi se pide solo para el papel editorial y
// Quicksand solo para lo orgánico. Aquí se prueba la decisión pura, sin red.
import { describe, expect, it } from "vitest";
import {
  HOJA_QUICKSAND,
  HOJA_SATOSHI,
  VARIABLES_MARCA,
  hojasNecesarias,
  hojasPendientes,
  type HojaFuente,
} from "../fuentes-marca";

const SATOSHI: HojaFuente = { id: "ss-fuente-satoshi", href: HOJA_SATOSHI };
const QUICKSAND: HojaFuente = { id: "ss-fuente-quicksand", href: HOJA_QUICKSAND };

describe("hojasNecesarias", () => {
  it("no descarga fuentes cuando la pieza no usa papel editorial ni orgánico", () => {
    expect(hojasNecesarias({ registro: "nexus", tema: "claro" })).toEqual([]);
    expect(hojasNecesarias({})).toEqual([]);
  });

  it("pide Satoshi por su CSS de Fontshare para el registro editorial", () => {
    expect(hojasNecesarias({ registro: "display editorial" })).toEqual([SATOSHI]);
    expect(hojasNecesarias({ displayEditorial: true })).toEqual([SATOSHI]);
    expect(SATOSHI.href).toBe(
      "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap",
    );
  });

  it("pide Quicksand para el tema Natural y para la pieza orgánica", () => {
    expect(hojasNecesarias({ tema: "Natural" })).toEqual([QUICKSAND]);
    expect(hojasNecesarias({ organica: true })).toEqual([QUICKSAND]);
  });

  it("pide las dos hojas cuando la pieza mezcla lo editorial y lo orgánico", () => {
    expect(hojasNecesarias({ registro: "manifiesto", tema: "natural" })).toEqual([
      SATOSHI,
      QUICKSAND,
    ]);
  });
});

describe("hojasPendientes", () => {
  it("no repite un enlace que ya está en el documento", () => {
    expect(hojasPendientes([SATOSHI, QUICKSAND], ["ss-fuente-satoshi"])).toEqual([QUICKSAND]);
    expect(hojasPendientes([SATOSHI], ["ss-fuente-satoshi"])).toEqual([]);
  });

  it("elimina hojas repetidas aunque el documento esté vacío", () => {
    expect(hojasPendientes([SATOSHI, SATOSHI, QUICKSAND], [])).toEqual([SATOSHI, QUICKSAND]);
  });
});

describe("VARIABLES_MARCA", () => {
  it("publica las tres variables con respaldos de la marca", () => {
    expect(VARIABLES_MARCA["--ss-font-display"]).toContain("'Satoshi'");
    expect(VARIABLES_MARCA["--ss-font-display"]).toContain("'Rajdhani'");
    expect(VARIABLES_MARCA["--ss-font-titular"]).toContain("'Rajdhani'");
    expect(VARIABLES_MARCA["--ss-font-organica"]).toContain("'Quicksand'");
    for (const valor of Object.values(VARIABLES_MARCA)) {
      expect(valor).toContain("'Inter'");
      expect(valor).toContain("sans-serif");
    }
  });
});
