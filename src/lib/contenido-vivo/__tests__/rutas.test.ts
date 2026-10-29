import { describe, it, expect } from "vitest";
import { EMPUJON_LOCAL, compararRutas, elegirRuta, type ContextoRutas } from "../rutas";

/** Pruebas de la elección de ruta del contenido vivo (CVV1028, tarea B): solo funciones puras. */

/** Contexto abierto por defecto; cada prueba cambia solo lo que le importa. */
const contexto = (extra: Partial<ContextoRutas> = {}): ContextoRutas => ({
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 1000,
  topeMes: 200,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false },
  ajustes: { localPrimero: true, externosPermitidos: true },
  ...extra,
});

const externa = (id: string) => {
  const candidato = compararRutas("escena-3d", contexto()).find((c) => c.ruta.id === id);
  if (!candidato) throw new Error(`falta la ruta ${id}`);
  return candidato;
};

describe("comparación de rutas de contenido vivo", () => {
  it("ordena de mejor a peor y deja a cero lo no disponible", () => {
    const lista = compararRutas("escena-3d", contexto());
    expect(lista.length).toBeGreaterThan(2);
    for (let i = 1; i < lista.length; i += 1) {
      if (lista[i - 1].disponible && lista[i].disponible) {
        expect(lista[i - 1].puntuacion).toBeGreaterThanOrEqual(lista[i].puntuacion);
      }
      if (!lista[i - 1].disponible) expect(lista[i - 1].puntuacion).toBe(0);
    }
    for (const candidato of lista.filter((c) => !c.disponible)) {
      expect(candidato.puntuacion).toBe(0);
      expect(candidato.motivoNoDisponible).toBeTruthy();
    }
  });

  it("sin conectar deja el motivo con el enlace para conectarlo", () => {
    const spline = externa("spline-mcp");
    expect(spline.disponible).toBe(false);
    expect(spline.motivoNoDisponible).toContain("No está conectado");
    expect(spline.motivoNoDisponible).toContain("https://mcp.spline.design/mcp");
    expect(spline.razon).toBe(spline.motivoNoDisponible);
  });

  it("el alcance personal nunca elige una ruta externa", () => {
    const personal = contexto({
      alcance: "personal",
      conectados: ["higgsfield-nano-banana-2", "google-flow-imagen"],
      neurona: { gpu: true, capaz3d: true },
    });
    const lista = compararRutas("foto", personal);
    for (const candidato of lista.filter((c) => c.ruta.tipo === "externo")) {
      expect(candidato.disponible, candidato.ruta.id).toBe(false);
      expect(candidato.motivoNoDisponible).toContain("personal");
    }
    expect(elegirRuta("foto", personal)?.ruta.tipo).toBe("local");
  });

  it("una película fotorrealista con Higgsfield conectado y cupo elige Higgsfield", () => {
    const pelicula = contexto({
      conectados: ["higgsfield-seedance-2-720", "higgsfield-seedance-2-1080"],
      cupoHoy: { "higgsfield-seedance-2-720": 4, "higgsfield-seedance-2-1080": 2 },
    });
    const lista = compararRutas("clip-pelicula", pelicula);
    const local = lista.find((c) => c.ruta.id === "clip-neurona-gpu");
    expect(local?.disponible).toBe(false);
    const elegida = elegirRuta("clip-pelicula", pelicula);
    expect(elegida?.ruta.id).toBe("higgsfield-seedance-2-720");
    expect(elegida?.razon).toContain("Higgsfield");
  });

  it("el gráfico vivo es siempre local y no gasta créditos", () => {
    const lista = compararRutas("grafico-vivo", contexto({ creditosDisponibles: 0 }));
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((c) => c.ruta.tipo === "local" && c.disponible)).toBe(true);
    const elegida = elegirRuta("grafico-vivo", contexto());
    expect(elegida?.ruta.id).toBe("hyperframes-grafico-vivo");
    expect(elegida?.puntuacion).toBeGreaterThan(0);
  });
});

describe("local primero, cupo y créditos", () => {
  it("con localPrimero una local a 0,1 o menos gana a la mejor externa", () => {
    const conSpline = contexto({ conectados: ["spline-mcp"] });
    const lista = compararRutas("escena-3d", conSpline);
    const local = lista.find((c) => c.ruta.id === "threejs-escena3d");
    const spline = lista.find((c) => c.ruta.id === "spline-mcp");
    expect(local?.disponible && spline?.disponible).toBe(true);
    expect((spline?.puntuacion ?? 0) - (local?.puntuacion ?? 0)).toBeLessThanOrEqual(EMPUJON_LOCAL);
    expect(elegirRuta("escena-3d", conSpline)?.ruta.id).toBe("threejs-escena3d");
  });

  it("sin localPrimero gana la externa con más puntuación", () => {
    const sinPreferencia = contexto({
      conectados: ["spline-mcp"],
      ajustes: { localPrimero: false, externosPermitidos: true },
    });
    expect(elegirRuta("escena-3d", sinPreferencia)?.ruta.id).toBe("spline-mcp");
  });

  it("sin cupo hoy o sin créditos la ruta externa no está disponible", () => {
    const sinCupo = contexto({
      conectados: ["higgsfield-nano-banana-2"],
      cupoHoy: { "higgsfield-nano-banana-2": 0 },
    });
    const porCupo = compararRutas("foto", sinCupo).find((c) => c.ruta.id === "higgsfield-nano-banana-2");
    expect(porCupo?.disponible).toBe(false);
    expect(porCupo?.motivoNoDisponible).toContain("cupo");

    const sinCreditos = contexto({ conectados: ["higgsfield-nano-banana-2"], creditosDisponibles: 0 });
    const porCredito = compararRutas("foto", sinCreditos).find((c) => c.ruta.id === "higgsfield-nano-banana-2");
    expect(porCredito?.disponible).toBe(false);
    expect(porCredito?.motivoNoDisponible).toContain("créditos");
  });
});
