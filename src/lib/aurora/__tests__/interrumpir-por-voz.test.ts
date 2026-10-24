import { describe, it, expect } from "vitest";
import { decidirInterrupcion } from "@/lib/aurora/interrumpir-por-voz";
import { registrarDicho } from "@/lib/aurora/anti-bucle-voz";

describe("decidirInterrupcion", () => {
  it("no interrumpe si no está hablando", () => {
    const res = decidirInterrupcion(
      [{ db: -10, ahora: 1000 }, { db: -10, ahora: 1300 }],
      { hablando: false },
    );
    expect(res.interrumpir).toBe(false);
  });

  it("no interrumpe si duración < 250 ms", () => {
    const res = decidirInterrupcion(
      [{ db: -20, ahora: 1000 }, { db: -15, ahora: 1100 }],
      { hablando: true },
      { umbralDb: -40, minimoMs: 250 },
    );
    expect(res.interrumpir).toBe(false);
  });

  it("interrumpe si supera umbral por >= 250 ms", () => {
    const res = decidirInterrupcion(
      [
        { db: -20, ahora: 1000 },
        { db: -15, ahora: 1200 },
        { db: -10, ahora: 1300 },
      ],
      { hablando: true },
      { umbralDb: -40, minimoMs: 250 },
    );
    expect(res.interrumpir).toBe(true);
  });

  it("respeta ventana eco", () => {
    const res = decidirInterrupcion(
      [
        { db: -20, ahora: 1000 },
        { db: -15, ahora: 1200 },
        { db: -10, ahora: 1300 },
      ],
      { hablando: true, ecoHasta: 2000 },
      { umbralDb: -40, minimoMs: 250 },
    );
    expect(res.interrumpir).toBe(false);
  });

  it("no interrumpe con eco propio", () => {
    const ahora = 10000;
    registrarDicho("hola como estas", ahora - 1000);
    const res = decidirInterrupcion(
      [
        { db: -20, ahora: ahora, texto: "hola como estas" },
        { db: -15, ahora: ahora + 200, texto: "hola como estas" },
        { db: -10, ahora: ahora + 300, texto: "hola como estas" },
      ],
      { hablando: true },
      { umbralDb: -40, minimoMs: 250 },
    );
    expect(res.interrumpir).toBe(false);
  });
});
