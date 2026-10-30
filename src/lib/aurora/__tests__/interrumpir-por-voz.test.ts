import { describe, it, expect } from "vitest";
import {
  decidirInterrupcion,
  type EstadoInterrupcion,
  type MuestraVoz,
} from "../interrumpir-por-voz";

describe("decidirInterrupcion", () => {
  const opciones = { umbralDb: 0.25, minimoMs: 250 };

  it("no interrumpe si Astraura no habla", () => {
    const estado: EstadoInterrupcion = { hablando: false };
    const muestras: MuestraVoz[] = [{ energia: 0.9, ms: 1000 }];
    expect(decidirInterrupcion(muestras, estado, opciones)).toBe(false);
  });

  it("interrumpe cuando la energía supera el umbral durante minimoMs", () => {
    const estado: EstadoInterrupcion = { hablando: true, inicioHablaMs: 0 };
    const muestras: MuestraVoz[] = [
      { energia: 0.1, ms: 0 },
      { energia: 0.3, ms: 100 },
      { energia: 0.35, ms: 300 },
      { energia: 0.4, ms: 400 },
    ];
    expect(decidirInterrupcion(muestras, estado, opciones)).toBe(true);
  });

  it("no interrumpe si baja antes de completar minimoMs", () => {
    const estado: EstadoInterrupcion = { hablando: true };
    const muestras: MuestraVoz[] = [
      { energia: 0.3, ms: 0 },
      { energia: 0.1, ms: 120 },
    ];
    expect(decidirInterrupcion(muestras, estado, opciones)).toBe(false);
  });

  it("no interrumpe cuando es eco propio", () => {
    const estado: EstadoInterrupcion = { hablando: true, esEco: true };
    const muestras: MuestraVoz[] = [{ energia: 0.9, ms: 500 }];
    expect(decidirInterrupcion(muestras, estado, opciones)).toBe(false);
  });

  it("respeta la ventana de eco tras callar", () => {
    const estado: EstadoInterrupcion = {
      hablando: true,
      ultimoCalladoMs: 0,
      esEco: false,
    };
    // Dentro de la ventana de eco: la energía es alta pero es propio eco.
    const muestras: MuestraVoz[] = [
      { energia: 0.9, ms: 400 },
      { energia: 0.9, ms: 700 },
      { energia: 0.9, ms: 1000 },
    ];
    // Como ultimoCalladoMs es 0, 700 - 0 = 700 < ventana (~1200-2200),
    // se trata como eco y no interrumpe.
    expect(decidirInterrupcion(muestras, estado, opciones)).toBe(false);
  });

  it("interrumpe si la ventana de eco ya pasó", () => {
    const estado: EstadoInterrupcion = {
      hablando: true,
      ultimoCalladoMs: 0,
      esEco: false,
    };
    // Pasada la ventana (ms grande): ya no es eco.
    const muestras: MuestraVoz[] = [
      { energia: 0.9, ms: 5000 },
      { energia: 0.9, ms: 5250 },
      { energia: 0.9, ms: 5500 },
    ];
    expect(decidirInterrupcion(muestras, estado, opciones)).toBe(true);
  });
});
