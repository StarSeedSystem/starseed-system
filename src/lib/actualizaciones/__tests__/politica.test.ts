import { describe, expect, it } from "vitest";
import {
  MODOS_POLITICA,
  decidirPolitica,
  politicaPorDefecto,
  requiereAprobacion,
  resumenPolitica,
  sanearPolitica,
  type ContextoDecision,
  type PoliticaCapa,
  type TipoEntidad,
  VENTANA_NOCTURNA,
} from "../politica";

const ctxBase: ContextoDecision = { ahoraH: 12, esNeuronaElegida: false };

describe("política por defecto según el tipo (contrato §4)", () => {
  it("se conocen los cuatro modos", () => {
    expect(MODOS_POLITICA).toHaveLength(4);
  });

  it("perfil-privado y grupo-jerarquico: datos e interfaz automáticas, sw en la elegida, el resto avisa", () => {
    const p = politicaPorDefecto("perfil-privado");
    expect([p.datos.modo, p.interfaz.modo]).toEqual(["automatica-todas", "automatica-todas"]);
    expect(p.sw.modo).toBe("automatica-esta");
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
    expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("pagina-publica sigue la rama estable sola en lo declarativo", () => {
    const p = politicaPorDefecto("pagina-publica");
    expect(p.datos).toEqual({ modo: "automatica-todas" });
    expect(p.nativa.modo).toBe("manual");
  });

  it("grupo-democratico usa la política base pero requiere aprobación", () => {
    expect(politicaPorDefecto("grupo-democratico")).toEqual(politicaPorDefecto("perfil-privado"));
    expect(requiereAprobacion("grupo-democratico")).toBe(true);
    expect(requiereAprobacion("grupo-jerarquico")).toBe(false);
    expect(requiereAprobacion("perfil-privado")).toBe(false);
    expect(requiereAprobacion("pagina-publica")).toBe(false);
  });

  it("el OS programa los modelos en la ventana nocturna", () => {
    expect(politicaPorDefecto("os").modelos).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
  });
});
describe("decidir según el modo", () => {
  it("automatica-todas y manual no miran ni la hora ni la neurona", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, ctxBase)).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, ctxBase)).toBe("avisar");
  });

  it("automatica-esta solo aplica en la neurona elegida, si no avisa", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, ctxBase)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...ctxBase, esNeuronaElegida: true })).toBe("aplicar");
  });

  it("programada: aplicar dentro de la ventana [desdeH, hastaH), esperar fuera", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 10, hastaH: 14 } }, ctxBase)).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 10, hastaH: 14 } }, { ...ctxBase, ahoraH: 10 })).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 10, hastaH: 14 } }, { ...ctxBase, ahoraH: 14 })).toBe("esperar");
  });
});
describe("aprobación (grupo democrático, contrato §4)", () => {
  const d: PoliticaCapa = { modo: "automatica-todas" };

  it("sin aprobación cuando se requiere: siempre esperar, sea cual sea la capa o la hora", () => {
    const c: ContextoDecision = { ...ctxBase, esNeuronaElegida: true, requiereAprobacion: true };
    expect(decidirPolitica(d, c)).toBe("esperar");
    expect(decidirPolitica({ modo: "automatica-esta" }, c)).toBe("esperar");
    expect(decidirPolitica({ modo: "manual" }, c)).toBe("esperar");
    expect(
      decidirPolitica({ modo: "programada", ventana: { desdeH: 12, hastaH: 14 } }, { ...ctxBase, requiereAprobacion: true }),
    ).toBe("esperar");
  });

  it("aprobada llega por votación y entonces lo automático se aplica", () => {
    const c: ContextoDecision = { ...ctxBase, requiereAprobacion: true, aprobada: true };
    expect(decidirPolitica(d, c)).toBe("aplicar");
    expect(decidirPolitica({ modo: "manual" }, c)).toBe("avisar");
  });

  it("sin necesidad de aprobación, la aprobación sobra y no cambia nada", () => {
    const c: ContextoDecision = { ...ctxBase, aprobada: true };
    expect(decidirPolitica(d, c)).toBe("aplicar");
  });

  it("programada fuera de ventana espera aunque la votación haya salido", () => {
    expect(
      decidirPolitica(
        { modo: "programada", ventana: { desdeH: 14, hastaH: 16 } },
        { ...ctxBase, requiereAprobacion: true, aprobada: true },
      ),
    ).toBe("esperar");
  });

  it("programada con ventana que cruza la medianoche", () => {
    const ventana: PoliticaCapa = { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } };
    expect(decidirPolitica(ventana, { ...ctxBase, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(ventana, { ...ctxBase, ahoraH: 2 })).toBe("aplicar");
    expect(decidirPolitica(ventana, { ...ctxBase, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(ventana, { ...ctxBase, ahoraH: 21 })).toBe("esperar");
  });

  it("programada sin ventana válida usa la nocturna por defecto", () => {
    expect(decidirPolitica({ modo: "programada" }, { ...ctxBase, ahoraH: 3 })).toBe("aplicar");
    expect(decidirPolitica({ modo: "programada" }, { ...ctxBase, ahoraH: 12 })).toBe("esperar");
  });
});

describe("atajo democrático: tipo → requiere votación", () => {
  it("marcar y aplicar van juntos para un grupo democrático", () => {
    const tipo = "grupo-democratico" as TipoEntidad;
    const c: ContextoDecision = { ...ctxBase, requiereAprobacion: requiereAprobacion(tipo) };
    expect(decidirPolitica({ modo: "automatica-todas" }, c)).toBe("esperar");
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...c, aprobada: true })).toBe("aplicar");
  });
});

describe("sanear: lo que llega del almacenamiento", () => {
  it("basura total → todo manual", () => {
    const p = sanearPolitica(null);
    expect(Object.values(p).every((c) => c.modo === "manual")).toBe(true);
    expect(Object.keys(p)).toEqual(["datos", "interfaz", "sw", "servicios", "modelos", "nativa"]);
  });

  it("modo desconocido o tipos malolleantes → manual; lo válido se conserva", () => {
    const p = sanearPolitica({
      datos: { modo: "magia" },
      interfaz: { modo: "automatica-todas" },
      sw: { modo: "automatica-esta" },
      servicios: { modo: "manual" },
    });
    expect(p.datos.modo).toBe("manual");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
  });

  it("programada sin ventana o con horas absurdas → ventana nocturna", () => {
    expect(sanearPolitica({ modelos: { modo: "programada" } }).modelos).toEqual({
      modo: "programada",
      ventana: VENTANA_NOCTURNA,
    });
    expect(
      sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 30, hastaH: -1 } } }).modelos,
    ).toEqual({ modo: "programada", ventana: VENTANA_NOCTURNA });
  });

  it("ventana válida y cruce de medianoche se conservan tal cual", () => {
    const p = sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } } });
    expect(p.modelos.ventana).toEqual({ desdeH: 22, hastaH: 4 });
  });

  it("resumen por capas de una política democrática sin votar", () => {
    expect(resumenPolitica(politicaPorDefecto("grupo-democratico"))).toBe("3 capas automáticas · 3 con aviso");
  });
});
