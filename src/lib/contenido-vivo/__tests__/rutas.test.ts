/** Pruebas de la elección de ruta de «Contenido vivo» (CVV1028, tarea B). */
import { describe, expect, it } from "vitest";
import type { ContextoVivo } from "../rutas";
import { compararRutas, elegirRuta } from "../rutas";
import type { TareaViva } from "../tipos";

/** Contexto completo de partida, con los ajustes del contrato §4 por defecto. */
function contexto(extra: Partial<ContextoVivo> = {}): ContextoVivo {
  return {
    alcance: "perfil",
    conectados: [],
    cupoHoy: {},
    creditosDisponibles: 500,
    topeMes: 400,
    gastadoMes: 0,
    neurona: { gpu: true, capaz3d: true },
    ajustes: { localPrimero: true, externosPermitidos: true },
    ...extra,
  };
}

describe("compararRutas", () => {
  it("ordena del mejor al peor y deja a cero lo no disponible", () => {
    const candidatos = compararRutas("clip-pelicula", contexto());
    const puntuaciones = candidatos.map((c) => c.puntuacion);
    const ordenado = [...puntuaciones].sort((a, b) => b - a);
    expect(puntuaciones).toEqual(ordenado);
    const local = candidatos.find((c) => c.ruta.id === "clip-neurona-gpu");
    expect(local?.disponible).toBe(true);
  });

  it("sin conectar marca el motivo con el enlace para conectarlo", () => {
    const candidatos = compararRutas("escena-3d", contexto());
    const spline = candidatos.find((c) => c.ruta.id === "spline-mcp");
    expect(spline?.disponible).toBe(false);
    expect(spline?.motivoNoDisponible).toContain("https://mcp.spline.design/mcp");
    expect(spline?.puntuacion).toBe(0);
  });

  it("sin cupo hoy el servicio externo queda cerrado", () => {
    const candidatos = compararRutas(
      "clip-pelicula",
      contexto({ conectados: ["higgsfield"], cupoHoy: { higgsfield: 1 } }),
    );
    const sinCupo = candidatos.filter((c) => c.ruta.id.startsWith("higgsfield-seedance"));
    expect(sinCupo.length).toBeGreaterThan(0);
    expect(sinCupo.every((c) => !c.disponible && c.motivoNoDisponible?.startsWith("Sin cupo hoy"))).toBe(true);
  });

  it("con alcance personal toda externa queda cerrada por privacidad", () => {
    const candidatos = compararRutas(
      "foto",
      contexto({ alcance: "personal", conectados: ["higgsfield", "google"] }),
    );
    const externas = candidatos.filter((c) => c.ruta.tipo === "externo");
    expect(externas.length).toBeGreaterThan(0);
    expect(
      externas.every((c) => !c.disponible && c.motivoNoDisponible === "En alcance personal el contenido no sale de la neurona sin permiso"),
    ).toBe(true);
  });
});

describe("elegirRuta", () => {
  it("con alcance personal nunca elige una externa", () => {
    const tareas: TareaViva[] = ["escena-3d", "fotograma-clave", "foto", "clip-pelicula"];
    for (const tarea of tareas) {
      const eleccion = elegirRuta(
        tarea,
        contexto({ alcance: "personal", conectados: ["higgsfield", "google", "spline"] }),
      );
      if (eleccion) expect(eleccion.ruta.tipo).toBe("local");
    }
  });

  it("película fotorrealista con Higgsfield conectado y cupo elige Higgsfield", () => {
    const eleccion = elegirRuta(
      "clip-pelicula",
      contexto({ neurona: { gpu: false, capaz3d: false }, conectados: ["higgsfield"], cupoHoy: { higgsfield: 200 } }),
    );
    expect(eleccion?.ruta.id.startsWith("higgsfield-seedance")).toBe(true);
    expect(eleccion?.razon).toContain("Higgsfield Seedance");
  });

  it("gráfico vivo siempre local y sin candidatos externos", () => {
    const candidatos = compararRutas("grafico-vivo", contexto());
    expect(candidatos.length).toBe(1);
    const eleccion = elegirRuta("grafico-vivo", contexto({ ajustes: { localPrimero: false, externosPermitidos: true } }));
    expect(eleccion?.ruta.id).toBe("hyperframes-grafico-vivo");
  });

  it("devuelve null cuando nada está disponible", () => {
    expect(elegirRuta("foto", contexto({ neurona: { gpu: false, capaz3d: false } }))).toBeNull();
  });

  it("con localPrimero una local empatada gana a la mejor externa", () => {
    const eleccion = elegirRuta("escena-3d", contexto({ neurona: { gpu: true, capaz3d: false }, conectados: ["spline"], cupoHoy: { spline: 200 } }));
    expect(eleccion?.ruta.id).toBe("threejs-escena3d");
  });
});
