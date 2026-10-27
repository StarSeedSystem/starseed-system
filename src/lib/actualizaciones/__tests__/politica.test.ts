import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  VENTANA_NOCTURNA, decidirPolitica, politicaPorDefecto, sanearPolitica,
  type PoliticaCapa,
} from "../politica";

describe("política: rescate de la rama nube/40439436739", () => {
  const ctx = { ahoraH: 12, esNeuronaElegida: false };

  it("perfil: la capa sw va automática solo en la neurona elegida, y las capas salen en orden", () => {
    const p = politicaPorDefecto("perfil");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
  });

  it("página pública toma la política del perfil: lo declarativo va solo", () => {
    expect(politicaPorDefecto("pagina")).toEqual(politicaPorDefecto("perfil"));
  });

  it("programada: la ventana es [desdeH, hastaH), el borde justo ya no cabe", () => {
    const capa: PoliticaCapa = { modo: "programada", ventana: { desdeH: 10, hastaH: 14 } };
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 10 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 14 })).toBe("esperar");
  });

  it("programada sin ventana declarada usa la nocturna por defecto", () => {
    const capa: PoliticaCapa = { modo: "programada" };
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...ctx, ahoraH: 12 })).toBe("esperar");
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
});

describe("política: rescate de la rama nube/40550707104", () => {
  it("los tipos que no son el OS comparten la política base", () => {
    const base = politicaPorDefecto("perfil");
    for (const tipo of ["grupo", "comunidad", "estudio", "evento"] as const)
      expect(politicaPorDefecto(tipo)).toEqual(base);
  });

  it("sanear: con entrada nula igual entrega las seis capas en orden", () => {
    expect(Object.keys(sanearPolitica(null))).toEqual(CAPAS_ORDEN);
  });
});
