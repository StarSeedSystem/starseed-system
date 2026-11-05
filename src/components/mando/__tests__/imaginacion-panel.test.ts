/**
 * Pruebas de la línea del medidor de Imaginación: pinta el `filtro_astraura` persistido
 * (familia repetida, tipo de archivo y tope) sin recalcularlo ni inventar cifras.
 */
import { describe, expect, it } from "vitest";

import { hoyAstraura, lineaFiltroAstraura } from "@/components/mando/imaginacion-panel";
import type { FiltroAstraura } from "@/lib/mando/imaginacion-tipos";

const HOY = "2026-11-04";

const filtro = (o: Partial<FiltroAstraura> = {}): FiltroAstraura => ({
  fecha: HOY,
  tope_dia: 3,
  ventana_dias: 7,
  vistas: 690,
  entran: 8,
  filtradas: { "familia repetida": 303, "tipo de archivo": 320, tope: 59 },
  autorizacion_inventada: 1,
  ...o,
});

describe("lineaFiltroAstraura", () => {
  it("pinta el total filtrado y el porqué de cada filtro con el formato del medidor", () => {
    expect(lineaFiltroAstraura(filtro(), HOY)).toBe(
      "Filtradas de Astraura hoy: 682 (familia 303 · tipo 320 · tope 59)",
    );
  });

  it("no usa `entran` como total: N es la suma de los tres motivos", () => {
    const f = filtro({ entran: 999, filtradas: { "familia repetida": 5, "tipo de archivo": 4, tope: 1 } });
    expect(lineaFiltroAstraura(f, HOY)).toBe(
      "Filtradas de Astraura hoy: 10 (familia 5 · tipo 4 · tope 1)",
    );
  });

  it("una cuenta de otro día no se presenta como «hoy»", () => {
    expect(lineaFiltroAstraura(filtro({ fecha: "2026-11-03" }), HOY)).toBeNull();
  });

  it("sin filtro guardado no se pinta nada", () => {
    expect(lineaFiltroAstraura(null, HOY)).toBeNull();
    expect(lineaFiltroAstraura(undefined, HOY)).toBeNull();
  });

  it("un JSON roto o negativo se cuenta como 0, nunca NaN ni cifras negativas", () => {
    const roto = filtro({
      filtradas: { "familia repetida": -5, "tipo de archivo": Number.NaN, tope: 2 },
    });
    expect(lineaFiltroAstraura(roto, HOY)).toBe(
      "Filtradas de Astraura hoy: 2 (familia 0 · tipo 0 · tope 2)",
    );
    const sinFiltradas = { ...filtro(), filtradas: undefined } as unknown as FiltroAstraura;
    expect(lineaFiltroAstraura(sinFiltradas, HOY)).toBe(
      "Filtradas de Astraura hoy: 0 (familia 0 · tipo 0 · tope 0)",
    );
  });
});

describe("hoyAstraura", () => {
  it("usa la fecha local en ISO corto", () => {
    expect(hoyAstraura(new Date(2026, 10, 4, 23, 30))).toBe("2026-11-04");
    expect(hoyAstraura(new Date(2026, 0, 9, 0, 5))).toBe("2026-01-09");
  });
});
