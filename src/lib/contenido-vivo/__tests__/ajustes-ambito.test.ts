import { describe, expect, it } from "vitest";
import type { AsientoCreditos } from "../ajustes-ambito";
import { gastadoEnMes, puedeGastar, validarAjustes } from "../ajustes-ambito";

describe("validarAjustes", () => {
  it("vueltas por defecto: local primero, sin externos, sin tope, «yo»", () => {
    expect(validarAjustes({})).toEqual({
      localPrimero: true, externosPermitidos: [], topeCreditosMes: 0, aprobacion: "yo",
    });
    expect(validarAjustes(null)).toEqual(validarAjustes({}));
  });

  it("recorta valores raros sin lanzar", () => {
    const r = validarAjustes({
      localPrimero: "sí", externosPermitidos: "spline-mcp", topeCreditosMes: -5, aprobacion: "acuerdo",
    });
    expect(r.localPrimero).toBe(true);
    expect(r.externosPermitidos).toEqual([]);
    expect(r.topeCreditosMes).toBe(0);
    expect(r.aprobacion).toBe("yo");

    expect(validarAjustes({ topeCreditosMes: Number.NaN }).topeCreditosMes).toBe(0);
    expect(validarAjustes({ topeCreditosMes: 12.9 }).topeCreditosMes).toBe(12);
    expect(validarAjustes({ localPrimero: false }).localPrimero).toBe(false);
  });

  it("conserva lo válido y quita duplicados y vacíos", () => {
    const r = validarAjustes({
      externosPermitidos: ["spline-mcp", "spline-mcp", "", 42],
      topeCreditosMes: 30,
      aprobacion: "personas",
      personas: ["ana", "ana", "alex"],
    });
    expect(r.externosPermitidos).toEqual(["spline-mcp"]);
    expect(r.aprobacion).toBe("personas");
    expect(r.personas).toEqual(["ana", "alex"]);
  });

  it("sin modo «personas» no guarda la lista", () => {
    const r = validarAjustes({ aprobacion: "yo", personas: ["ana"] });
    expect(r.personas).toBeUndefined();
  });
});

const asiento = (t: number, creditos: number): AsientoCreditos => ({
  t, ambito: "cuenta", servicio: "higgsfield", modelo: "nano-banana-2", creditos, tarea: "foto", aprobadoPor: "alex",
});

describe("gastadoEnMes", () => {
  const ahora = new Date(2026, 9, 20).getTime();

  it("suma solo el mes en curso", () => {
    const libro = [asiento(ahora, 2), asiento(ahora - 24 * 36e5, 30), asiento(new Date(2026, 8, 10).getTime(), 60)];
    expect(gastadoEnMes(libro, ahora)).toBe(32);
  });

  it("ignora créditos raros y entradas rotas", () => {
    const libro = [asiento(ahora, -1), asiento(ahora, Number.NaN), {} as AsientoCreditos];
    expect(gastadoEnMes(libro, ahora)).toBe(0);
    expect(gastadoEnMes([], ahora)).toBe(0);
    expect(gastadoEnMes([asiento(ahora, 2)], Number.NaN)).toBe(0);
  });
});

describe("puedeGastar", () => {
  const ajustes = { localPrimero: true, externosPermitidos: [], topeCreditosMes: 60, aprobacion: "yo" as const };

  it("sin tope (0) no se gasta", () => {
    const r = puedeGastar({ ...ajustes, topeCreditosMes: 0 }, 0, 2, "alex");
    expect(r.si).toBe(false);
    expect(r.motivo).toContain("tope");
  });

  it("cotización ausente o rara no gasta", () => {
    expect(puedeGastar(ajustes, 0, 0, "alex").si).toBe(false);
    expect(puedeGastar(ajustes, 0, Number.NaN, "alex").si).toBe(false);
    expect(puedeGastar(ajustes, 0, Number.NaN, "alex").motivo).toContain("cotización");
  });

  it("pasarse del tope no gasta y dice lo que queda", () => {
    const r = puedeGastar(ajustes, 40, 30, "alex");
    expect(r.si).toBe(false);
    expect(r.motivo).toContain("60");
    expect(puedeGastar(ajustes, 40, 20, "alex").si).toBe(true);
  });

  it("«democratica» pide propuesta, no gasta", () => {
    const r = puedeGastar({ ...ajustes, aprobacion: "democratica" }, 0, 2, "alex");
    expect(r.si).toBe(false);
    expect(r.motivo).toContain("propuesta");
  });

  it("«personas»: solo quien está en la lista", () => {
    const j = { ...ajustes, aprobacion: "personas" as const, personas: ["ana"] };
    expect(puedeGastar(j, 0, 2, "ana")).toEqual({
      si: true,
      motivo: "Permite directo vigente: el gasto se anota con tu nombre en el libro.",
    });
    const r = puedeGastar(j, 0, 2, "alex");
    expect(r.si).toBe(false);
    expect(r.motivo).toContain("alex");
  });

  it("«personas» sin lista no deja pasar a nadie", () => {
    const j = { ...ajustes, aprobacion: "personas" as const, personas: undefined };
    expect(puedeGastar(j, 0, 2, "alex").si).toBe(false);
  });

  it("«yo» aprueba con motivo claro", () => {
    const r = puedeGastar(ajustes, 0, 60, "alex");
    expect(r.si).toBe(true);
    expect(r.motivo).toContain("libro");
  });
});
