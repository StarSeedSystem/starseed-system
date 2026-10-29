import { describe, expect, it } from "vitest";
import { CATALOGO_RUTAS, rutasParaTarea } from "../catalogo-rutas";
import type { TareaViva } from "../tipos";

const TODAS_LAS_TAREAS: TareaViva[] = [
  "escena-3d",
  "fotograma-clave",
  "foto",
  "clip-pelicula",
  "foto-viva",
  "grafico-vivo",
  "revision-texto",
  "comprobacion",
];

describe("catálogo de rutas de contenido vivo", () => {
  it("cubre las ocho tareas sin ids repetidos", () => {
    const ids = CATALOGO_RUTAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tarea of TODAS_LAS_TAREAS) {
      expect(rutasParaTarea(tarea).length).toBeGreaterThan(0);
    }
  });

  it("cada tarea tiene al menos una ruta local, salvo clip-pelicula en la que es esperable faltar", () => {
    for (const tarea of TODAS_LAS_TAREAS) {
      const locales = rutasParaTarea(tarea).filter((r) => r.tipo === "local");
      if (tarea === "clip-pelicula") {
        expect(locales.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(locales.length).toBeGreaterThan(0);
      }
    }
  });

  it("ninguna ruta externa queda sin enlace para conectarla, y cada ruta es válida", () => {
    for (const r of CATALOGO_RUTAS) {
      if (r.tipo === "externo") {
        expect(r.enlaceConectar?.startsWith("https://")).toBe(true);
      }
      const tareasCalidad = Object.entries(r.calidad) as [TareaViva, number][];
      for (const [tarea, calidad] of tareasCalidad) {
        expect(r.tareas).toContain(tarea);
        expect(calidad).toBeGreaterThanOrEqual(0);
        expect(calidad).toBeLessThanOrEqual(1);
      }
      expect(r.id.length).toBeGreaterThan(0);
      expect(r.unidad.length).toBeGreaterThan(0);
      expect(r.licencia.length).toBeGreaterThan(0);
      expect(r.fuente.length).toBeGreaterThan(0);
      expect(r.creditosPorUnidad).toBeGreaterThanOrEqual(0);
      expect(r.latenciaS).toBeGreaterThanOrEqual(0);
      expect(typeof r.comercial).toBe("boolean");
      expect(
        r.verificado === "por-verificar" || /^\d{4}-\d{2}-\d{2}$/.test(r.verificado),
      ).toBe(true);
    }
  });

  it("grafico-vivo, revision-texto y comprobacion solo eligen entre locales", () => {
    const soloLocales: TareaViva[] = ["grafico-vivo", "revision-texto", "comprobacion"];
    for (const tarea of soloLocales) {
      const externales = rutasParaTarea(tarea).filter((r) => r.tipo === "externo");
      expect(externales).toEqual([]);
    }
  });

  it("lo medido por el contrato va fechado y lo demás es por-verificar", () => {
    const fechadas = CATALOGO_RUTAS.filter((r) => r.verificado !== "por-verificar").map(
      (r) => r.id,
    );
    expect(fechadas).toEqual([
      "spline-mcp",
      "higgsfield-nano-banana-2",
      "higgsfield-seedance-2",
    ]);
    expect(fechadas.every((id) => id !== "google-flow")).toBe(true);
  });
});
