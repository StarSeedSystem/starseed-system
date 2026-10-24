import { describe, expect, it } from "vitest";
import {
  decidirPolitica,
  politicaPorDefecto,
  resumenPolitica,
  sanearPolitica,
  type ContextoDecision,
  type PoliticaCapa,
} from "../politica";

const base: ContextoDecision = { ahoraH: 12, esNeuronaElegida: false };
const prog = (desdeH: number, hastaH: number): PoliticaCapa => ({ modo: "programada", ventana: { desdeH, hastaH } });

describe("política: decidir por modo", () => {
  it("automatica-todas aplica sin más", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, base)).toBe("aplicar");
  });

  it("automatica-esta aplica solo en la neurona elegida; en las demás, avisar", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, base)).toBe("avisar");
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...base, esNeuronaElegida: true })).toBe("aplicar");
  });

  it("manual avisa, nunca aplica", () => {
    expect(decidirPolitica({ modo: "manual" }, base)).toBe("avisar");
    expect(decidirPolitica({ modo: "manual" }, { ...base, esNeuronaElegida: true })).toBe("avisar");
  });
});

describe("política: ventana programada", () => {
  it("aplica dentro de [desdeH, hastaH) y espera fuera", () => {
    expect(decidirPolitica(prog(10, 14), base)).toBe("aplicar");
    expect(decidirPolitica(prog(10, 14), { ...base, ahoraH: 13 })).toBe("aplicar");
    expect(decidirPolitica(prog(10, 14), { ...base, ahoraH: 14 })).toBe("esperar");
    expect(decidirPolitica(prog(10, 14), { ...base, ahoraH: 3 })).toBe("esperar");
  });

  it("cruce de medianoche: desdeH > hastaH aplica en las dos orillas", () => {
    const v = prog(22, 4);
    expect(decidirPolitica(v, { ...base, ahoraH: 22 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...base, ahoraH: 23 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...base, ahoraH: 2 })).toBe("aplicar");
    expect(decidirPolitica(v, { ...base, ahoraH: 4 })).toBe("esperar");
    expect(decidirPolitica(v, { ...base, ahoraH: 10 })).toBe("esperar");
  });

  it("ventana de 24 h (desdeH = hastaH) aplica a cualquier hora", () => {
    expect(decidirPolitica(prog(5, 5), { ...base, ahoraH: 17 })).toBe("aplicar");
    expect(decidirPolitica(prog(0, 0), { ...base, ahoraH: 0 })).toBe("aplicar");
  });
});

describe("política: aprobación previa (grupo democrático)", () => {
  it("sin aprobación exige esperar, aunque la capa sea automática en todas", () => {
    const ctx: ContextoDecision = { ...base, requiereAprobacion: true, aprobada: false };
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("esperar");
    expect(decidirPolitica(prog(10, 14), { ...ctx, ahoraH: 12 })).toBe("esperar");
    expect(decidirPolitica({ modo: "manual" }, ctx)).toBe("esperar");
  });

  it("aprobada o sin requisito: decide la política de la capa como siempre", () => {
    const ctx: ContextoDecision = { ...base, requiereAprobacion: true, aprobada: true };
    expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("aplicar");
    expect(decidirPolitica({ modo: "automatica-esta" }, ctx)).toBe("avisar");
    expect(decidirPolitica(prog(10, 14), { ...ctx, ahoraH: 15 })).toBe("esperar");
  });
});

describe("política: por defecto según el tipo", () => {
  it("perfil y grupo: datos e interfaz automáticas, sw solo en esta, el resto avisa", () => {
    for (const tipo of ["perfil", "grupo"] as const) {
      const p = politicaPorDefecto(tipo);
      expect([p.datos.modo, p.interfaz.modo]).toEqual(["automatica-todas", "automatica-todas"]);
      expect(p.sw.modo).toBe("automatica-esta");
      expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
    }
  });

  it("página pública: también el sw sigue la rama estable sola", () => {
    const p = politicaPorDefecto("pagina");
    expect([p.datos.modo, p.interfaz.modo, p.sw.modo]).toEqual(["automatica-todas", "automatica-todas", "automatica-todas"]);
    expect([p.servicios.modo, p.modelos.modo, p.nativa.modo]).toEqual(["manual", "manual", "manual"]);
  });

  it("el OS programa los modelos en la ventana nocturna", () => {
    const p = politicaPorDefecto("os");
    expect(p.modelos).toEqual({ modo: "programada", ventana: { desdeH: 3, hastaH: 6 } });
  });

  it("devuelve copias: lo que cambia no toca la política de fábrica", () => {
    const p = politicaPorDefecto("os");
    p.modelos.ventana!.desdeH = 12;
    p.datos.modo = "manual";
    expect(politicaPorDefecto("os").modelos.ventana!.desdeH).toBe(3);
    expect(politicaPorDefecto("os").datos.modo).toBe("automatica-todas");
  });

  it("resumen corto por tipo", () => {
    expect(resumenPolitica(politicaPorDefecto("perfil"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("pagina"))).toBe("3 capas automáticas · 3 con aviso");
  });
});

describe("política: sanear lo que llega del almacenamiento", () => {
  it("basura → manual en todas las capas", () => {
    const p = sanearPolitica(null);
    for (const capa of Object.keys(p)) expect(p[capa as keyof typeof p].modo).toBe("manual");
    expect(sanearPolitica("ni-política")).toEqual(sanearPolitica(undefined));
  });

  it("modo desconocido o ventana inválida: capa manual o nocturna por defecto", () => {
    const p = sanearPolitica({
      interfaz: { modo: "magia" },
      modelos: { modo: "programada", ventana: { desdeH: 30, hastaH: -2 } },
    });
    expect(p.interfaz.modo).toBe("manual");
    expect(p.modelos).toEqual({ modo: "programada", ventana: { desdeH: 3, hastaH: 6 } });
  });

  it("lo bueno se conserva con su ventana y las capas que faltan se rellenan", () => {
    const p = sanearPolitica({ datos: { modo: "automatica-todas", ventana: { desdeH: 9, hastaH: 99 } } });
    expect(p.datos).toEqual({ modo: "automatica-todas" }); // ventana que no procede, no se guarda
    expect(sanearPolitica({}).sw.modo).toBe("manual");
    expect(Object.keys(sanearPolitica({}))).toEqual(Object.keys(politicaPorDefecto("perfil")));
  });
});
