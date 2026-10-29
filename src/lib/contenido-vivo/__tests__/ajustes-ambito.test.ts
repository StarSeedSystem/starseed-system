import { describe, it, expect } from "vitest";
import { validarAjustes, gastadoEnMes, puedeGastar } from "../ajustes-ambito";
import type { AsientoCreditos } from "../ajustes-ambito";

const asiento = (t: string, creditos: number): AsientoCreditos => ({
  t, ambito: "cuenta:prueba", servicio: "spline-mcp", modelo: "Spline Pro",
  creditos, tarea: "escena-3d", aprobadoPor: "uno",
});

describe("validarAjustes", () => {
  it("da los valores por defecto con nada de entrada", () => {
    const esperado = { localPrimero: true, externosPermitidos: [], topeCreditosMes: 0, aprobacion: "yo" };
    for (const entrada of [undefined, null, "ruido" as unknown as object]) {
      expect(validarAjustes(entrada)).toEqual(esperado);
    }
  });

  it("rellena lo que falta y recuerda lo que alguien apagó", () => {
    expect(validarAjustes({ localPrimero: false }).localPrimero).toBe(false);
    const encendido = validarAjustes({ externosPermitidos: ["spline-mcp"] });
    expect(encendido.localPrimero).toBe(true);
    expect(encendido.externosPermitidos).toEqual(["spline-mcp"]);
  });

  it("recorta valores raros sin lanzar", () => {
    const bruto = {
      topeCreditosMes: Number.NaN, aprobacion: "dictadura", localPrimero: "no",
      externosPermitidos: ["spline-mcp", "", "spline-mcp", 7], personas: ["uno", null, "dos", " uno "],
    } as unknown as Parameters<typeof validarAjustes>[0];
    const ajustes = validarAjustes(bruto);
    expect(ajustes.topeCreditosMes).toBe(0);
    expect(ajustes.aprobacion).toBe("yo");
    expect(ajustes.externosPermitidos).toEqual(["spline-mcp"]);
    expect(ajustes.personas).toEqual(["uno", "dos"]);
  });

  it("recorta topes raros y respeta un modo válido", () => {
    expect(validarAjustes({ topeCreditosMes: -5 }).topeCreditosMes).toBe(0);
    expect(validarAjustes({ topeCreditosMes: 60 }).topeCreditosMes).toBe(60);
    const democratica = validarAjustes({ aprobacion: "democratica", personas: [] });
    expect(democratica.aprobacion).toBe("democratica");
    expect(democratica.personas).toEqual([]);
  });
});

describe("gastadoEnMes", () => {
  it("suma solo los asientos del mes calendario del momento dado", () => {
    const asientos = [asiento("2026-10-03T10:00:00Z", 8), asiento("2026-10-20T10:00:00Z", 2)];
    expect(gastadoEnMes(asientos, "2026-10-25T12:00:00Z")).toBe(10);
  });

  it("deja fuera otros meses, fechas rotas y créditos raros, y responde 0 ante un momento roto", () => {
    const asientos = [
      asiento("2026-09-15T10:00:00Z", 30), asiento("2026-11-01T00:00:00Z", 12), asiento("fecha-rota", 100),
      asiento("2026-10-10T10:00:00Z", Number.NaN), asiento("2026-10-12T10:00:00Z", -4), asiento("2026-10-14T10:00:00Z", 0),
    ];
    expect(gastadoEnMes(asientos, "2026-10-25T12:00:00Z")).toBe(0);
    expect(gastadoEnMes([], "2026-10-25T12:00:00Z")).toBe(0);
    expect(gastadoEnMes([asiento("2026-10-03T10:00:00Z", 8)], "")).toBe(0);
  });
});

describe("puedeGastar", () => {
  const llenos = validarAjustes({ topeCreditosMes: 60 });

  it("aprueba un gasto dentro del tope en modo yo", () => {
    expect(puedeGastar(llenos, 30, 30, "uno").si).toBe(true);
  });

  it("no gasta sin cotización ni con cotización negativa", () => {
    for (const coste of [0, -2]) {
      const veredicto = puedeGastar(llenos, 0, coste, "uno");
      expect(veredicto.si).toBe(false);
      expect(veredicto.motivo).toContain("cotización");
    }
  });

  it("los ajustes por defecto no gastan: el tope 0 significa nada de créditos", () => {
    const veredicto = puedeGastar(validarAjustes(null), 0, 30, "uno");
    expect(veredicto.si).toBe(false);
    expect(veredicto.motivo).toContain("tope");
  });

  it("frena cuando la cotización pasa el tope del mes y deja pasar la que cabe", () => {
    const veredicto = puedeGastar(llenos, 40, 30, "uno");
    expect(veredicto.si).toBe(false);
    expect(veredicto.motivo).toContain("tope del mes");
    expect(puedeGastar(llenos, 30, 30, "uno").si).toBe(true);
  });

  it("declara inválido un tope raro y así no gasta", () => {
    expect(validarAjustes({ topeCreditosMes: Number.POSITIVE_INFINITY }).topeCreditosMes).toBe(0);
    expect(puedeGastar(validarAjustes({ topeCreditosMes: Number.POSITIVE_INFINITY }), 0, 30, "uno").si).toBe(false);
  });

  it("en democrática devuelve que hace falta una propuesta en la Protomolécula", () => {
    const veredicto = puedeGastar(validarAjustes({ topeCreditosMes: 60, aprobacion: "democratica" }), 0, 30, "uno");
    expect(veredicto.si).toBe(false);
    expect(veredicto.motivo).toContain("propuesta");
    expect(veredicto.motivo).toContain("Protomolécula");
  });

  it("en personas exige una lista con a quien pide", () => {
    const base = { topeCreditosMes: 60, aprobacion: "personas" as const };
    const sinLista = puedeGastar(validarAjustes(base), 0, 30, "uno");
    expect(sinLista.si).toBe(false);
    expect(sinLista.motivo).toContain("personas");
    const propias = validarAjustes({ ...base, personas: ["dos"] });
    expect(puedeGastar(propias, 0, 30, "uno").si).toBe(false);
    expect(puedeGastar(propias, 30, 30, "dos").si).toBe(true);
  });

  it("aguanta contabilidad rara sin lanzar", () => {
    expect(puedeGastar(llenos, Number.NaN, 30, "uno").si).toBe(true);
    expect(puedeGastar(llenos, Number.NaN, Number.NaN, "uno").si).toBe(false);
  });
});
