import { describe, it, expect } from "vitest";

import {
  AREAS_REVISADAS,
  tocaRevisar,
  siguienteArea,
  promptRevisorArea,
  fusionarSugerencias,
  aTareaDeCola,
  type AreaRevisada,
} from "../mando/revisores-area";

import type { SugerenciaAstra } from "../mando/astra";

function sugerencia(parcial: Partial<SugerenciaAstra> & { id: string; titulo: string }): SugerenciaAstra {
  return {
    ambito: "diseno",
    porque: "",
    evidencia: [],
    impacto: 3,
    esfuerzo: 3,
    riesgo: 3,
    archivos: [],
    propuestaDeTarea: null,
    ...parcial,
  };
}

describe("Revisores continuos por área", () => {
  describe("AREAS_REVISADAS", () => {
    it("tiene al menos 8 áreas con id únicos, rutas y cadencia > 0", () => {
      expect(AREAS_REVISADAS.length).toBeGreaterThanOrEqual(8);
      const ids = AREAS_REVISADAS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of AREAS_REVISADAS) {
        expect(a.rutas.length).toBeGreaterThan(0);
        expect(a.cadenciaHoras).toBeGreaterThan(0);
      }
    });
  });

  describe("tocaRevisar", () => {
    const area: AreaRevisada = {
      id: "diseno",
      nombre: "Diseño",
      rutas: ["src/components"],
      busca: ["coherencia"],
      cadenciaHoras: 6,
      papel: "disenador",
    };
    const ahora = new Date("2026-09-09T12:00:00Z");

    it("hace 1 h y cadencia 6 → no toca, con motivo", () => {
      const r = tocaRevisar(area, "2026-09-09T11:00:00Z", ahora);
      expect(r.toca).toBe(false);
      expect(r.motivo.length).toBeGreaterThan(0);
    });

    it("hace 9 h y cadencia 6 → toca", () => {
      const r = tocaRevisar(area, "2026-09-09T03:00:00Z", ahora);
      expect(r.toca).toBe(true);
    });

    it("sin revisión previa → siempre toca", () => {
      expect(tocaRevisar(area, "", ahora).toca).toBe(true);
      expect(tocaRevisar(area, "basura-inválida", ahora).toca).toBe(true);
    });
  });

  describe("siguienteArea", () => {
    const areas: AreaRevisada[] = [
      { id: "a", nombre: "A", rutas: ["x"], busca: ["x"], cadenciaHoras: 6, papel: "limpiador" },
      { id: "b", nombre: "B", rutas: ["x"], busca: ["x"], cadenciaHoras: 6, papel: "limpiador" },
    ];
    const ahora = new Date("2026-09-09T12:00:00Z");

    it("devuelve la más atrasada", () => {
      // a: 9 h atrás (3 h de atraso), b: 7 h atrás (1 h de atraso).
      const r = siguienteArea(areas, { a: "2026-09-09T03:00:00Z", b: "2026-09-09T05:00:00Z" }, ahora);
      expect(r?.id).toBe("a");
    });

    it("devuelve null si ninguna toca", () => {
      const r = siguienteArea(areas, { a: "2026-09-09T11:00:00Z", b: "2026-09-09T10:00:00Z" }, ahora);
      expect(r).toBeNull();
    });
  });

  describe("promptRevisorArea", () => {
    const area: AreaRevisada = {
      id: "diseno",
      nombre: "Diseño",
      rutas: ["src/components"],
      busca: ["coherencia Crystal Liquid Glass"],
      cadenciaHoras: 6,
      papel: "disenador",
    };

    it("menciona el área, la palabra JSON y la palabra archivo", () => {
      const { system, user } = promptRevisorArea(area, "contexto de prueba");
      const todo = `${system}\n${user}`;
      expect(todo).toContain("Diseño");
      expect(todo).toMatch(/JSON/);
      expect(todo).toMatch(/archivo/);
    });

    it("no filtra claves por accidente", () => {
      const { system, user } = promptRevisorArea(area, "sk-clave-secreta-1234567890");
      expect(`${system}\n${user}`).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    });
  });

  describe("fusionarSugerencias", () => {
    it("no duplica el mismo título normalizado y sí añade una nueva", () => {
      const previa = sugerencia({ id: "p1", titulo: "Mejorar la jerarquía visual" });
      const duplicada = sugerencia({ id: "n1", titulo: "mejorar la jerarquia   VISUAL!" });
      const nueva = sugerencia({ id: "n2", titulo: "Optimizar imágenes" });

      const out = fusionarSugerencias([previa], [duplicada, nueva]);
      expect(out).toHaveLength(2);
      expect(out.some((s) => s.id === "n2")).toBe(true);
      // La más reciente pisa a la anterior en choque: la entrada con id n1 sustituye a p1.
      expect(out.some((s) => s.id === "n1")).toBe(true);
      expect(out.some((s) => s.id === "p1")).toBe(false);
    });
  });

  describe("aTareaDeCola", () => {
    it("respeta el tope de 3 archivos y mete la evidencia en el prompt", () => {
      const s = sugerencia({
        id: "s1",
        titulo: "Quitar componente huérfano",
        porque: "Nadie lo importa.",
        evidencia: ["src/components/x.tsx:12", "src/lib/y.ts:40"],
        archivos: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
      });
      const t = aTareaDeCola(s, "ola-301");
      expect(t.archivos).toHaveLength(3);
      expect(t.prompt).toContain("src/components/x.tsx:12");
      expect(t.prompt).toContain("3 archivos");
      expect(t.ola).toBe("ola-301");
      expect(t.titulo).toBe("Quitar componente huérfano");
    });
  });
});