import { describe, it, expect } from "vitest";
import { necesitaVotacion, propuestaDeOla, capacidadesAprobadas } from "../aprobacion-olas";
import type { AmbitoMando, CapacidadAmbito } from "../ambito";
import type { TareaOla } from "../tipos";

describe("aprobacion-olas", () => {
  const ambitoDemo: AmbitoMando = { id: "a1", tipo: "persona", visibilidad: "privado", modo_gobierno: "democratico" };
  const ambitoJera: AmbitoMando = { id: "a2", tipo: "entidad", visibilidad: "publico", modo_gobierno: "jerarquico" };

  it("necesitaVotacion democrático sí para lanzar-olas", () => {
    expect(necesitaVotacion(ambitoDemo, "lanzar-olas")).toBe(true);
    expect(necesitaVotacion(ambitoDemo, "publicar")).toBe(true);
    expect(necesitaVotacion(ambitoDemo, "gestionar-motores")).toBe(true);
    expect(necesitaVotacion(ambitoDemo, "usar-apis")).toBe(true);
  });

  it("necesitaVotacion democrático no para frenar", () => {
    expect(necesitaVotacion(ambitoDemo, "frenar")).toBe(false);
    expect(necesitaVotacion(ambitoDemo, "ver-resumen")).toBe(false);
  });

  it("necesitaVotacion jerárquico nunca", () => {
    expect(necesitaVotacion(ambitoJera, "lanzar-olas")).toBe(false);
    expect(necesitaVotacion(ambitoJera, "publicar")).toBe(false);
  });

  it("capacidadesAprobadas filtra aprobadas no vencidas", () => {
    const ahora = new Date("2026-10-06T00:00:00Z");
    const props = [
      { capacidad: "lanzar-olas" as CapacidadAmbito, estado: "aprobada", vence: "2026-12-01" },
      { capacidad: "publicar" as CapacidadAmbito, estado: "aprobada", vence: "2026-01-01" },
      { capacidad: "gestionar-motores" as CapacidadAmbito, estado: "rechazada" },
      { capacidad: "usar-apis" as CapacidadAmbito, estado: "aprobada" },
    ];
    const res = capacidadesAprobadas(props, ahora);
    expect(res).toEqual(["lanzar-olas", "usar-apis"]);
  });

  it("propuestaDeOla genera borrador con resumen", () => {
    const tareas: TareaOla[] = [
      { id: "t1", ola: "ola-1", titulo: "T1", dependencias: [], archivos: ["src/a.ts"], descripcion: "Tarea uno" },
      { id: "t2", ola: "ola-1", titulo: "T2", dependencias: [], archivos: ["src/b.ts"] },
    ];
    const draft = propuestaDeOla(ambitoDemo, { nombre: "Ola 1", tareas }, "autor-1");
    expect(draft.title).toContain("Lanzar ola");
    expect(draft.description).toContain("Ola 1");
    expect(draft.description).toContain("2");
    expect(draft.command.type).toBe("set_config");
  });
});

