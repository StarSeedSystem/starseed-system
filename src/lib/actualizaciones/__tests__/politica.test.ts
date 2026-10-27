import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  NOMBRE_MODO,
  MODOS_POLITICA,
  VENTANA_NOCTURNA,
  decidirPolitica,
  politicaPorDefecto,
  resumenPolitica,
  sanearPolitica,
  type PoliticaCapa,
} from "../politica";

describe("política de actualización por capa", () => {
  const ctx = { ahoraH: 12, esNeuronaElegida: false };

  it("cada modo tiene nombre en español y la lista de modos está completa", () => {
    expect(MODOS_POLITICA).toEqual(["automatica-todas", "automatica-esta", "programada", "manual"]);
    for (const m of MODOS_POLITICA) expect(NOMBRE_MODO[m].length).toBeGreaterThan(0);
  });

  it("perfil por defecto: datos e interfaz automáticas, sw solo en la elegida, resto manual", () => {
    const p = politicaPorDefecto("perfil");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(p.nativa.modo).toBe("manual");
  });

  it("todas las entidades entregan las capas en el orden del manifiesto", () => {
    for (const tipo of ["perfil", "pagina", "grupo", "comunidad", "estudio", "evento", "os"] as const) {
      expect(Object.keys(politicaPorDefecto(tipo))).toEqual(CAPAS_ORDEN);
    }
  });

  it("página pública toma la política del perfil; el OS descarga modelos en la ventana nocturna", () => {
    expect(politicaPorDefecto("pagina")).toEqual(politicaPorDefecto("perfil"));
    const os = politicaPorDefecto("os");
    expect(os.modelos.modo).toBe("programada");
    expect(os.modelos.ventana).toEqual(VENTANA_NOCTURNA);
  });

  it("automatica-todas aplica siempre; manual solo avisa aunque la neurona esté elegida", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...ctx, esNeuronaElegida: false })).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...ctx, esNeuronaElegida: true })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, { ...ctx, esNeuronaElegida: true })).toBe("avisar");
  });

  it("automatica-esta: aplicar solo en la neurona elegida, avisar en las demás", () => {
    const capa: PoliticaCapa = { modo: "automatica-esta" };
    expect(decidirPolitica(capa, { ...ctx, esNeuronaElegida: true })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, esNeuronaElegida: false })).toBe("avisar");
  });

  it("programada: la ventana es [desdeH, hastaH), el borde justo ya no cabe", () => {
    const capa: PoliticaCapa = { modo: "programada", ventana: { desdeH: 10, hastaH: 14 } };
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 9 })).toBe("esperar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 10 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 13 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 14 })).toBe("esperar");
  });

  it("programada con cruce de medianoche: [22, 4) cubre 23, 0 y 3, pero no 12", () => {
    const capa: PoliticaCapa = { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 0 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 12 })).toBe("esperar");
  });

  it("programada sin ventana declarada usa la nocturna por defecto (3-6)", () => {
    const capa: PoliticaCapa = { modo: "programada" };
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 5 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 6 })).toBe("esperar");
    expect(VENTANA_NOCTURNA).toEqual({ desdeH: 3, hastaH: 6 });
  });

  it("sanear conserva lo válido de cada capa y entrega las capas en orden", () => {
    const p = sanearPolitica({
      interfaz: { modo: "automatica-todas" },
      sw: { modo: "automatica-esta" },
      servicios: { modo: "manual" },
    });
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(p.servicios.modo).toBe("manual");
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
  });

  it("sanear conserva una ventana válida que cruza la medianoche", () => {
    const modelos = sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } } }).modelos;
    expect(modelos).toEqual({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } });
  });

  it("sanear con basura total lo rellena todo con manual", () => {
    const p = sanearPolitica(null);
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
    for (const capa of CAPAS_ORDEN) expect(p[capa].modo).toBe("manual");
  });

  it("sanear descarta modos desconocidos, capas ajenas y ventanas rotas", () => {
    const p = sanearPolitica({
      datos: { modo: "en-masa" },
      interfaz: { modo: "programada", ventana: { desdeH: -3, hastaH: 42 } },
      extra: { modo: "automatica-todas" },
    });
    expect(p.datos.modo).toBe("manual");
    expect(p.interfaz.modo).toBe("programada");
    expect(p.interfaz.ventana).toEqual(VENTANA_NOCTURNA);
    expect("extra" in p).toBe(false);
    expect(p.servicios.modo).toBe("manual");
  });

  it("el resumen cuenta capas automáticas, programadas y con aviso", () => {
    expect(resumenPolitica(politicaPorDefecto("perfil"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("os"))).toBe("3 capas automáticas · 1 programada · 2 con aviso");
    expect(resumenPolitica(sanearPolitica(null))).toBe("6 con aviso");
  });
});
