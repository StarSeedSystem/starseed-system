import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  VENTANA_NOCTURNA, decidirPolitica, politicaPorDefecto, sanearPolitica,
  sistemaRequiereAprobacion, type PoliticaCapa, type TipoEntidad,
} from "../politica";
const modos = (tipo: Parameters<typeof politicaPorDefecto>[0]) => CAPAS_ORDEN.map((c) => politicaPorDefecto(tipo)[c].modo);
describe("política por defecto por tipo de sistema", () => {
  it("perfil-privado: datos e interfaz automáticas; sw solo en la elegida; el resto avisa", () => {
    expect(modos("perfil-privado")).toEqual([
      "automatica-todas", "automatica-todas", "automatica-esta", "manual", "manual", "manual",
    ]);
  });
  it("el nombre corto del producto equivale al del contrato", () => {
    expect(politicaPorDefecto("perfil")).toEqual(politicaPorDefecto("perfil-privado"));
  });
  it("página pública: todo lo declarativo (incluido sw) sigue la rama estable sola", () => {
    expect(modos("pagina-publica")).toEqual([
      "automatica-todas", "automatica-todas", "automatica-todas", "manual", "manual", "manual",
    ]);
    expect(politicaPorDefecto("pagina")).toEqual(politicaPorDefecto("pagina-publica"));
  });
  it("grupo jerárquico se comporta como un perfil privado", () => {
    expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("perfil-privado"));
  });
  it("los tipos que no son el OS ni la página comparten la política base", () => {
    const base = politicaPorDefecto("perfil");
    const otros: TipoEntidad[] = ["grupo", "comunidad", "estudio", "evento"];
    for (const tipo of otros) expect(politicaPorDefecto(tipo), tipo).toEqual(base);
  });
  it("grupo democrático: mismos modos, cada capa marcada «requiere aprobación»", () => {
    const demo = politicaPorDefecto("grupo-democratico");
    expect(demo).toEqual(Object.fromEntries(CAPAS_ORDEN.map((c) => [c, {
      ...politicaPorDefecto("perfil-privado")[c], requiereAprobacion: true,
    }])));
    expect(sistemaRequiereAprobacion("grupo-democratico")).toBe(true);
    expect(sistemaRequiereAprobacion("grupo-jerarquico")).toBe(false);
  });
  it("la marca de aprobación de la política por defecto sale de sistemaRequiereAprobacion", () => {
    const tipos = [
      "perfil", "pagina", "grupo", "comunidad", "estudio", "evento", "os",
      "perfil-privado", "pagina-publica", "grupo-jerarquico", "grupo-democratico",
    ] as const;
    for (const tipo of tipos) {
      const requiere = sistemaRequiereAprobacion(tipo);
      for (const capa of CAPAS_ORDEN)
        expect(politicaPorDefecto(tipo)[capa].requiereAprobacion === true).toBe(requiere);
    }
  });
  it("el OS programa los modelos en la ventana nocturna y entrega las capas en orden", () => {
    const p = politicaPorDefecto("os");
    expect(p.modelos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
    expect(CAPAS_ORDEN.some((c) => p[c].requiereAprobacion)).toBe(false);
  });
});

describe("decidirPolitica: cada modo", () => {
  const base = { ahoraH: 12, esNeuronaElegida: false, aprobada: true, requiereAprobacion: false };
  it("automática en todas → aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, base)).toBe("aplicar");
  });
  it("automática en esta: solo la neurona elegida aplica; el resto avisa", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, base)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...base, esNeuronaElegida: true })).toBe("aplicar");
  });
  it("manual siempre avisa", () => {
    expect(decidirPolitica({ modo: "manual" }, base)).toBe("avisar");
  });
  it("programada: dentro de [desdeH, hastaH) aplica; en el borde final espera", () => {
    const capa: PoliticaCapa = { modo: "programada", ventana: { desdeH: 10, hastaH: 14 } };
    expect(decidirPolitica(capa, { ...base, ahoraH: 10 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...base, ahoraH: 13 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...base, ahoraH: 14 })).toBe("esperar");
    expect(decidirPolitica(capa, { ...base, ahoraH: 9 })).toBe("esperar");
  });
  it("programada que cruza la medianoche: [22, 4) cubre la noche y no el mediodía", () => {
    const capa: PoliticaCapa = { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(capa, { ...base, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...base, ahoraH: 2 })).toBe("aplicar");
    expect(decidirPolitica(capa, { ...base, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(capa, { ...base, ahoraH: 12 })).toBe("esperar");
  });
  it("programada con desdeH = hastaH es una ventana de 24 h; sin ventana usa la nocturna", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 5, hastaH: 5 } }, { ...base, ahoraH: 17 })).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada" }, { ...base, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada" }, { ...base, ahoraH: 12 })).toBe("esperar");
  });
});

