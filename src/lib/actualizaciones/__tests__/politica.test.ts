import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  decidirPolitica,
  politicaPorDefecto,
  sanearPolitica,
} from "../politica";

describe("politicaPorDefecto", () => {
  it("perfil-privado: datos e interfaz automáticas; sw automatica-esta; servicios/modelos/nativa manual", () => {
    const p = politicaPorDefecto("perfil-privado");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(p.nativa.modo).toBe("manual");
  });

  it("grupo-jerarquico: igual que perfil-privado", () => {
    const p = politicaPorDefecto("grupo-jerarquico");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(p.nativa.modo).toBe("manual");
  });

  it("pagina-publica: todas excepto servicios/modelos/nativa son automáticas-todas", () => {
    const p = politicaPorDefecto("pagina-publica");
    // Assume CAPAS_ORDEN includes at least datos, interfaz, sw, servicios, modelos, nativa
    for (const capa of CAPAS_ORDEN) {
      if (capa === "servicios" || capa === "modelos" || capa === "nativa") {
        expect(p[capa].modo).toBe("manual");
      } else {
        expect(p[capa].modo).toBe("automatica-todas");
      }
    }
  });

  it("grupo-democratico: igual que perfil-privado para politicaPorDefecto", () => {
    const p = politicaPorDefecto("grupo-democratico");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(p.nativa.modo).toBe("manual");
  });
});

describe("decidirPolitica", () => {
  const ctxBase = { ahoraH: 12, esNeuronaElegida: false, aprobada: false, requiereAprobacion: false };

  it("automatica-todas: siempre aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, ctxBase)).toBe("aplicar");
  });

  it("automatica-esta: aplicar solo si esNeuronaElegida", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, ctxBase)).toBe("avisar");
    expect(
      decidirPolitica({ modo: "automatica-esta" }, { ...ctxBase, esNeuronaElegida: true })
    ).toBe("aplicar");
  });

  it("programada: aplicar dentro de la ventana", () => {
    const ventana = { desdeH: 10, hastaH: 14 };
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 12 })
    ).toBe("aplicar");
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 9 })
    ).toBe("esperar");
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 14 })
    ).toBe("esperar");
  });

  it("programada: ventana que cruza la medianoche", () => {
    const ventana = { desdeH: 22, hastaH: 4 };
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 23 })
    ).toBe("aplicar");
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 2 })
    ).toBe("aplicar");
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 4 })
    ).toBe("esperar");
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 5 })
    ).toBe("esperar");
  });

  it("programada: ventana de 24 horas (desdeH === hastaH)", () => {
    const ventana = { desdeH: 5, hastaH: 5 };
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 0 })
    ).toBe("aplicar");
    expect(
      decidirPolitica({ modo: "programada", ventana }, { ...ctxBase, ahoraH: 23 })
    ).toBe("aplicar");
  });

  it("manual: siempre avisar", () => {
    expect(decidirPolitica({ modo: "manual" }, ctxBase)).toBe("avisar");
  });

  it("requiere aprobación y no aprobada: siempre esperar", () => {
    const ctx = { ...ctxBase, requiereAprobacion: true, aprobada: false };
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("esperar");
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("esperar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 0, hastaH: 24 } }, ctx)).toBe("esperar");
    expect(decidirPolitica({ modo: "manual" }, ctx)).toBe("esperar");
  });

  it("requiere aprobación y aprobada: decidir según el modo", () => {
    const ctx = { ...ctxBase, requiereAprobacion: true, aprobada: true };
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("avisar"); // esNeuronaElegida: false
    expect(
      decidirPolitica({ modo: "automatica-esta" }, { ...ctx, esNeuronaElegida: true })
    ).toBe("aplicar");
    const ventana = { desdeH: 10, hastaH: 14 };
    expect(decidirPolitica({ modo: "programada", ventana }, { ...ctx, ahoraH: 12 })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, ctx)).toBe("avisar");
  });
});

describe("sanearPolitica", () => {
  it("devuelve capas manuales para entrada nula", () => {
    const result = sanearPolitica(null);
    for (const capa of CAPAS_ORDEN) {
      expect(result[capa].modo).toBe("manual");
      expect(result[capa].ventana).toBeUndefined();
    }
  });

  it("sanea capas con modo inválido a manual", () => {
    const input = {
      datos: { modo: "invalid" },
      interfaz: { modo: "automatica-todas" },
    };
    const result = sanearPolitica(input);
    expect(result.datos.modo).toBe("manual");
    expect(result.interfaz.modo).toBe("automatica-todas");
    // otras capas deben ser manual
    for (const capa of CAPAS_ORDEN) {
      if (capa !== "datos" && capa !== "interfaz") {
        expect(result[capa].modo).toBe("manual");
      }
    }
  });

  it("sanea programada sin ventana válida a ventana nocturna", () => {
    const input = {
      modelos: { modo: "programada", ventana: { desdeH: 30 } }, // inválido
    };
    const result = sanearPolitica(input);
    expect(result.modelos.modo).toBe("programada");
    expect(result.modelos.ventana).toEqual({ desdeH: 3, hastaH: 6 }); // VENTANA_NOCTURNA
  });

  it("acepta ventana válida para programada", () => {
    const input = {
      modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } },
    };
    const result = sanearPolitica(input);
    expect(result.modelos.modo).toBe("programada");
    expect(result.modelos.ventana).toEqual({ desdeH: 22, hastaH: 4 });
  });

  it("rellena capas faltantes con manual", () => {
    const input = { datos: { modo: "automatica-todas" } };
    const result = sanearPolitica(input);
    expect(result.datos.modo).toBe("automatica-todas");
    for (const capa of CAPAS_ORDEN) {
      if (capa !== "datos") {
        expect(result[capa].modo).toBe("manual");
      }
    }
  });
});