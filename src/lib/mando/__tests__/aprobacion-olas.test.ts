import { describe, it, expect } from "vitest";
import { necesitaVotacion, propuestaDeOla, capacidadesAprobadas } from "../aprobacion-olas";
import type { TareaOla, Ola, Autor } from "../aprobacion-olas";

const ahoraMs = 1_000_000_000_000;

function baseOla(extra?: Partial<Ola>): Ola {
  return {
    nombre: "test-ola",
    tareas: [
      { id: "t1", ola: "test-ola", titulo: "Tarea 1", dependencias: [] },
      { id: "t2", ola: "test-ola", titulo: "Tarea 2", dependencias: [], archivos: ["src/a.ts"] },
    ],
    ...extra,
  };
}

function baseAutor(extra?: Partial<Autor>): Autor {
  return {
    id: "autor1",
    nombre: "Autor Test",
    ...extra,
  };
}

function basePropuesta(extra?: Partial<{ capacidad: string; estado: string; venceMs?: number }>): any {
  return {
    capacidad: "lanzar-olas",
    estado: "abierta",
    ...extra,
  };
}

const capacidadesRequierenVotacion = ["lanzar-olas", "publicar", "gestionar-motores", "usar-apis"] as const;

const capacidadesNoRequierenVotacion = ["ver-resumen", "ver-detalle", "chatear", "encolar", "aprobar", "gestionar-accesos", "frenar", "administrar"] as const;

describe("necesitaVotacion", () => {
  describe("modo jerárquico", () => {
    const ambitoModo = "jerarquico";

    it("no necesita votación en modo jerárquico para lanzar-olas (sin aprobar)", () => {
      expect(necesitaVotacion(ambitoModo, "lanzar-olas")).toBe(false);
    });

    it("no necesita votación en modo jerárquico para publicar (sin aprobar)", () => {
      expect(necesitaVotacion(ambitoModo, "publicar")).toBe(false);
    });

    capacidadesNoRequierenVotacion.forEach(capacidad => {
      it(`no necesita votación en modo jerárquico para ${capacidad}`, () => {
        expect(necesitaVotacion(ambitoModo, capacidad)).toBe(false);
      });
    });
  });

  describe("modo democrático", () => {
    const ambitoModo = "democratico";

    it("necesita votación para lanzar-olas (sin aprobar)", () => {
      expect(necesitaVotacion(ambitoModo, "lanzar-olas")).toBe(true);
    });

    it("necesita votación para publicar (sin aprobar)", () => {
      expect(necesitaVotacion(ambitoModo, "publicar")).toBe(true);
    });

    it("necesita votación para gestionar-motores (sin aprobar)", () => {
      expect(necesitaVotacion(ambitoModo, "gestionar-motores")).toBe(true);
    });

    it("necesita votación para usar-apis (sin aprobar)", () => {
      expect(necesitaVotacion(ambitoModo, "usar-apis")).toBe(true);
    });

    capacidadesNoRequierenVotacion.forEach(capacidad => {
      it(`no necesita votación para ${capacidad} en modo democrático`, () => {
        expect(necesitaVotacion(ambitoModo, capacidad)).toBe(false);
      });
    });

    it("no necesita votación si ya está aprobada", () => {
      expect(necesitaVotacion(ambitoModo, "lanzar-olas", true)).toBe(false);
    });
  });
});

describe("propuestaDeOla", () => {
  const ambito = "group";
  const ola = baseOla();
  const autor = baseAutor();

  it("genera un título y descripción básicos", () => {
    const resultado = propuestaDeOla(ambito, ola, autor);
    expect(resultado.titulo).toBe("Propuesta de ola test-ola");
    expect(resultado.descripcion).toContain("Propuesto por Autor Test");
  });

  it("incluye archivos tocados", () => {
    const resultado = propuestaDeOla(ambito, ola, autor);
    expect(resultado.descripcion).toContain("src/a.ts");
  });

  it("indica que no usa proveedores de pago por defecto", () => {
    const resultado = propuestaDeOla(ambito, ola, autor);
    expect(resultado.descripcion).toContain("Usa proveedores de pago: no");
  });

  it("no incluye prompts completos", () => {
    const resultado = propuestaDeOla(ambito, ola, autor);
    expect(resultado.descripcion).not.toContain("prompt:", { exact: false });
  });
});

describe("capacidadesAprobadas", () => {
  const ahoraMs = 1_000_000_000_000;

  it("retorna capacidades con estado aprobado", () => {
    const propuestas = [
      basePropuesta({ capacidad: "lanzar-olas", estado: "aprobada" }),
      basePropuesta({ capacidad: "publicar", estado: "abierta" }),
      basePropuesta({ capacidad: "gestionar-motores", estado: "aprobada" }),
    ];

    const resultado = capacidadesAprobadas(propuestas, ahoraMs);
    expect(resultado).toEqual(["lanzar-olas", "gestionar-motores"]);
  });

  it("excluye propuestas rechazadas", () => {
    const propuestas = [
      basePropuesta({ capacidad: "lanzar-olas", estado: "rechazada" }),
      basePropuesta({ capacidad: "publicar", estado: "aprobada" }),
    ];

    const resultado = capacidadesAprobadas(propuestas, ahoraMs);
    expect(resultado).toEqual(["publicar"]);
  });

  it("excluye propuestas caducadas", () => {
    const propuestas = [
      basePropuesta({ capacidad: "lanzar-olas", estado: "aprobada", venceMs: ahoraMs - 1000 }),
      basePropuesta({ capacidad: "publicar", estado: "aprobada", venceMs: ahoraMs + 1000 }),
    ];

    const resultado = capacidadesAprobadas(propuestas, ahoraMs);
    expect(resultado).toEqual(["publicar"]);
  });

  it("incluye propuestas aprobadas sin fecha de vencimiento", () => {
    const propuestas = [
      basePropuesta({ capacidad: "lanzar-olas", estado: "aprobada" }),
    ];

    const resultado = capacidadesAprobadas(propuestas, ahoraMs);
    expect(resultado).toEqual(["lanzar-olas"]);
  });

  it("excluye propuestas caducadas por defecto", () => {
    const propuestas = [
      basePropuesta({ capacidad: "lanzar-olas", estado: "aprobada", venceMs: ahoraMs - 1000 }),
    ];

    const resultado = capacidadesAprobadas(propuestas, ahoraMs);
    expect(resultado).toEqual([]);
  });
});
