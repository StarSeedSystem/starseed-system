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
    it("cataloga las nueve áreas con ids estables y criterios completos", () => {
      expect(AREAS_REVISADAS.map((a) => a.id)).toEqual([
        "interfaz-diseno",
        "accesibilidad",
        "arquitectura",
        "codigo-muerto",
        "rendimiento",
        "enjambre-economia",
        "canales-contenido",
        "memorias-privacidad",
        "descubribilidad",
      ]);
      const ids = AREAS_REVISADAS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of AREAS_REVISADAS) {
        expect(a.rutas.length).toBeGreaterThan(0);
        expect(a.busca.length).toBeGreaterThanOrEqual(3);
        expect(Number.isFinite(a.cadenciaHoras)).toBe(true);
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

    it("toca justo al cumplir la cadencia", () => {
      expect(tocaRevisar(area, "2026-09-09T06:00:00Z", ahora).toca).toBe(true);
    });

    it("sin revisión previa → siempre toca", () => {
      expect(tocaRevisar(area, "", ahora).toca).toBe(true);
      expect(tocaRevisar(area, "basura-inválida", ahora).toca).toBe(true);
    });

    it("no entra en bucle con un reloj futuro o una hora actual inválida", () => {
      expect(tocaRevisar(area, "2026-09-10T12:00:00Z", ahora).toca).toBe(false);
      const invalida = tocaRevisar(area, "", new Date("fecha-inválida"));
      expect(invalida.toca).toBe(false);
      expect(invalida.motivo).toContain("no es válida");
    });

    it("usa una cadencia segura ante valores no finitos", () => {
      const corrupta = { ...area, cadenciaHoras: Number.POSITIVE_INFINITY };
      expect(tocaRevisar(corrupta, "2026-09-08T11:00:00Z", ahora).toca).toBe(true);
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

    it("compara el atraso relativo a la cadencia de cada área", () => {
      const distintas: AreaRevisada[] = [
        { ...areas[0], cadenciaHoras: 2 },
        { ...areas[1], cadenciaHoras: 10 },
      ];
      const r = siguienteArea(distintas, { a: "2026-09-09T08:00:00Z", b: "2026-09-08T21:00:00Z" }, ahora);
      expect(r?.id).toBe("a");
    });

    it("prioriza en orden de catálogo las áreas nunca revisadas", () => {
      expect(siguienteArea(areas, {}, ahora)?.id).toBe("a");
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

    it("delimita el área, exige JSON y explica la escala de puntuación", () => {
      const { system, user } = promptRevisorArea(area, "contexto de prueba");
      const todo = `${system}\n${user}`;
      expect(todo).toContain("Diseño");
      expect(todo).toMatch(/JSON/);
      expect(todo).toMatch(/archivo/);
      expect(todo).toContain("CÓMO PUNTÚAS");
      expect(todo).toContain("impacto × 2 − esfuerzo − riesgo");
      expect(todo).toContain('ambito (exactamente "diseno")');
    });

    it("incorpora sin alterar el contexto ya preparado por el servidor", () => {
      const contexto = "archivo.ts:12\n[SECRETO REDACTADO]";
      const { user } = promptRevisorArea(area, contexto);
      expect(user).toContain(contexto);
    });
  });

  describe("fusionarSugerencias", () => {
    it("actualiza el contenido duplicado sin cambiar su id persistido", () => {
      const previa = sugerencia({ id: "p1", titulo: "Mejorar la jerarquía visual" });
      const duplicada = sugerencia({
        id: "n1",
        titulo: "mejorar la jerarquia   VISUAL!",
        porque: "Ahora hay evidencia más precisa.",
      });
      const nueva = sugerencia({ id: "n2", titulo: "Optimizar imágenes" });

      const out = fusionarSugerencias([previa], [duplicada, nueva]);
      expect(out).toHaveLength(2);
      expect(out.some((s) => s.id === "n2")).toBe(true);
      expect(out[0].id).toBe("p1");
      expect(out[0].porque).toBe("Ahora hay evidencia más precisa.");
      expect(out.some((s) => s.id === "n1")).toBe(false);
    });

    it("considera los archivos y el ámbito al deduplicar", () => {
      const base = sugerencia({ id: "a", titulo: "Mismo título", archivos: ["uno.ts"] });
      const otroArchivo = sugerencia({ id: "b", titulo: "Mismo título", archivos: ["dos.ts"] });
      const otroAmbito = sugerencia({ id: "c", titulo: "Mismo título", ambito: "arquitectura", archivos: ["uno.ts"] });
      expect(fusionarSugerencias([base], [otroArchivo, otroAmbito])).toHaveLength(3);
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
      expect(t.prompt).toContain("120 líneas");
      expect(t.ola).toBe("ola-301");
      expect(t.titulo).toBe("Quitar componente huérfano");
      expect(t.modelo.length).toBeGreaterThan(0);
    });

    it("prioriza la propuesta, deduplica y rechaza rutas que escapan del repositorio", () => {
      const s = sugerencia({
        id: "rutas-1",
        titulo: "Título del hallazgo",
        archivos: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
        propuestaDeTarea: {
          titulo: "Título listo para ejecutar",
          archivos: ["./src/a.ts", "../fuera.ts", "/tmp/fuera.ts", "C:\\fuera.ts", "https://fuera.test/x.ts"],
          prompt: "Haz el cambio concreto y conserva la API.",
        },
      });

      const t = aTareaDeCola(s, "ola-rutas");
      expect(t.titulo).toBe("Título listo para ejecutar");
      expect(t.archivos).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
      expect(t.prompt).toContain("Haz el cambio concreto y conserva la API.");
      expect(t.prompt).not.toContain("../fuera.ts");
      expect(t.prompt).not.toContain("/tmp/fuera.ts");
    });

    it("genera ids estables y distingue ids que normalizan igual", () => {
      const conBarra = aTareaDeCola(sugerencia({ id: "uno/dos", titulo: "A" }), "ola");
      const conEspacio = aTareaDeCola(sugerencia({ id: "uno dos", titulo: "A" }), "ola");
      const repetida = aTareaDeCola(sugerencia({ id: "uno/dos", titulo: "A" }), "otra-ola");
      expect(conBarra.id).toBe(repetida.id);
      expect(conBarra.id).not.toBe(conEspacio.id);
      expect(conBarra.id).toMatch(/^rev-uno-dos-/);
    });
  });
});
