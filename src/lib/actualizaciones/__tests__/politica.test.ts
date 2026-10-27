import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  VENTANA_NOCTURNA, decidirPolitica, exigeAprobacion, politicaPorDefecto, sanearPolitica,
  type PoliticaCapa,
} from "../politica";

describe("política: rescate de la rama nube/40439436739", () => {
  const ctx = { ahoraH: 12, esNeuronaElegida: false };

  it("perfil: la capa sw va automática solo en la neurona elegida, y las capas salen en orden", () => {
    const p = politicaPorDefecto("perfil");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
  });

  it("página pública sigue la rama estable también en la capa sin conexión", () => {
    const p = politicaPorDefecto("pagina-publica");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-todas");
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
  });

  it("los alias del contrato coinciden con sus tipos de siempre", () => {
    expect(politicaPorDefecto("perfil-privado")).toEqual(politicaPorDefecto("perfil"));
    expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("grupo"));
    expect(politicaPorDefecto("grupo-democratico")).toEqual(politicaPorDefecto("grupo"));
  });

  it("solo el grupo democrático exige aprobación antes de aplicar", () => {
    expect(exigeAprobacion("grupo-democratico")).toBe(true);
    expect(exigeAprobacion("grupo-jerarquico")).toBe(false);
    expect(exigeAprobacion("perfil-privado")).toBe(false);
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

  it("sanear convierte en manual la basura de cada capa", () => {
    const p = sanearPolitica({ datos: "no-soy-una-capa", interfaz: { modo: "magia" }, modelos: null });
    expect(p.datos.modo).toBe("manual");
    expect(p.interfaz.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(Object.keys(sanearPolitica(undefined))).toEqual(CAPAS_ORDEN);
  });
});

describe("decidir: modos y aprobación", () => {
  const ctx = { ahoraH: 12, esNeuronaElegida: true };
  const cruza: PoliticaCapa = { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } };

  it("automatica-todas aplica siempre", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("aplicar");
  });

  it("automatica-esta aplica en la elegida y avisa en las demás", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...ctx, esNeuronaElegida: false })).toBe("avisar");
  });

  it("manual siempre avisa", () => {
    expect(decidirPolitica({ modo: "manual" }, ctx)).toBe("avisar");
  });

  it("programada cruza la medianoche en ambos lados", () => {
    expect(decidirPolitica(cruza, { ...ctx, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(cruza, { ...ctx, ahoraH: 1 })).toBe("aplicar");
    expect(decidirPolitica(cruza, { ...ctx, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(cruza, { ...ctx, ahoraH: 12 })).toBe("esperar");
  });

  it("sin aprobación se espera aunque el modo diga automática", () => {
    const pendiente = { ...ctx, requiereAprobacion: true, aprobada: false };
    expect(decidirPolitica({ modo: "automatica-todas" }, pendiente)).toBe("esperar");
    expect(decidirPolitica({ modo: "manual" }, pendiente)).toBe("esperar");
  });

  it("con aprobación se sigue el modo de la capa", () => {
    const aprobada = { ...ctx, requiereAprobacion: true, aprobada: true };
    expect(decidirPolitica({ modo: "automatica-todas" }, aprobada)).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, aprobada)).toBe("avisar");
  });
});
