/**
 * Pruebas de la política de actualización por capa: cada modo, ventana (con cruce de medianoche),
 * puerta de aprobación y saneado de lo que llega mermado del almacenamiento.
 */
import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  decidirPolitica,
  politicaPorDefecto,
  resumenPolitica,
  sanearPolitica,
  VENTANA_NOCTURNA,
  type ContextoDecision,
} from "../politica";

const ctx = { ahoraH: 12, esNeuronaElegida: false } satisfies ContextoDecision;

describe("politicaPorDefecto", () => {
  it("perfil: datos e interfaz automáticas, sw solo en esta, resto manual", () => {
    const p = politicaPorDefecto("perfil");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN.slice());
  });

  it("página: lo mismo que un perfil por defecto", () => {
    expect(politicaPorDefecto("pagina")).toEqual(politicaPorDefecto("perfil"));
  });

  it("el OS programa los modelos en la ventana nocturna", () => {
    expect(politicaPorDefecto("os").modelos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
  });

  it("devuelve copias: cambiar una no toca la de fábrica", () => {
    const a = politicaPorDefecto("os");
    a.modelos.ventana!.desdeH = 12;
    expect(politicaPorDefecto("os").modelos.ventana!.desdeH).toBe(3);
  });
});

describe("decidirPolitica", () => {
  it("modos base: automática aplica, manual avisa, la de esta neurona distingue", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...ctx, esNeuronaElegida: true })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, ctx)).toBe("avisar");
  });

  it("programada: dentro y fuera de ventana", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 10, hastaH: 14 } }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 14, hastaH: 16 } }, ctx)).toBe("esperar");
    // límites: el inicio entra, el final ya no
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 12, hastaH: 14 } }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 10, hastaH: 12 } }, ctx)).toBe("esperar");
    // de 24 h (inicio = fin)
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 5, hastaH: 5 } }, ctx)).toBe("aplicar");
  });

  it("ventana que cruza la medianoche", () => {
    const v = { modo: "programada" as const, ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(v, { ...ctx, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 2 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(v, { ...ctx, ahoraH: 12 })).toBe("esperar");
  });

  it("puerta de aprobación: sin voto nada se aplica, con voto decide su modo", () => {
    const p = { modo: "automatica-todas" } as const;
    expect(decidirPolitica(p, { ...ctx, requiereAprobacion: true })).toBe("esperar");
    expect(decidirPolitica(p, { ...ctx, requiereAprobacion: true, aprobada: false })).toBe("esperar");
    expect(decidirPolitica(p, { ...ctx, requiereAprobacion: true, aprobada: true })).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, { ...ctx, requiereAprobacion: true, aprobada: true })).toBe("avisar");
  });
});

describe("sanearPolitica", () => {
  it("basura: lo que falta o viene mal queda en manual", () => {
    expect(Object.values(sanearPolitica(null)).every((c) => c.modo === "manual")).toBe(true);
    expect(Object.values(sanearPolitica("no soy política")).every((c) => c.modo === "manual")).toBe(true);
    expect(Object.values(sanearPolitica({ datos: [1, 2] })).every((c) => c.modo === "manual")).toBe(true);
    expect(sanearPolitica({ interfaz: { modo: "magia" } }).interfaz.modo).toBe("manual");
  });

  it("saneado: lo válido se conserva; programada sin ventana pasa a la nocturna", () => {
    const p = sanearPolitica({
      datos: { modo: "automatica-todas" },
      modelos: { modo: "programada", ventana: { desdeH: 30 } },
      nativa: { modo: "programada" },
    });
    expect(p.datos).toEqual({ modo: "automatica-todas" });
    expect(p.modelos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(p.nativa).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
    expect(Object.keys(p)).toEqual(CAPAS_ORDEN.slice());
  });

  it("resumen corto", () => {
    expect(resumenPolitica(politicaPorDefecto("perfil"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("grupo"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("os"))).toBe("3 capas automáticas · 1 programada · 2 con aviso");
  });
});
