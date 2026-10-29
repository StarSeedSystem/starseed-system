import { describe, it, expect } from "vitest";
import {
  gastadoEnMes,
  puedeGastar,
  validarAjustes,
  type AsientoCreditos,
} from "../ajustes-ambito";
import { compararRutas, elegirRuta, type ContextoVivo } from "../rutas";

const MARZO = Date.UTC(2026, 2, 15, 12, 0, 0);

const ajustes = (extra: Record<string, unknown> = {}) => validarAjustes({ topeCreditosMes: 100, ...extra });

const asiento = (t: number, creditos: number): AsientoCreditos => ({
  t, ambito: "grupo-1", servicio: "higgsfield", modelo: "seedance",
  creditos, tarea: "clip-pelicula", aprobadoPor: "alex",
});

describe("validarAjustes", () => {
  it("rellena los valores por defecto", () => {
    expect(validarAjustes(undefined)).toEqual({
      localPrimero: true,
      externosPermitidos: [],
      topeCreditosMes: 0,
      aprobacion: "yo",
    });
    expect(validarAjustes("basura")).toEqual(validarAjustes(null));
  });

  it("conserva el no local primero y sanea listas, textos y números", () => {
    expect(
      validarAjustes({
        localPrimero: false,
        externosPermitidos: [" Spline ", "Spline", "", 7, "Higgsfield"],
        topeCreditosMes: 12.9,
        aprobacion: "personas",
        personas: [" Alex ", " Alex ", "", 7],
      }),
    ).toEqual({
      localPrimero: false,
      externosPermitidos: ["Spline", "Higgsfield"],
      topeCreditosMes: 12,
      aprobacion: "personas",
      personas: ["Alex"],
    });
  });

  it("recorta topes raros y una aprobación desconocida", () => {
    expect(validarAjustes({ topeCreditosMes: -4, aprobacion: "cualquiera" }).topeCreditosMes).toBe(0);
    expect(validarAjustes({ topeCreditosMes: "40" }).topeCreditosMes).toBe(40);
    expect(validarAjustes({ topeCreditosMes: 1e12 }).topeCreditosMes).toBe(10_000_000);
    expect(validarAjustes({ aprobacion: "cualquiera" }).aprobacion).toBe("yo");
    expect(validarAjustes({ personas: [] }).personas).toBeUndefined();
  });
});

describe("gastadoEnMes", () => {
  it("suma solo el mes de ahora en UTC", () => {
    const asientos = [
      asiento(MARZO, 10),
      asiento(Date.UTC(2026, 2, 1), 5),
      asiento(Date.UTC(2026, 3, 1), 100),
      asiento(Date.UTC(2025, 2, 31), 7),
    ];
    expect(gastadoEnMes(asientos, MARZO)).toBe(15);
    expect(gastadoEnMes(asientos, new Date(MARZO))).toBe(15);
  });

  it("ignora asientos rotos y un ahora inválido", () => {
    const roto = { ...asiento(MARZO, 9), creditos: Number.NaN }, sinFecha = { ...asiento(Number.NaN, 4) };
    expect(gastadoEnMes([], MARZO)).toBe(0);
    expect(gastadoEnMes([asiento(MARZO, 5), roto, sinFecha], MARZO)).toBe(5);
    expect(gastadoEnMes([asiento(MARZO, 5)], Number.NaN)).toBe(0);
  });
});

describe("puedeGastar", () => {
  it("no gasta si el ámbito no tiene tope", () => {
    const d = puedeGastar(validarAjustes({}), 0, 5, "alex");
    expect(d.si).toBe(false);
    expect(d.motivo).toContain("tope");
  });

  it("permite una cotización de cero créditos sin tope", () => {
    expect(puedeGastar(validarAjustes({}), 0, 0, "alex")).toEqual({
      si: true,
      motivo: "La cotización no gasta créditos.",
    });
  });

  it("rechaza cotizaciones inválidas", () => {
    expect(puedeGastar(ajustes(), 0, -1, "alex").si).toBe(false);
    expect(puedeGastar(ajustes(), 0, Number.NaN, "alex").si).toBe(false);
  });

  it("respeta lo que queda del tope mensual", () => {
    expect(puedeGastar(ajustes(), 90, 10, "alex").si).toBe(true);
    const d = puedeGastar(ajustes(), 90, 11, "alex");
    expect(d.si).toBe(false);
    expect(d.motivo).toContain("tope mensual");
    expect(puedeGastar(ajustes(), 100, 1, "alex").si).toBe(false);
  });

  it("en modo democrático exige una propuesta", () => {
    const d = puedeGastar(ajustes({ aprobacion: "democratica" }), 0, 5, "alex");
    expect(d.si).toBe(false);
    expect(d.motivo).toContain("propuesta");
  });

  it("en modo personas solo aprueban las autorizadas", () => {
    const a = ajustes({ aprobacion: "personas", personas: ["alex"] });
    expect(puedeGastar(a, 0, 5, "alex").si).toBe(true);
    expect(puedeGastar(a, 0, 5, "ana").si).toBe(false);
    expect(puedeGastar(ajustes({ aprobacion: "personas" }), 0, 5, "alex").si).toBe(false);
  });

  it("en modo yo hace falta saber quién aprueba", () => {
    expect(puedeGastar(ajustes(), 0, 5, "").si).toBe(false);
    expect(puedeGastar(ajustes(), 0, 5, "alex").si).toBe(true);
  });
});

describe("elegir ruta con el libro de créditos", () => {
  const contexto = (asientos: AsientoCreditos[]): ContextoVivo => ({
    alcance: "publica",
    conectados: ["higgsfield"],
    cupoHoy: { higgsfield: 100 },
    creditosDisponibles: 6000,
    topeMes: 100,
    gastadoMes: 0,
    neurona: { gpu: true, capaz3d: true },
    ajustes: { localPrimero: false, externosPermitidos: true },
    libro: { asientos, ahora: MARZO, quien: "alex" },
  });

  it("cierra la ruta externa con el motivo del tope del mes", () => {
    const externa = compararRutas("foto", contexto([asiento(MARZO, 99)]))
      .find((candidata) => candidata.ruta.id === "higgsfield-nano-banana-2");
    expect(externa?.disponible).toBe(false);
    expect(externa?.motivoNoDisponible).toContain("tope mensual");
  });

  it("con el libro vacío elige la externa dentro del tope", () => {
    expect(elegirRuta("foto", contexto([]))?.ruta.id).toBe("higgsfield-nano-banana-2");
  });
});
