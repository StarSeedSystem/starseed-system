import { describe, it, expect } from "vitest";
import { leccionesDe, type LeccionesEntrada } from "../lecciones";

function entrada(parcial: Partial<LeccionesEntrada> = {}): LeccionesEntrada {
  return {
    perfilId: "astra",
    cerebroId: "cerebro-1",
    objeciones: [
      { id: "o1", gravedad: "bloquea", texto: "La respuesta no cita la fuente", pez: "pez-7b" },
      { id: "o2", gravedad: "importa", texto: "El plan omite el paso de prueba", pez: "pez-8b" },
      { id: "o3", gravedad: "menor", texto: "Falta un punto final" },
    ],
    resueltas: [{ objecionId: "o1", correccion: "Se añadió el enlace a la fuente" }],
    rechazadas: [{ objecionId: "o2", porque: "El paso de prueba va en la cola, no en el plan" }],
    fecha: "2026-11-05",
    ...parcial,
  };
}

describe("leccionesDe", () => {
  it("convierte 3 objeciones en 2 lecciones (las menor no se guardan)", () => {
    const lecciones = leccionesDe(entrada());
    expect(lecciones).toHaveLength(2);
  });

  it("cada lección lleva etiqueta leccion y egm", () => {
    const lecciones = leccionesDe(entrada());
    for (const leccion of lecciones) {
      expect(leccion.kinds).toContain("leccion");
      expect(leccion.kinds).toContain("egm");
    }
  });

  it("la lección resuelta guarda la objeción y la corrección en su texto", () => {
    const lecciones = leccionesDe(entrada());
    const resuelta = lecciones.find((l) => l.content?.includes("resuelta"));
    expect(resuelta).toBeDefined();
    expect(resuelta!.content).toContain("La respuesta no cita la fuente");
    expect(resuelta!.content).toContain("Se añadió el enlace a la fuente");
    expect(resuelta!.content).toContain("bloquea");
    expect(resuelta!.content).toContain("2026-11-05");
  });

  it("la lección rechazada guarda la objeción y el porqué en su texto", () => {
    const lecciones = leccionesDe(entrada());
    const rechazada = lecciones.find((l) => l.content?.includes("rechazada"));
    expect(rechazada).toBeDefined();
    expect(rechazada!.content).toContain("El plan omite el paso de prueba");
    expect(rechazada!.content).toContain("El paso de prueba va en la cola, no en el plan");
  });

  it("sin cerebro no hay lecciones", () => {
    expect(leccionesDe(entrada({ cerebroId: "" }))).toHaveLength(0);
  });

  it("nada sale de una revisión sin objeciones serias resueltas ni rechazadas", () => {
    expect(leccionesDe(entrada({ resueltas: [], rechazadas: [] }))).toHaveLength(0);
  });
});
