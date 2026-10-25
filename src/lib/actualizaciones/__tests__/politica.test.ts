import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN, type CapaActualizacion } from "../manifiesto";
import {
  NOMBRE_TIPO,
  VENTANA_NOCTURNA,
  decidirPolitica,
  politicaPorDefecto,
  requiereAprobacionPrevia,
  resumenPolitica,
  sanearPolitica,
  type ContextoDecision,
} from "../politica";

const CTX: ContextoDecision = { ahoraH: 12, esNeuronaElegida: false };

describe("política por defecto según el tipo", () => {
  it("perfil privado: datos e interfaz automáticos; el resto avisa", () => {
    const p = politicaPorDefecto("perfil-privado");
    expect([p.datos.modo, p.interfaz.modo]).toEqual(["automatica-todas", "automatica-todas"]);
    expect(p.sw.modo).toBe("automatica-esta");
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
  });

  it("el nombre corto de perfil da la misma política que el del contrato", () => {
    expect(politicaPorDefecto("perfil")).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("página pública: datos, interfaz y sin conexión siguen la rama estable", () => {
    const p = politicaPorDefecto("pagina-publica");
    expect([p.datos.modo, p.interfaz.modo, p.sw.modo]).toEqual(["automatica-todas", "automatica-todas", "automatica-todas"]);
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
    expect(politicaPorDefecto("pagina")).toEqual(p);
  });

  it("grupo jerárquico: como un perfil privado", () => {
    expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("grupo democrático: misma política, pero exige aprobación previa", () => {
    expect(politicaPorDefecto("grupo-democratico")).toEqual(politicaPorDefecto("perfil-privado"));
    expect(requiereAprobacionPrevia("grupo-democratico")).toBe(true);
  });

  it("solo el grupo democrático exige aprobación previa", () => {
    const tipos = ["perfil-privado", "pagina-publica", "grupo-jerarquico", "os", "perfil", "pagina"] as const;
    expect(tipos.filter((t) => requiereAprobacionPrevia(t))).toEqual([]);
  });

  it("cubre todas las capas y nombra también los tipos del contrato", () => {
    const p = politicaPorDefecto("os");
    expect(CAPAS_ORDEN.every((c: CapaActualizacion) => !!p[c]?.modo)).toBe(true);
    expect(NOMBRE_TIPO["perfil-privado"]).toBe("perfil privado");
    expect(NOMBRE_TIPO["pagina-publica"]).toBe("página pública");
    expect(NOMBRE_TIPO["grupo-jerarquico"]).toBe("grupo jerárquico");
    expect(NOMBRE_TIPO["grupo-democratico"]).toBe("grupo democrático");
  });

  it("devuelve copias: cambiar una política no toca la de fábrica", () => {
    const a = politicaPorDefecto("os");
    a.modelos.ventana!.desdeH = 12;
    expect(politicaPorDefecto("os").modelos.ventana).toEqual(VENTANA_NOCTURNA);
  });
});

describe("decidir la política de una capa", () => {
  it("automática en todas: aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, CTX)).toBe("aplicar");
  });

  it("automática solo en esta neurona: aplica si es la elegida y avisa si no", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, CTX)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...CTX, esNeuronaElegida: true })).toBe("aplicar");
  });

  it("manual: siempre avisar", () => {
    expect(decidirPolitica({ modo: "manual" }, CTX)).toBe("avisar");
    expect(decidirPolitica({ modo: "manual" }, { ...CTX, esNeuronaElegida: true })).toBe("avisar");
  });

  it("programada: aplica dentro de la ventana y espera fuera", () => {
    const p = { modo: "programada" as const, ventana: { desdeH: 10, hastaH: 14 } };
    expect(decidirPolitica(p, { ...CTX, ahoraH: 10 })).toBe("aplicar");
    expect(decidirPolitica(p, { ...CTX, ahoraH: 13 })).toBe("aplicar");
    expect(decidirPolitica(p, { ...CTX, ahoraH: 14 })).toBe("esperar");
    expect(decidirPolitica(p, { ...CTX, ahoraH: 9 })).toBe("esperar");
  });

  it("programada: cruce de medianoche y ventana de 24 h", () => {
    const noche = { modo: "programada" as const, ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(noche, { ...CTX, ahoraH: 22 })).toBe("aplicar");
    expect(decidirPolitica(noche, { ...CTX, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(noche, { ...CTX, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica(noche, { ...CTX, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(noche, { ...CTX, ahoraH: 12 })).toBe("esperar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 5, hastaH: 5 } }, { ...CTX, ahoraH: 17 })).toBe("aplicar");
  });

  it("sin aprobación cuando se requiere: siempre esperar, sea cual sea el modo", () => {
    const sinAprobar = { ...CTX, requiereAprobacion: true, aprobada: false };
    expect(decidirPolitica({ modo: "automatica-todas" }, sinAprobar)).toBe("esperar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...sinAprobar, esNeuronaElegida: true })).toBe("esperar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 0, hastaH: 23 } }, sinAprobar)).toBe("esperar");
    expect(decidirPolitica({ modo: "manual" }, sinAprobar)).toBe("esperar");
  });

  it("con aprobación, cada modo recupera su decisión normal", () => {
    const aprobada = { ...CTX, requiereAprobacion: true, aprobada: true };
    expect(decidirPolitica({ modo: "automatica-todas" }, aprobada)).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, aprobada)).toBe("avisar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 14, hastaH: 16 } }, aprobada)).toBe("esperar");
  });

  it("sin exigencia de aprobación, el contexto no cambia nada", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...CTX, aprobada: false })).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...CTX, requiereAprobacion: false, aprobada: false })).toBe("aplicar");
  });
});

describe("sanear una política que llega de fuera", () => {
  it("conserva lo válido y convierte en manual el modo desconocido", () => {
    const p = sanearPolitica({
      datos: { modo: "automatica-todas" },
      interfaz: { modo: "magia" },
      sw: { modo: null },
      servicios: "manual",
      modelos: { modo: "programada", ventana: { desdeH: 3, hastaH: 6 } },
      nativa: { modo: "automatica-esta" },
    });
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("manual");
    expect(p.sw.modo).toBe("manual");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos).toEqual({ modo: "programada", ventana: { desdeH: 3, hastaH: 6 } });
    expect(p.nativa.modo).toBe("automatica-esta");
  });

  it("null, arrays y texto: toda la política queda en manual", () => {
    for (const basura of [null, undefined, [], "automatica-todas", 42]) {
      const p = sanearPolitica(basura);
      expect(CAPAS_ORDEN.every((c) => p[c].modo === "manual")).toBe(true);
    }
  });

  it("programada con ventana inválida cae en la ventana nocturna, no se pierde el modo", () => {
    const p = sanearPolitica({
      datos: { modo: "programada", ventana: { desdeH: 30, hastaH: 6 } },
      interfaz: { modo: "programada", ventana: { desdeH: 3 } },
      sw: { modo: "programada", ventana: null },
    });
    expect(p.datos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(p.interfaz).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(p.sw).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
  });

  it("el resultado es una copia: no comparte la ventana con la constante de fábrica", () => {
    const p = sanearPolitica({ datos: { modo: "programada", ventana: { desdeH: 1, hastaH: 2 } } });
    p.datos.ventana!.desdeH = 9;
    expect(VENTANA_NOCTURNA.desdeH).toBe(3);
  });

  it("resumen corto para la ficha del sistema", () => {
    expect(resumenPolitica(politicaPorDefecto("perfil-privado"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("os"))).toBe("3 capas automáticas · 1 programada · 2 con aviso");
  });
});
