import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import { decidirPolitica, politicaPorDefecto, resumenPolitica, sanearPolitica, VENTANA_NOCTURNA } from "../politica";

const ctx = { ahoraH: 12, esNeuronaElegida: false };

describe("política por defecto según el tipo de entidad", () => {
  it("perfil privado: datos e interfaz automáticas; sw en esta neurona; lo pesado avisa", () => {
    const p = politicaPorDefecto("perfil-privado");
    expect([p.datos.modo, p.interfaz.modo, p.sw.modo]).toEqual(["automatica-todas", "automatica-todas", "automatica-esta"]);
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
  });

  it("página pública: lo declarativo sigue la rama estable sola; el núcleo avisa", () => {
    const p = politicaPorDefecto("pagina-publica");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
  });

  it("grupo jerárquico: igual que un perfil privado", () => {
    expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("grupo democrático: mismas capas pero todas piden aprobación", () => {
    const p = politicaPorDefecto("grupo-democratico");
    expect(CAPAS_ORDEN.every((c) => p[c].requiereAprobacion === true)).toBe(true);
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.nativa.modo).toBe("manual");
  });

  it("devuelve copias: cambiar una política no toca la de fábrica", () => {
    const a = politicaPorDefecto("grupo-democratico");
    a.datos.requiereAprobacion = false;
    expect(politicaPorDefecto("grupo-democratico").datos.requiereAprobacion).toBe(true);
  });
});

describe("decidir por capa", () => {
  it("automática en todas: aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("aplicar");
  });

  it("automática solo en esta: elegida aplica, las demás avisan", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...ctx, esNeuronaElegida: true })).toBe("aplicar");
  });

  it("manual: siempre avisar", () => {
    expect(decidirPolitica({ modo: "manual" }, { ...ctx, esNeuronaElegida: true })).toBe("avisar");
  });

  it("programada: dentro de la ventana aplica y fuera espera", () => {
    const v = { modo: "programada" as const, ventana: { desdeH: 10, hastaH: 14 } };
    expect(decidirPolitica(v, { ...ctx, ahoraH: 10 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 13 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 14 })).toBe("esperar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 9 })).toBe("esperar");
  });

  it("programada: la ventana cruza la medianoche", () => {
    const v = { modo: "programada" as const, ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(v, { ...ctx, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 12 })).toBe("esperar");
  });

  it("programada sin ventana usa la nocturna de fábrica", () => {
    expect(decidirPolitica({ modo: "programada" }, { ...ctx, ahoraH: VENTANA_NOCTURNA.desdeH })).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada" }, ctx)).toBe("esperar");
  });
});

describe("aprobación de entidades democráticas", () => {
  it("si la capa pide aprobación y no está aprobada, siempre esperar", () => {
    expect(decidirPolitica({ modo: "automatica-todas", requiereAprobacion: true }, ctx)).toBe("esperar");
    expect(decidirPolitica({ modo: "manual", requiereAprobacion: true }, ctx)).toBe("esperar");
  });

  it("con aprobación, decide según el modo", () => {
    expect(decidirPolitica({ modo: "automatica-todas", requiereAprobacion: true }, { ...ctx, aprobada: true })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual", requiereAprobacion: true }, { ...ctx, aprobada: true })).toBe("avisar");
  });

  it("el contexto también puede exigir aprobación", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...ctx, requiereAprobacion: true })).toBe("esperar");
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...ctx, requiereAprobacion: true, aprobada: true })).toBe("aplicar");
  });

  it("una política de grupo democrático espera hasta que su versión se apruebe", () => {
    const p = politicaPorDefecto("grupo-democratico");
    expect(decidirPolitica(p.datos, ctx)).toBe("esperar");
    expect(decidirPolitica(p.datos, { ...ctx, aprobada: true })).toBe("aplicar");
  });
});

describe("sanear una política que llega de fuera", () => {
  it("basura o nada: todo en manual", () => {
    for (const basura of [null, undefined, "texto", 42, [] as unknown]) {
      expect(CAPAS_ORDEN.every((c) => sanearPolitica(basura)[c].modo === "manual")).toBe(true);
    }
  });

  it("conserva los modos válidos y descarta los desconocidos", () => {
    const p = sanearPolitica({ datos: { modo: "automatica-todas" }, interfaz: { modo: "magia" } });
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("manual");
  });

  it("programada con ventana inválida cae a la nocturna", () => {
    expect(sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 30, hastaH: 5 } } }).modelos).toEqual({
      modo: "programada", ventana: VENTANA_NOCTURNA,
    });
  });

  it("conserva la marca de aprobación y el resumen no la esconde", () => {
    const p = sanearPolitica(politicaPorDefecto("grupo-democratico"));
    expect(CAPAS_ORDEN.every((c) => p[c].requiereAprobacion === true)).toBe(true);
    expect(resumenPolitica(p)).toBe("3 capas automáticas · 3 con aviso");
  });
});