describe("decidirPolitica: la aprobación manda sobre el modo", () => {
  const base = { ahoraH: 12, esNeuronaElegida: true, aprobada: false, requiereAprobacion: true };

  it("sin aprobación se espera aunque la política sea automática en todas", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, base)).toBe("esperar");
  });
  it("sin aprobación también espera una capa manual: no se avisa de lo que no puede aplicarse", () => {
    expect(decidirPolitica({ modo: "manual" }, base)).toBe("esperar");
  });
  it("con aprobación vuelve a decidir por el modo", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...base, aprobada: true })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, { ...base, aprobada: true })).toBe("avisar");
  });
  it("una capa marcada exige aprobación aunque el contexto no lo diga", () => {
    const capa: PoliticaCapa = { modo: "automatica-todas", requiereAprobacion: true };
    expect(decidirPolitica(capa, { ahoraH: 12, esNeuronaElegida: false })).toBe("esperar");
    expect(decidirPolitica(capa, { ahoraH: 12, esNeuronaElegida: false, aprobada: true })).toBe("aplicar");
  });
});

describe("sanearPolitica: nada roto llega al motor", () => {
  it("basura (nulo, primitivos o array) → todas las capas en manual, en orden", () => {
    for (const basura of [null, undefined, 7, "algo", ["datos"]]) {
      const p = sanearPolitica(basura);
      expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
      expect(CAPAS_ORDEN.every((c) => p[c].modo === "manual")).toBe(true);
      expect(CAPAS_ORDEN.every((c) => p[c].requiereAprobacion === undefined)).toBe(true);
    }
  });
  it("ignora capas desconocidas y no las cuela en el resultado", () => {
    const p = sanearPolitica({ widgets: { modo: "automatica-todas" }, datos: { modo: "automatica-todas" } });
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
    expect(Object.keys(p)).not.toContain("widgets");
    expect(p.datos.modo).toBe("automatica-todas");
  });
  it("modo inventado → manual; lo válido sobrevive", () => {
    const p = sanearPolitica({ interfaz: { modo: "automatica-todas" }, datos: { modo: "magia" } });
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.datos).toEqual({ modo: "manual" });
    expect(p.servicios.modo).toBe("manual");
  });
  it("programada con ventana inválida → nocturna; con ventana válida → se conserva", () => {
    expect(sanearPolitica({ datos: { modo: "programada", ventana: { desdeH: 30 } } }).datos)
      .toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } } }).modelos)
      .toEqual({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } });
  });
  it("conserva la marca de aprobación y descarta una que no sea booleana", () => {
    expect(sanearPolitica({ datos: { modo: "automatica-todas", requiereAprobacion: true } }).datos)
      .toEqual({ modo: "automatica-todas", requiereAprobacion: true });
    expect(sanearPolitica({ datos: { modo: "automatica-todas", requiereAprobacion: "sí" } }).datos)
      .toEqual({ modo: "automatica-todas" });
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
  it("sanear una entrada nula deja las seis capas en orden y en manual", () => {
    const p = sanearPolitica(null);
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
    for (const capa of CAPAS_ORDEN) expect(p[capa].modo).toBe("manual");
  });
  it("sanear conserva una ventana válida que cruza la medianoche", () => {
    const modelos = sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } } }).modelos;
    expect(modelos).toEqual({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } });
  });
});
