import { describe, it, expect } from "vitest";
import {
  resumirExperiencias,
  calibracion,
  estadoAdaptador,
  capasActivas,
} from "../conciencia";

describe("conciencia (módulo puro)", () => {
  it("resumirExperiencias calcula totales y desglose con fixtures", () => {
    const jsonLines = [
      JSON.stringify({
        id: "exp1",
        t: "2026-09-20 10:00:00",
        capa: "jev",
        tipo: "intencion",
        confianza: 0.85,
        resultado: true,
      }),
      JSON.stringify({
        id: "exp2",
        t: "2026-09-20 10:05:00",
        capa: "needle",
        tipo: "eleccion",
        confianza: 0.9,
        resultado: null,
      }),
      JSON.stringify({
        id: "exp3",
        t: "2026-09-20 10:10:00",
        capa: "jev",
        tipo: "si_no",
        confianza: 0.4,
        resultado: false,
      }),
      JSON.stringify({
        ref: "exp2",
        resultado: true,
        nota: "verificado manualmente",
      }),
    ];

    const res = resumirExperiencias(jsonLines);
    expect(res.total).toBe(3);
    expect(res.porCapa).toEqual({ jev: 2, needle: 1 });
    expect(res.porTipo).toEqual({ intencion: 1, eleccion: 1, si_no: 1 });
    expect(res.conResultado).toBe(3);
    expect(res.aciertos).toBe(2);
  });

  it("calibracion agrupa por décimas de confianza para la capa deseada", () => {
    const exps = [
      { id: "1", capa: "jev", confianza: 0.82, resultado: true },
      { id: "2", capa: "jev", confianza: 0.88, resultado: false },
      { id: "3", capa: "jev", confianza: 0.95, resultado: true },
      { id: "4", capa: "needle", confianza: 0.85, resultado: true },
      { id: "5", capa: "jev", confianza: 0.81, resultado: true },
    ];

    const cal = calibracion(exps, "jev");
    expect(cal["0.8"]).toEqual({ n: 3, aciertos: 2 });
    expect(cal["0.9"]).toEqual({ n: 1, aciertos: 1 });
    expect(cal["0.4"]).toBeUndefined();
  });

  it("estadoAdaptador extrae métricas del manifiesto y estadoNeedle", () => {
    const manifiesto = {
      version: "1.58.2",
      sha: "a1b2c3d4e5",
      fecha: "2026-09-20",
      experiencias: 1420,
      exactitud: 94.8,
      es_mas_nuevo: true,
    };
    const estadoNeedle = {
      instalado: "v3.1.0",
      sha: "f9e8d7c6",
    };

    const estado = estadoAdaptador(manifiesto, estadoNeedle);
    expect(estado.version).toBe("1.58.2");
    expect(estado.sha).toBe("a1b2c3d");
    expect(estado.fecha).toBe("2026-09-20");
    expect(estado.experiencias).toBe(1420);
    expect(estado.exactitud).toBe(94.8);
    expect(estado.esMasNuevoQueBase).toBe(true);
  });

  it("capasActivas determina el estado y tono de Needle, Jev y BitNet", () => {
    const capas = capasActivas({
      needle: { n4: true },
      jev: { activa: true },
      bitnet: { estado: "dormida" },
    });

    expect(capas).toHaveLength(3);
    expect(capas[0]).toEqual({
      nombre: "Needle",
      activa: true,
      tono: "ambar",
      detalle: "Actualización mayor disponible",
    });
    expect(capas[1]).toEqual({
      nombre: "Jev",
      activa: true,
      tono: "verde",
      detalle: "Decisión y calibración activa",
    });
    expect(capas[2]).toEqual({
      nombre: "BitNet",
      activa: false,
      tono: "ambar",
      detalle: "En reposo para ahorrar RAM",
    });
  });
});
