import { describe, it, expect } from "vitest";

import { necesitaVotacion, propuestaDeOla, capacidadesAprobadas } from "../aprobacion-olas";

describe("necesitaVotacion", () => {
  it("devuelve true solo para las cuatro capacidades en ámbito democrático", () => {
    expect(necesitaVotacion("democratico", "lanzar-olas")).toBe(true);
    expect(necesitaVotacion("democratico", "publicar")).toBe(true);
    expect(necesitaVotacion("democratico", "gestionar-motores")).toBe(true);
    expect(necesitaVotacion("democratico", "usar-apis")).toBe(true);
    expect(necesitaVotacion("democratico", "ver")).toBe(false);
    expect(necesitaVotacion("hierarquico", "lanzar-olas")).toBe(false);
    expect(necesitaVotacion("", "lanzar-olas")).toBe(false);
  });
});

describe("propuestaDeOla", () => {
  it("devuelve null sin capacidades relevantes", () => {
    const ola = {
      nombre: "test",
      tareas: [
        { id: "t1", archivos: ["README.md"] },
        { id: "t2", archivos: ["other.js"] },
      ],
    };
    const result = propuestaDeOla("hierarquico", ola, "autor@example.com");
    expect(result).toBeNull();
  });

  it("arma un draft con las cuatro capacidades en modo democrático", () => {
    const ola = {
      nombre: "democratic-test",
      tareas: [
        { id: "t1", archivos: ["lanzar-olas"] },
        { id: "t2", archivos: ["publicar"] },
        { id: "t3", archivos: ["gestionar-motores"] },
        { id: "t4", archivos: ["usar-apis"] },
      ],
    };
    const result = propuestaDeOla("democratico", ola, "autor@example.com");
    expect(result).not.toBeNull();
    expect(result!.title).toContain("Lanzamiento de ola");
    expect(result!.description).toContain("Lanzar olas");
    expect(result!.description).toContain("Publicar");
    expect(result!.description).toContain("Gestionar motores");
    expect(result!.description).toContain("Usar APIs");
    expect(result!.description).toContain("democrático");
    expect(result!.description).toContain("democratic-test");
  });

  it("extrae archivos únicos de todas las tareas", () => {
    const ola = {
      nombre: "unique-files",
      tareas: [
        { id: "t1", archivos: ["lanzar-olas", "publicar"] },
        { id: "t2", archivos: ["lanzar-olas", "gestionar-motores"] },
      ],
    };
    const result = propuestaDeOla("democratico", ola, "autor@example.com");
    expect(result).not.toBeNull();
    expect(result!.description).toContain("3 archivos únicos tocados.");
  });
});

describe("capacidadesAprobadas", () => {
  const AHORA_MS = new Date("2026-09-13T21:00:00").getTime();

  it("incluye solo las aprobadas y no vencidas", () => {
    const propuestas = [
      { capacidad: "lanzar-olas", estado: "aprobada" },
      { capacidad: "publicar", estado: "rechazada" },
      { capacidad: "gestionar-motores", estado: "aprobada", vence: new Date(AHORA_MS + 60 * 60 * 1000).toISOString() },
      { capacidad: "usar-apis", estado: "aprobada", vence: new Date(AHORA_MS - 60 * 60 * 1000).toISOString() },
    ];
    const result = capacidadesAprobadas(propuestas, AHORA_MS);
    expect(result).toEqual(["lanzar-olas", "gestionar-motores"]);
  });

  it("excluye las rechazadas incluso si tienen vencimiento futuro", () => {
    const propuestas = [
      { capacidad: "lanzar-olas", estado: "rechazada", vence: new Date(AHORA_MS + 60 * 60 * 1000).toISOString() },
      { capacidad: "publicar", estado: "aprobada" },
    ];
    const result = capacidadesAprobadas(propuestas, AHORA_MS);
    expect(result).toEqual(["publicar"]);
  });

  it("devuelve array vacío cuando no hay aprobadas", () => {
    const propuestas = [
      { capacidad: "lanzar-olas", estado: "rechazada" },
      { capacidad: "publicar", estado: "expirada", vence: new Date(AHORA_MS - 60 * 60 * 1000).toISOString() },
    ];
    const result = capacidadesAprobadas(propuestas, AHORA_MS);
    expect(result).toEqual([]);
  });
});
