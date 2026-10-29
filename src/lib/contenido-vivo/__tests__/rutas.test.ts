import { describe, it, expect } from "vitest";
import { compararRutas, elegirRuta, type ContextoVivo, type AlcanceVivo } from "../rutas";
import { CATALOGO_RUTAS } from "../catalogo-rutas";

const BASE: ContextoVivo = {
  alcance: "publica",
  conectados: ["higgsfield", "spline"],
  cupoHoy: { higgsfield: 100, spline: 100 },
  creditosDisponibles: 6000,
  topeMes: 2000,
  gastadoMes: 0,
  neurona: { gpu: true, capaz3d: true },
  ajustes: { localPrimero: false, externosPermitidos: true },
};

describe("compararRutas / elegirRuta", () => {
  it("solo propone candidatos de la tarea pedida", () => {
    const candidatos = compararRutas("grafico-vivo", BASE);
    expect(candidatos.map((c) => c.ruta.id)).toEqual(["hyperframes-grafico-vivo"]);
    expect(candidatos[0].disponible).toBe(true);
    expect(candidatos[0].puntuacion).toBeCloseTo(0.9, 5);
  });

  it("deja en cero y explica las rutas no disponibles", () => {
    const contexto: ContextoVivo = { ...BASE, neurona: { gpu: false, capaz3d: false } };
    const local = compararRutas("foto", contexto).find((c) => c.ruta.id === "imagen-local-neurona");
    const externa = compararRutas("foto", contexto).find((c) => c.ruta.id === "higgsfield-nano-banana-2");
    expect(local?.disponible).toBe(false);
    expect(local?.puntuacion).toBe(0);
    expect(local?.motivoNoDisponible).toContain("GPU");
    expect(externa?.disponible).toBe(true);
    expect(externa?.razon).toContain("Externo");
  });

  it("aplica el coste relativo al tope del mes", () => {
    const candidatos = compararRutas("clip-pelicula", BASE);
    expect(
      candidatos.find((c) => c.ruta.id === "higgsfield-seedance-2-1080")?.puntuacion,
    ).toBeCloseTo(0.95 - 60 / 2000, 5);
  });

  it("nunca elige una externa, aunque el permiso esté activado", () => {
    const contexto: ContextoVivo = { ...BASE, alcance: "personal" };
    const elegida = elegirRuta("clip-pelicula", contexto);
    expect(elegida?.ruta.tipo).toBe("local");
    expect(elegida?.razon).toContain("Local");
    const externas = compararRutas("clip-pelicula", contexto).filter((c) => c.ruta.tipo === "externo");
    for (const candidato of externas) {
      expect(candidato.disponible).toBe(false);
      expect(candidato.puntuacion).toBe(0);
      expect(candidato.motivoNoDisponible).toContain("personal");
    }
  });

  it("devuelve null si además la neurona no puede y no hay locales", () => {
    const contexto: ContextoVivo = { ...BASE, alcance: "personal", neurona: { gpu: false, capaz3d: false } };
    expect(elegirRuta("clip-pelicula", contexto)).toBeNull();
  });

  it("propone el enlace para conectar si el servicio no está", () => {
    const contexto: ContextoVivo = { ...BASE, alcance: "perfil", conectados: ["google"] };
    const higgsfield = compararRutas("foto", contexto).find((c) => c.ruta.id === "higgsfield-nano-banana-2");
    expect(higgsfield?.disponible).toBe(false);
    expect(higgsfield?.motivoNoDisponible).toContain("Sin conectar");
    expect(higgsfield?.motivoNoDisponible).toContain("higgsfield.ai");
  });

  it("cierra el servicio si no le queda cupo hoy", () => {
    const contexto: ContextoVivo = { ...BASE, alcance: "perfil", cupoHoy: { spline: 200, higgsfield: 0, google: 20 } };
    const higgsfields = compararRutas("clip-pelicula", contexto).filter((c) => c.ruta.id.startsWith("higgsfield"));
    for (const candidato of higgsfields) {
      expect(candidato.disponible).toBe(false);
      expect(candidato.motivoNoDisponible).toContain("cupo");
    }
  });

  it("una película fotorrealista con Higgsfield conectado y cupo elige Higgsfield", () => {
    const elegida = elegirRuta("clip-pelicula", BASE);
    expect(elegida?.ruta.id).toBe("higgsfield-seedance-2-1080");
    expect(elegida?.razon).toContain("Externo");
  });

  it("una local a 0,1 o menos de la mejor externa gana", () => {
    const contexto: ContextoVivo = {
      ...BASE,
      neurona: { gpu: true, capaz3d: false },
      ajustes: { localPrimero: true, externosPermitidos: true },
    };
    const elegida = elegirRuta("escena-3d", contexto);
    expect(elegida?.ruta.id).toBe("threejs-escena3d");
    expect(elegida?.razon).toContain("Local");
  });

  it("sin `localPrimero` gana la mejor externa", () => {
    const contexto: ContextoVivo = {
      ...BASE,
      neurona: { gpu: false, capaz3d: false },
      ajustes: { localPrimero: false, externosPermitidos: true },
    };
    const disponibles = compararRutas("escena-3d", contexto).filter((c) => c.disponible);
    expect(disponibles[0].ruta.id).toBe("spline-mcp");
    const elegida = elegirRuta("escena-3d", contexto);
    expect(elegida?.ruta.id).toBe("spline-mcp");
  });

  it("no elige ninguna externa si los ajustes las prohíben", () => {
    const contexto: ContextoVivo = { ...BASE, ajustes: { localPrimero: false, externosPermitidos: false } };
    const elegida = elegirRuta("clip-pelicula", contexto);
    expect(elegida?.ruta.tipo).toBe("local");
    const comparadas = compararRutas("clip-pelicula", contexto);
    expect(comparadas.every((c) => c.ruta.tipo === "local" || !c.disponible)).toBe(true);
  });
});
