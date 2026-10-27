import { describe, expect, it } from "vitest";
import { CAPAS_ORDEN } from "../manifiesto";
import {
  VENTANA_NOCTURNA,
  decidirPolitica,
  politicaPorDefecto,
  sanearPolitica,
  type PoliticaCapa,
} from "../politica";

const ctx = { ahoraH: 12, esNeuronaElegida: false };
const capa = (modo: PoliticaCapa["modo"], ventana?: PoliticaCapa["ventana"]): PoliticaCapa => ({ modo, ventana });

describe("política de actualización por sistema y capa", () => {
  describe("decidirPolitica: un resultado por cada modo", () => {
    it("automatica-todas aplica siempre, sin mirar la hora ni la neurona", () => {
      expect(decidirPolitica(capa("automatica-todas"), ctx)).toBe("aplicar");
    });

    it("automatica-esta aplica solo en la neurona elegida", () => {
      const p = capa("automatica-esta");
      expect(decidirPolitica(p, { ...ctx, esNeuronaElegida: true })).toBe("aplicar");
      expect(decidirPolitica(p, ctx)).toBe("avisar");
    });

    it("manual avisa: nunca aplica sola", () => {
      expect(decidirPolitica(capa("manual"), { ...ctx, esNeuronaElegida: true })).toBe("avisar");
    });

    it("programada aplica dentro de la ventana [desdeH, hastaH) y espera fuera", () => {
      const p = capa("programada", { desdeH: 10, hastaH: 14 });
      expect(decidirPolitica(p, { ...ctx, ahoraH: 10 })).toBe("aplicar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 13 })).toBe("aplicar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 14 })).toBe("esperar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 9 })).toBe("esperar");
    });

    it("programada que cruza la medianoche aplica en las dos mitades (22→4)", () => {
      const p = capa("programada", { desdeH: 22, hastaH: 4 });
      expect(decidirPolitica(p, { ...ctx, ahoraH: 22 })).toBe("aplicar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 2 })).toBe("aplicar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 4 })).toBe("esperar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 21 })).toBe("esperar");
    });

    it("desdeH === hastaH es la ventana de las 24 h", () => {
      const p = capa("programada", { desdeH: 5, hastaH: 5 });
      for (const h of [0, 5, 12, 23]) expect(decidirPolitica(p, { ...ctx, ahoraH: h })).toBe("aplicar");
    });

    it("programada sin ventana declarada usa la nocturna (3→6)", () => {
      expect(VENTANA_NOCTURNA).toEqual({ desdeH: 3, hastaH: 6 });
      const p = capa("programada");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 3 })).toBe("aplicar");
      expect(decidirPolitica(p, { ...ctx, ahoraH: 6 })).toBe("esperar");
    });
  });

  describe("politicaPorDefecto según el tipo", () => {
    it("perfil: datos e interfaz automáticas en todas, sw solo en esta y el resto manual", () => {
      const p = politicaPorDefecto("perfil");
      expect(p.datos.modo).toBe("automatica-todas");
      expect(p.interfaz.modo).toBe("automatica-todas");
      expect(p.sw.modo).toBe("automatica-esta");
      expect(p.servicios.modo).toBe("manual");
      expect(p.modelos.modo).toBe("manual");
      expect(p.nativa.modo).toBe("manual");
    });

    it("pagina, grupo, comunidad, estudio y evento nacen con la política del perfil", () => {
      const base = politicaPorDefecto("perfil");
      for (const t of ["pagina", "grupo", "comunidad", "estudio", "evento"] as const)
        expect(politicaPorDefecto(t)).toEqual(base);
    });

    it("las capas salen en el orden del manifiesto, no del objeto escrito", () => {
      expect(Object.keys(politicaPorDefecto("perfil"))).toEqual(CAPAS_ORDEN);
    });

    it("el OS baja los modelos grandes en la ventana nocturna", () => {
      const p = politicaPorDefecto("os");
      expect(p.modelos).toEqual({ modo: "programada", ventana: { desdeH: 3, hastaH: 6 } });
      expect(p.datos.modo).toBe("automatica-todas");
    });
  });

  describe("sanearPolitica", () => {
    it("conserva lo válido de cada capa y deja las capas en orden", () => {
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

    it("conserva una ventana válida que cruza la medianoche", () => {
      const modelos = sanearPolitica({ modelos: { modo: "programada", ventana: { desdeH: 22, hastaH: 4 } } }).modelos;
      expect(modelos).toEqual({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } });
    });

    it("rellena con manual lo que falte o venga mal", () => {
      const p = sanearPolitica({ sw: { modo: "a lo bestia" } });
      expect(p.sw.modo).toBe("manual");
      for (const c of ["datos", "interfaz", "servicios", "modelos", "nativa"] as const) expect(p[c].modo).toBe("manual");
    });

    it("basura sin capas (ni siquiera objeto) cae en manual sin lanzar", () => {
      for (const basura of [null, undefined, 7, "algo", ["datos"]]) {
        const p = sanearPolitica(basura);
        expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
        for (const c of CAPAS_ORDEN) expect(p[c].modo).toBe("manual");
      }
    });

    it("programada con ventana rota (horas fuera de rango o incompleta) cae en la nocturna", () => {
      for (const ventana of [undefined, {}, { desdeH: 3 }, { desdeH: 25, hastaH: 6 }, { desdeH: 3, hastaH: -1 }]) {
        const p = sanearPolitica({ modelos: { modo: "programada", ventana } }).modelos;
        expect(p).toEqual({ modo: "programada", ventana: { desdeH: 3, hastaH: 6 } });
      }
    });

    it("ignora capas desconocidas y no se las pasa por buenas", () => {
      const p = sanearPolitica({ widgets: { modo: "automatica-todas" }, datos: { modo: "automatica-todas" } });
      expect(Object.keys(p)).toEqual(CAPAS_ORDEN);
      expect(p.datos.modo).toBe("automatica-todas");
      expect(Object.keys(p)).not.toContain("widgets");
    });
  });
});
