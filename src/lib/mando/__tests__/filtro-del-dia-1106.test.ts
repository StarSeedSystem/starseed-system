// @vitest-environment node
/** 1106 · AST1106G: la línea del medidor de Imaginación sale del resumen real del director (`filtro_astraura`). */
import { describe, expect, it } from "vitest";
import { etiquetaFiltroDelDia, type FiltroAstraura } from "@/lib/mando/imaginacion-tipos";

const f: FiltroAstraura = {
  fecha: "2026-11-06", tope_dia: 3, ventana_dias: 7, vistas: 15, entran: 0,
  filtradas: { "familia repetida": 5, "tipo de archivo": 10, tope: 0, credenciales: 2 }, autorizacion_inventada: 1,
};

describe("etiquetaFiltroDelDia (1106 · AST1106G)", () => {
  it("cuenta lo que contó el director, con credenciales primero", () => {
    expect(etiquetaFiltroDelDia(f, "2026-11-06")).toBe(
      "Astraura hoy: 15 vistas, 0 entran · filtradas: credenciales 2 · tipo de archivo 10 · familia repetida 5 · tope 0 · 1 con autorización inventada");
  });
  it("un resumen de otro día dice de qué día es; uno antiguo sin credenciales cuenta 0", () => {
    const viejo: FiltroAstraura = { ...f, fecha: "2026-11-05", autorizacion_inventada: 0, filtradas: { "familia repetida": 1, "tipo de archivo": 2, tope: 3 } };
    expect(etiquetaFiltroDelDia(viejo, "2026-11-06")).toBe(
      "Astraura el 2026-11-05: 15 vistas, 0 entran · filtradas: credenciales 0 · tipo de archivo 2 · familia repetida 1 · tope 3");
  });
  it("sin resumen no hay línea", () => {
    expect(etiquetaFiltroDelDia(undefined, "2026-11-06")).toBeNull();
    expect(etiquetaFiltroDelDia(null, "2026-11-06")).toBeNull();
  });
});
