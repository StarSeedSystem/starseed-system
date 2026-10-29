import { describe, it, expect } from "vitest";
import {
  AJUSTES_POR_DEFECTO,
  MAX_EXTERNOS,
  MAX_PERSONAS,
  TOPE_CREDITOS_MAXIMO,
  gastadoEnMes,
  puedeGastar,
  validarAjustes,
} from "../ajustes-ambito";
import type { AjustesContenidoVivo, AsientoCreditos } from "../ajustes-ambito";
import type { TareaViva } from "../tipos";

const asiento = (t: number | string, creditos: number, tarea: TareaViva = "foto"): AsientoCreditos => ({
  t, ambito: "grupo:huerto", servicio: "higgsfield", modelo: "nano-banana-2",
  creditos, tarea, aprobadoPor: "ana",
});

describe("validarAjustes", () => {
  it("rellena los valores por defecto", () => {
    expect(validarAjustes()).toEqual(AJUSTES_POR_DEFECTO);
    expect(validarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
    expect(validarAjustes({})).toEqual(AJUSTES_POR_DEFECTO);
  });
  it("recorta valores raros sin lanzar", () => {
    const raro = {
      localPrimero: false,
      topeCreditosMes: -20,
      aprobacion: "otra",
      externosPermitidos: [" Spline ", "spline", "", "Higgsfield"],
      personas: [" Ana ", "ana", ""],
    } as unknown as Partial<AjustesContenidoVivo>;
    const limpio = validarAjustes(raro);
    expect(limpio.localPrimero).toBe(false);
    expect(limpio.topeCreditosMes).toBe(0);
    expect(limpio.aprobacion).toBe("yo");
    expect(limpio.externosPermitidos).toEqual(["Spline", "Higgsfield"]);
    expect(limpio.personas).toEqual(["Ana"]);
  });
  it("pone a cero topes no finitos y limita el máximo", () => {
    expect(validarAjustes({ topeCreditosMes: Number.NaN }).topeCreditosMes).toBe(0);
    expect(validarAjustes({ topeCreditosMes: Number.POSITIVE_INFINITY }).topeCreditosMes).toBe(0);
    expect(validarAjustes({ topeCreditosMes: "100" as unknown as number }).topeCreditosMes).toBe(0);
    expect(validarAjustes({ topeCreditosMes: TOPE_CREDITOS_MAXIMO + 5 }).topeCreditosMes).toBe(TOPE_CREDITOS_MAXIMO);
  });
  it("limita las listas y conserva la aprobación por personas", () => {
    const muchos = Array.from({ length: MAX_EXTERNOS + 5 }, (_, i) => `servicio-${i}`);
    const personas = Array.from({ length: MAX_PERSONAS + 5 }, (_, i) => `persona-${i}`);
    const limpio = validarAjustes({ aprobacion: "personas", externosPermitidos: muchos, personas });
    expect(limpio.externosPermitidos).toHaveLength(MAX_EXTERNOS);
    expect(limpio.personas).toHaveLength(MAX_PERSONAS);
    expect(validarAjustes({ aprobacion: "personas" }).personas).toEqual([]);
  });
});

describe("gastadoEnMes", () => {
  const octubre = Date.UTC(2026, 9, 15, 12);
  it("suma solo el mes natural de «ahora»", () => {
    expect(gastadoEnMes([], octubre)).toBe(0);
    const asientos = [
      asiento(Date.UTC(2026, 9, 1), 2),
      asiento(Date.UTC(2026, 9, 31, 23, 59), 30),
      asiento(Date.UTC(2026, 8, 30, 23, 59), 60),
      asiento(Date.UTC(2026, 10, 1), 60),
      asiento(Date.UTC(2025, 9, 15), 60),
    ];
    expect(gastadoEnMes(asientos, octubre)).toBe(32);
    expect(gastadoEnMes(asientos, new Date(octubre))).toBe(32);
  });
  it("acepta ISO y descarta fechas o créditos ilegibles", () => {
    const asientos = [
      asiento("2026-10-10T10:00:00.000Z", 8),
      asiento("no es una fecha", 60),
      asiento(Date.UTC(2026, 9, 11), Number.NaN),
      asiento(Date.UTC(2026, 9, 12), -5),
    ];
    expect(gastadoEnMes(asientos, "2026-10-20T00:00:00.000Z")).toBe(8);
    expect(gastadoEnMes(asientos, "no es una fecha")).toBe(0);
  });
});

describe("puedeGastar", () => {
  const conTope = (extra: Partial<AjustesContenidoVivo> = {}): AjustesContenidoVivo =>
    validarAjustes({ topeCreditosMes: 100, ...extra });
  it("no gasta sin tope ni sin cotización válida", () => {
    expect(puedeGastar(validarAjustes(), 0, 10, "ana").si).toBe(false);
    expect(puedeGastar(validarAjustes(), 0, 10, "ana").motivo).toContain("tope");
    for (const cotizacion of [0, -5, Number.NaN]) {
      const decision = puedeGastar(conTope(), 0, cotizacion, "ana");
      expect(decision.si).toBe(false);
      expect(decision.motivo).toContain("cotización");
    }
  });
  it("en «democratica» pide una propuesta aprobada", () => {
    const decision = puedeGastar(conTope({ aprobacion: "democratica" }), 0, 10, "ana");
    expect(decision.si).toBe(false);
    expect(decision.motivo).toContain("propuesta democrática");
  });
  it("respeta el tope del mes y aprueba «yo»", () => {
    expect(puedeGastar(conTope(), 90, 10, "ana").si).toBe(true);
    expect(puedeGastar(conTope(), 95, 10, "ana").si).toBe(false);
    expect(puedeGastar(conTope(), 95, 10, "ana").motivo).toContain("supera");
    expect(puedeGastar(conTope(), Number.NaN, 10, "ana").si).toBe(true);
    expect(puedeGastar(conTope(), 0, 10, "  ").si).toBe(false);
  });
  it("en «personas» solo aprueba quien está en la lista", () => {
    const ajustes = conTope({ aprobacion: "personas", personas: ["Ana", "Luis"] });
    expect(puedeGastar(ajustes, 0, 10, "ana").si).toBe(true);
    expect(puedeGastar(ajustes, 0, 10, "eva").si).toBe(false);
    expect(puedeGastar(ajustes, 0, 10, "eva").motivo).toContain("Ana, Luis");
    const vacia = conTope({ aprobacion: "personas" });
    expect(puedeGastar(vacia, 0, 10, "ana").motivo).toContain("No hay personas");
  });
});
