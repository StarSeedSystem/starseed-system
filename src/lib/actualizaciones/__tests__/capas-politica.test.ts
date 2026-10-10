import { describe, expect, it } from "vitest";
import { COMO_SE_APLICA, capasPendientes, esPesada, resumenCoste } from "../capas";
import {
  MODOS_POLITICA, decidirPolitica, politicaPorDefecto, resumenPolitica, sanearPolitica, VENTANA_NOCTURNA,
} from "../politica";

describe("capas: lo mínimo en cada aparato", () => {
  it("solo la capa nativa reinstala; datos es la única en caliente", () => {
    expect(Object.entries(COMO_SE_APLICA).filter(([, c]) => c.reinstala).map(([k]) => k)).toEqual(["nativa"]);
    expect(COMO_SE_APLICA.datos.gesto).toBe("en-caliente");
    expect(COMO_SE_APLICA.datos.interrumpe).toBe(false);
  });

  it("pendientes: solo lo que el manifiesto toca y la neurona no tiene, en orden", () => {
    const p = capasPendientes({ capas: ["nativa", "interfaz", "datos"], version: "2026.10.10" }, { interfaz: "2026.10.10", datos: "2026.10.01" });
    expect(p.map((x) => x.capa)).toEqual(["datos", "nativa"]);
    expect(p[0].tiene).toBe("2026.10.01");
    expect(p[1].tiene).toBeNull(); // sin versión declarada: pendiente, no se presume al día
  });

  it("una versión más nueva instalada no se rebaja", () => {
    expect(capasPendientes({ capas: ["interfaz"], version: "2026.10.09" }, { interfaz: "2026.10.10" })).toEqual([]);
  });

  it("coste honesto en una frase", () => {
    const m = { capas: ["datos", "interfaz", "nativa"] as const, version: "1" };
    expect(resumenCoste([])).toMatch(/Al día/);
    expect(resumenCoste(capasPendientes({ ...m, capas: ["datos"] }, {}))).toMatch(/sin interrumpirte/);
    expect(resumenCoste(capasPendientes({ ...m, capas: ["interfaz"] }, {}))).toMatch(/recarga suave/);
    expect(resumenCoste(capasPendientes({ ...m, capas: [...m.capas] }, {}))).toMatch(/relanzar/);
    expect(esPesada(capasPendientes({ ...m, capas: ["datos"] }, {}))).toBe(false);
    expect(esPesada(capasPendientes({ ...m, capas: ["nativa"] }, {}))).toBe(true);
  });
});

describe("política por sistema y tipo", () => {
  it("perfil: datos e interfaz automáticas; servicios, modelos y nativa avisan", () => {
    const p = politicaPorDefecto("perfil");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
  });

  it("el OS programa los modelos (descargas grandes) en la ventana nocturna", () => {
    const p = politicaPorDefecto("os");
    expect(p.modelos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
  });

  it("devuelve copias: cambiar una no toca la de fábrica", () => {
    const a = politicaPorDefecto("os");
    a.modelos.ventana!.desdeH = 12;
    expect(politicaPorDefecto("os").modelos.ventana!.desdeH).toBe(3);
  });

  it("decidir: cada modo", () => {
    const ctx = { ahoraH: 12, esNeuronaElegida: false };
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...ctx, esNeuronaElegida: true })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, ctx)).toBe("avisar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 10, hastaH: 14 } }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 14, hastaH: 16 } }, ctx)).toBe("esperar");
  });

  it("ventana que cruza la medianoche y ventana de 24 h", () => {
    const v = { modo: "programada" as const, ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(v, { ahoraH: 23, esNeuronaElegida: false })).toBe("aplicar");
    expect(decidirPolitica(v, { ahoraH: 2, esNeuronaElegida: false })).toBe("aplicar");
    expect(decidirPolitica(v, { ahoraH: 4, esNeuronaElegida: false })).toBe("esperar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 5, hastaH: 5 } }, { ahoraH: 17, esNeuronaElegida: false })).toBe("aplicar");
  });

  it("sanear: basura → manual; programada sin ventana válida → nocturna", () => {
    const p = sanearPolitica({ datos: { modo: "automatica-todas" }, interfaz: { modo: "magia" }, modelos: { modo: "programada", ventana: { desdeH: 30 } } });
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("manual");
    expect(p.modelos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(Object.values(sanearPolitica(null)).every((c) => c.modo === "manual")).toBe(true);
    expect(MODOS_POLITICA).toHaveLength(4);
  });

  it("resumen corto", () => {
    expect(resumenPolitica(politicaPorDefecto("perfil"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("os"))).toBe("3 capas automáticas · 1 programada · 2 con aviso");
  });
});
