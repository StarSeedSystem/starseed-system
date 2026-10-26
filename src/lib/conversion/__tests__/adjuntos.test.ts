// Tests puros de `src/lib/conversion/adjuntos.ts` (sin red, sin disco).
import { describe, expect, it } from "vitest";

import { primerAdjuntoConvertible } from "../adjuntos";

describe("primerAdjuntoConvertible", () => {
  it("sin adjuntos (nulo, vacío o basura) no hay nada que convertir", () => {
    expect(primerAdjuntoConvertible(null)).toBeNull();
    expect(primerAdjuntoConvertible(undefined)).toBeNull();
    expect(primerAdjuntoConvertible([])).toBeNull();
    expect(primerAdjuntoConvertible(["hola", 5, null] as unknown[])).toBeNull();
  });

  it("toma el primer adjunto con URL real y su nombre y tipo", () => {
    const r = primerAdjuntoConvertible([
      { name: "foto del viaje" },
      { name: "informe.pdf", url: "https://x/os-files/informe.pdf", mime: "application/pdf", size: 400 },
    ]);
    expect(r).toEqual({
      nombre: "informe.pdf",
      url: "https://x/os-files/informe.pdf",
      tipoMime: "application/pdf",
    });
  });

  it("acepta data URL (adjunto en línea) y refiere el mimetype sin extensiones raras", () => {
    const r = primerAdjuntoConvertible([{ name: "notas", dataUrl: "data:text/markdown;base64,IyBub3Rh", mime: "text/markdown" }]);
    expect(r).toEqual({ nombre: "notas", url: "data:text/markdown;base64,IyBub3Rh", tipoMime: "text/markdown" });
  });

  it("un adjunto sin nombre sale como «Adjunto» (lo pone el normalizador compartido)", () => {
    const r = primerAdjuntoConvertible([{ url: "https://x/a.pdf" }]);
    expect(r).toEqual({ nombre: "Adjunto", url: "https://x/a.pdf", tipoMime: undefined });
  });
});
