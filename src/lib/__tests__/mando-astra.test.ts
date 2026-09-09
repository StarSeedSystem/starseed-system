import { describe, it, expect } from "vitest";

import {
  AMBITOS_ASTRA,
  PRECIOS_POR_MILLON,
  costeEstimado,
  dentroDePresupuesto,
  parsearSugerencias,
  priorizar,
  promptAstra,
  type SugerenciaAstra,
} from "../mando/astra";

describe("Astra · director de orquestación", () => {
  describe("AMBITOS_ASTRA", () => {
    it("tiene al menos 8 ámbitos con id únicos", () => {
      expect(AMBITOS_ASTRA.length).toBeGreaterThanOrEqual(8);
      const ids = AMBITOS_ASTRA.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("promptAstra", () => {
    it("incluye el ámbito, la palabra JSON y la palabra archivo, y no filtra claves", () => {
      const { system, user } = promptAstra("diseno", "estado del design system");
      const todo = `${system}\n${user}`;
      expect(user).toContain("diseno");
      expect(todo).toMatch(/JSON/);
      expect(todo).toMatch(/archivo/);
      // Nunca debe asomar un valor de clave (prefijo sk-) en el prompt.
      expect(todo).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    });
  });

  describe("parsearSugerencias", () => {
    it("acepta JSON pelado y descarta lo inválido", () => {
      const crudo = JSON.stringify([
        { id: "s1", ambito: "diseno", titulo: "A", impacto: 4, esfuerzo: 2, riesgo: 1 },
        { impacto: 5 },
        { titulo: "B" },
      ]);
      const out = parsearSugerencias(crudo);
      expect(out.map((s) => s.titulo)).toEqual(["A", "B"]);
    });

    it("acepta vallas ```json y rellena id si falta", () => {
      const json = JSON.stringify([{ ambito: "rendimiento", titulo: "memoizar", impacto: 5 }]);
      const crudo = "```json\n" + json + "\n```";
      const out = parsearSugerencias(crudo);
      expect(out).toHaveLength(1);
      expect(out[0].id.length).toBeGreaterThan(0);
    });

    it("toler a basura intercalada y devuelve [] si no hay JSON", () => {
      expect(parsearSugerencias("hola mundo sin json")).toEqual([]);
      const intermedio = "antes\n```json\n[]\n```\ndespués";
      expect(parsearSugerencias(intermedio)).toEqual([]);
    });
  });

  describe("priorizar", () => {
    it("ordena por impacto*2 - esfuerzo - riesgo descendente", () => {
      const lista: SugerenciaAstra[] = [
        { id: "bajo", ambito: "diseno", titulo: "medio", porque: "", evidencia: [], impacto: 3, esfuerzo: 4, riesgo: 2, archivos: [], propuestaDeTarea: null },
        { id: "alto", ambito: "diseno", titulo: "top", porque: "", evidencia: [], impacto: 5, esfuerzo: 1, riesgo: 1, archivos: [], propuestaDeTarea: null },
      ];
      const out = priorizar(lista);
      expect(out[0].id).toBe("alto");
      expect(out[1].id).toBe("bajo");
    });
  });

  describe("costeEstimado", () => {
    it("modelo conocido devuelve coste > 0; desconocido no lanza y devuelve 0", () => {
      const c = costeEstimado("gpt-6-astra", 1_000_000, 1_000_000);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeCloseTo(PRECIOS_POR_MILLON["gpt-6-astra"].entrada + PRECIOS_POR_MILLON["gpt-6-astra"].salida, 6);
      expect(() => costeEstimado("modelo-fantasma", 100, 100)).not.toThrow();
      expect(costeEstimado("modelo-fantasma", 100, 100)).toBe(0);
    });
  });

  describe("dentroDePresupuesto", () => {
    it("rechaza cuando gastado + nuevo supera el techo, con motivo claro", () => {
      const r = dentroDePresupuesto(1.9, 0.3, 2.0);
      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/Techo/);
    });
    it("acepta cuando entra en el presupuesto", () => {
      const r = dentroDePresupuesto(0.1, 0.3, 2.0);
      expect(r.ok).toBe(true);
      expect(r.motivo).toMatch(/Quedan/);
    });
  });
});
