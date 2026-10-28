import { describe, it, expect } from "vitest";
import type { TareaViva } from "../tipos";
import {
  RUTAS,
  TAREAS_VIVAS,
  esConectable,
  rutaPorId,
  rutasDeTarea,
  rutasLocalesDe,
} from "../catalogo-rutas";

const VERIFICADO = /^\d{4}-\d{2}-\d{2}$|^por-verificar$/;

describe("catálogo de rutas del contenido vivo", () => {
  it("cubre las ocho tareas sin repetir identificadores", () => {
    expect(TAREAS_VIVAS).toHaveLength(8);
    expect(new Set(TAREAS_VIVAS).size).toBe(8);
    expect(new Set(RUTAS.map((ruta) => ruta.id)).size).toBe(RUTAS.length);
  });

  it("describe cada ruta con datos válidos", () => {
    for (const ruta of RUTAS) {
      expect(ruta.tareas.length).toBeGreaterThan(0);
      expect(ruta.creditosPorUnidad).toBeGreaterThanOrEqual(0);
      expect(ruta.latenciaS).toBeGreaterThanOrEqual(0);
      expect(VERIFICADO.test(ruta.verificado)).toBe(true);
      expect(ruta.unidad.trim().length).toBeGreaterThan(0);
      expect(ruta.fuente.trim().length).toBeGreaterThan(0);
      for (const tarea of ruta.tareas) {
        expect(TAREAS_VIVAS).toContain(tarea);
        const calidad = ruta.calidad[tarea];
        expect(calidad).toBeGreaterThanOrEqual(0);
        expect(calidad).toBeLessThanOrEqual(1);
      }
      if (ruta.tipo === "local") {
        expect(ruta.privacidad).toBe("local");
        expect(ruta.creditosPorUnidad).toBe(0);
      } else {
        expect(ruta.privacidad).toBe("sale-de-la-neurona");
      }
    }
  });

  it("da al menos una ruta local a cada tarea salvo clip-pelicula", () => {
    for (const tarea of TAREAS_VIVAS) {
      if (tarea === "clip-pelicula") continue;
      expect(rutasLocalesDe(tarea).length).toBeGreaterThan(0);
    }
  });

  it("mantiene en local los gráficos, la revisión y la comprobación", () => {
    const tareas: TareaViva[] = ["grafico-vivo", "revision-texto", "comprobacion"];
    for (const tarea of tareas) {
      const rutas = rutasDeTarea(tarea);
      expect(rutas.length).toBeGreaterThan(0);
      expect(rutas.every((ruta) => ruta.tipo === "local")).toBe(true);
    }
  });

  it("solo ofrece rutas externas con enlace para conectar", () => {
    const externas = RUTAS.filter((ruta) => ruta.tipo === "externo");
    expect(externas.length).toBeGreaterThan(0);
    for (const ruta of externas) {
      expect(ruta.enlaceConectar).toBeTruthy();
      expect(esConectable(ruta)).toBe(true);
    }
  });

  it("refleja los créditos y cupos medidos del contrato", () => {
    expect(rutaPorId("spline-mcp")?.cupo).toEqual({ porDia: 200, reinicio: "00:00 UTC" });
    expect(rutaPorId("higgsfield-nano-banana-2")?.creditosPorUnidad).toBe(2);
    expect(rutaPorId("higgsfield-seedance-2")?.creditosPorUnidad).toBe(60);
    const grafico = rutaPorId("hiperframes-grafico");
    expect(grafico?.creditosPorUnidad).toBe(0);
    expect(grafico?.calidad["grafico-vivo"]).toBeGreaterThan(0);
  });

  it("marca con fecha solo lo que el contrato da por medido", () => {
    const medidos = [
      "spline-mcp",
      "higgsfield-nano-banana-2",
      "higgsfield-seedance-2",
      "hiperframes-grafico",
    ];
    for (const id of medidos) {
      expect(rutaPorId(id)?.verificado).toBe("2026-10-28");
    }
    for (const ruta of RUTAS.filter((candidata) => !medidos.includes(candidata.id))) {
      expect(ruta.verificado).toBe("por-verificar");
    }
  });

  it("responde a las consultas por tarea e identificador", () => {
    expect(rutasDeTarea("escena-3d").length).toBeGreaterThanOrEqual(3);
    expect(rutasLocalesDe("escena-3d").length).toBeGreaterThanOrEqual(2);
    expect(rutaPorId("no-existe")).toBeUndefined();
    const sinEnlace = { ...RUTAS[0], tipo: "externo" as const, enlaceConectar: "  " };
    expect(esConectable(sinEnlace)).toBe(false);
  });
});
