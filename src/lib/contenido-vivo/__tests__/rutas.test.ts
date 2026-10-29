import { describe, it, expect } from "vitest";
import type { ContextoRutas } from "../rutas";
import { compararRutas, elegirRuta } from "../rutas";

/** Contexto base: neurona sin GPU ni 3D, externos permitidos y local primero. */
const contextoBase = (extra: Partial<ContextoRutas> = {}): ContextoRutas => ({
  alcance: "publica", conectados: [], cupoHoy: {},
  creditosDisponibles: 500, topeMes: 500, gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false, ...(extra.neurona ?? {}) },
  ajustes: { localPrimero: true, externosPermitidos: true, ...(extra.ajustes ?? {}) },
  ...extra,
});

describe("compararRutas", () => {
  it("marca como no disponible el alcance personal y nunca elige una externa", () => {
    const contexto = contextoBase({
      alcance: "personal",
      conectados: ["higgsfield"],
      cupoHoy: { higgsfield: 100 },
    });

    const externas = compararRutas("clip-pelicula", contexto)
      .filter((fila) => fila.ruta.tipo === "externo");

    expect(externas.length).toBeGreaterThan(0);
    expect(externas.every((fila) => !fila.disponible)).toBe(true);
    expect(elegirRuta("clip-pelicula", contexto)).toBeNull();
  });

  it("da motivo con el enlace cuando el servicio no está conectado", () => {
    const filas = compararRutas("foto", contextoBase());
    const higgsfield = filas.find((fila) => fila.ruta.id === "higgsfield-nano-banana-2")!;

    expect(higgsfield.disponible).toBe(false);
    expect(higgsfield.motivoNoDisponible).toContain("Sin conectar");
    expect(higgsfield.motivoNoDisponible).toContain("https://higgsfield.ai");
    expect(higgsfield.razon).toBe(higgsfield.motivoNoDisponible);
  });

  it("elige Higgsfield para una película fotorrealista si está conectado y con cupo", () => {
    const contexto = contextoBase({
      conectados: ["higgsfield"],
      cupoHoy: { higgsfield: 100 },
      creditosDisponibles: 1000,
      topeMes: 1000,
    });

    const elegida = elegirRuta("clip-pelicula", contexto);

    expect(elegida?.tipo).toBe("externo");
    expect(elegida?.nombre).toContain("Higgsfield");
  });

  it("elige siempre la ruta local para un gráfico vivo", () => {
    const contexto = contextoBase({
      conectados: ["spline", "higgsfield", "google-flow"],
      cupoHoy: { spline: 200, higgsfield: 500, "google-flow": 50 },
    });

    const elegida = elegirRuta("grafico-vivo", contexto);
    const filas = compararRutas("grafico-vivo", contexto);

    expect(elegida?.id).toBe("hyperframes-grafico-vivo");
    expect(elegida?.tipo).toBe("local");
    expect(elegida?.creditosPorUnidad).toBe(0);
    expect(filas.every((fila) => fila.ruta.tipo === "local")).toBe(true);
    expect(filas.every((fila) => fila.disponible)).toBe(true);
  });

  it("bloquea un externo conectado cuando el cupo de hoy no alcanza", () => {
    const contexto = contextoBase({ conectados: ["higgsfield"], cupoHoy: { higgsfield: 1 } });
    const higgsfield = compararRutas("foto", contexto)
      .find((fila) => fila.ruta.id === "higgsfield-nano-banana-2")!;

    expect(higgsfield.disponible).toBe(false);
    expect(higgsfield.motivoNoDisponible).toContain("cupo");
  });

  it("bloquea la ruta local cuando la neurona no tiene GPU", () => {
    const local = compararRutas("clip-pelicula", contextoBase())
      .find((fila) => fila.ruta.id === "clip-neurona-gpu")!;

    expect(local.disponible).toBe(false);
    expect(local.motivoNoDisponible).toContain("GPU");
  });

  it("bloquea los externos cuando los ajustes no los permiten", () => {
    const contexto = contextoBase({ conectados: ["higgsfield"], cupoHoy: { higgsfield: 100 },
      ajustes: { localPrimero: true, externosPermitidos: false } });
    const higgsfield = compararRutas("foto", contexto).find((f) => f.ruta.id === "higgsfield-nano-banana-2")!;
    expect(higgsfield.motivoNoDisponible).toContain("no están permitidos");
  });

  it("con localPrimero prefiere una local que queda a menos de 0,1 de la externa", () => {
    const extras: Partial<ContextoRutas> = {
      conectados: ["spline"],
      cupoHoy: { spline: 200 },
      creditosDisponibles: 1000,
      topeMes: 1000,
    };

    expect(elegirRuta("escena-3d", contextoBase(extras))?.id).toBe("threejs-escena3d");
    expect(
      elegirRuta("escena-3d", contextoBase({
        ...extras,
        ajustes: { localPrimero: false, externosPermitidos: true },
      }))?.id,
    ).toBe("spline-mcp");
  });

  it("deja en cero la puntuación de las rutas no disponibles y escribe la razón", () => {
    const filas = compararRutas("escena-3d", contextoBase());

    expect(filas.filter((fila) => !fila.disponible).every((fila) => fila.puntuacion === 0)).toBe(true);
    expect(filas.find((fila) => fila.ruta.id === "threejs-escena3d")?.razon).toContain("Local:");
    expect(filas.find((fila) => fila.ruta.id === "threejs-escena3d")?.razon).toContain("no gasta créditos");
  });
});
