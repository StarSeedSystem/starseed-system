import { describe, it, expect } from "vitest";
import type { TareaViva } from "../tipos";
import { CATALOGO_RUTAS, TAREAS_VIVAS } from "../catalogo-rutas";

const porTarea = (tarea: TareaViva) =>
  CATALOGO_RUTAS.filter((ruta) => ruta.tareas.includes(tarea));

describe("catálogo de rutas de contenido vivo", () => {
  it("cubre todas las tareas del contrato", () => {
    expect(TAREAS_VIVAS).toHaveLength(8);
    for (const tarea of TAREAS_VIVAS) {
      expect(porTarea(tarea).length, tarea).toBeGreaterThan(0);
    }
  });

  it("da al menos una ruta local a cada tarea salvo clip-pelicula", () => {
    for (const tarea of TAREAS_VIVAS) {
      if (tarea === "clip-pelicula") continue;
      const locales = porTarea(tarea).filter((ruta) => ruta.tipo === "local");
      expect(locales.length, tarea).toBeGreaterThan(0);
    }
  });

  it("deja grafico-vivo, revision-texto y comprobacion solo en local", () => {
    const tareasSoloLocales: TareaViva[] = ["grafico-vivo", "revision-texto", "comprobacion"];
    for (const tarea of tareasSoloLocales) {
      const rutas = porTarea(tarea);
      expect(rutas.length, tarea).toBeGreaterThan(0);
      expect(rutas.every((ruta) => ruta.tipo === "local"), tarea).toBe(true);
    }
  });

  it("no deja ninguna ruta externa sin enlace para conectar", () => {
    const externas = CATALOGO_RUTAS.filter((ruta) => ruta.tipo === "externo");
    expect(externas.length).toBeGreaterThan(0);
    for (const ruta of externas) {
      expect(ruta.enlaceConectar, ruta.id).toBeTruthy();
      expect(ruta.privacidad, ruta.id).toBe("sale-de-la-neurona");
    }
  });

  it("usa identificadores únicos", () => {
    const ids = CATALOGO_RUTAS.map((ruta) => ruta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mantiene calidades, créditos y latencias en rango", () => {
    for (const ruta of CATALOGO_RUTAS) {
      expect(ruta.tareas.length, ruta.id).toBeGreaterThan(0);
      for (const tarea of ruta.tareas) {
        const calidad = ruta.calidad[tarea];
        expect(typeof calidad, `${ruta.id}:${tarea}`).toBe("number");
        expect(calidad, ruta.id).toBeGreaterThanOrEqual(0);
        expect(calidad, ruta.id).toBeLessThanOrEqual(1);
      }
      for (const clave of Object.keys(ruta.calidad)) {
        expect(ruta.tareas, ruta.id).toContain(clave);
      }
      expect(ruta.creditosPorUnidad, ruta.id).toBeGreaterThanOrEqual(0);
      expect(ruta.latenciaS, ruta.id).toBeGreaterThanOrEqual(0);
      const fechaValida = ruta.verificado === "por-verificar" || /^\d{4}-\d{2}-\d{2}$/.test(ruta.verificado);
      expect(fechaValida, ruta.id).toBe(true);
    }
  });

  it("no cobra créditos en las rutas locales", () => {
    for (const ruta of CATALOGO_RUTAS.filter((candidata) => candidata.tipo === "local")) {
      expect(ruta.creditosPorUnidad, ruta.id).toBe(0);
    }
  });

  it("marca como medido solo lo que el contrato da como medido", () => {
    const medidas = CATALOGO_RUTAS
      .filter((ruta) => ruta.verificado === "2026-10-28")
      .map((ruta) => ruta.id)
      .sort();
    expect(medidas).toEqual([
      "higgsfield-nano-banana-2",
      "higgsfield-seedance-2-1080",
      "higgsfield-seedance-2-720",
      "spline-mcp",
    ]);
  });

  it("lo medido por el contrato va fechado y lo demás es por-verificar", () => {
    const fechadas = CATALOGO_RUTAS
      .filter((ruta) => ruta.verificado !== "por-verificar")
      .map((ruta) => ruta.id);
    expect(fechadas).toEqual([
      "spline-mcp",
      "higgsfield-nano-banana-2",
      "higgsfield-seedance-2-720",
      "higgsfield-seedance-2-1080",
    ]);
    expect(fechadas).not.toContain("google-flow-imagen");
    expect(fechadas).not.toContain("google-flow-video");
    expect(CATALOGO_RUTAS.some((ruta) => ruta.verificado === "por-verificar")).toBe(true);
  });

  it("recoge los créditos y cupos medidos del contrato", () => {
    const buscar = (id: string) => CATALOGO_RUTAS.find((ruta) => ruta.id === id);
    expect(buscar("higgsfield-nano-banana-2")?.creditosPorUnidad).toBe(2);
    expect(buscar("higgsfield-seedance-2-720")?.creditosPorUnidad).toBe(30);
    expect(buscar("higgsfield-seedance-2-1080")?.creditosPorUnidad).toBe(60);
    expect(buscar("spline-mcp")?.creditosPorUnidad).toBe(8);
    expect(buscar("spline-mcp")?.unidad).toContain("200");
  });
});
