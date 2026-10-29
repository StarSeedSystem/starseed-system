import { describe, expect, it } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

const pesos = (sobre: Partial<Candidato> = {}): Candidato => ({
  id: "m1", arquitectura: "qwen", parametrosB: 4, tipo: "pesos", empaquetado: "bf16",
  ambito: "privado", ...sobre,
});
const adaptador = (sobre: Partial<Candidato> = {}): Candidato => ({
  id: "a1", arquitectura: "qwen", parametrosB: 0.1, tipo: "adaptador", empaquetado: "bf16",
  baseId: "qwen-4b", ambito: "privado", ...sobre,
});

describe("planFusion", () => {
  describe("reglas que bloquean", () => {
    it("regla 1: menos de dos candidatos ⇒ ninguna", () => {
      const plan = planFusion([pesos()]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.herramienta).toBeNull();
      expect(plan.pasos).toEqual([]);
    });

    it("regla 2: privado junto a público ⇒ ninguna con bloqueo de convivencia", () => {
      const plan = planFusion([pesos({ id: "priv" }), pesos({ id: "pub", ambito: "publico" })]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
    });
  });

  describe("reglas que fusionan", () => {
    it("regla 3: dos adaptadores de una base ⇒ peft linear", () => {
      const plan = planFusion([adaptador(), adaptador({ id: "a2" })]);
      expect(plan).toMatchObject({
        estrategia: "adaptadores-ponderados", herramienta: "peft", metodo: "linear",
      });
      expect(plan.pasos.join(" ")).toContain("add_weighted_adapter");
    });

    it("regla 3: tres o más adaptadores de una base ⇒ peft ties con densidad 0,5", () => {
      const plan = planFusion([adaptador(), adaptador({ id: "a2" }), adaptador({ id: "a3" })]);
      expect(plan).toMatchObject({
        estrategia: "adaptadores-ponderados", herramienta: "peft", metodo: "ties",
      });
      expect(plan.pasos.join(" ")).toContain("densidad 0,5");
    });

    it("regla 4: Needle junto a BitNet ⇒ ensamble de sistema", () => {
      const needle = pesos({ id: "needle", arquitectura: "needle-3" });
      const bitnet = pesos({ id: "bitnet", arquitectura: "bitnet-b1.58" });
      const plan = planFusion([needle, bitnet]);
      expect(plan.estrategia).toBe("ensamble-sistema");
      expect(plan.herramienta).toBe("sistema");
      expect(plan.motivo).toContain("needle finetune");
    });

    it("regla 5: arquitecturas distintas sin Needle ⇒ ensamble con motivo de pesos", () => {
      const plan = planFusion([pesos({ arquitectura: "qwen" }), pesos({ id: "m2", arquitectura: "llama" })]);
      expect(plan.estrategia).toBe("ensamble-sistema");
      expect(plan.motivo.toLowerCase()).toContain("no hay fusión de pesos entre arquitecturas distintas");
      expect(plan.pasos.join(" ")).toContain("src/ai/moa/runtime.ts");
      expect(plan.pasos.join(" ")).toContain("src/lib/astraura/decision-hibrida.ts");
    });

    it("regla 6: adaptador más pesos de la misma arquitectura ⇒ descarga previa con merge_and_unload", () => {
      const plan = planFusion([adaptador(), pesos({ baseId: "qwen-4b" }), pesos({ id: "m3", baseId: "qwen-4b" })]);
      expect(plan.estrategia).toBe("mergekit");
      expect(plan.metodo).toBe("slerp");
      expect(plan.pasos[0]).toContain("merge_and_unload");
    });

    it("regla 7: dos Qwen bf16 ⇒ mergekit slerp como programa externo", () => {
      const plan = planFusion([pesos(), pesos({ id: "m2" })]);
      expect(plan).toMatchObject({ estrategia: "mergekit", herramienta: "mergekit", metodo: "slerp" });
      expect(plan.pasos.join(" ")).toContain("no importarlo");
    });

    it("regla 7: tres pesos bf16 con baseId común ⇒ mergekit ties", () => {
      const plan = planFusion([pesos({ baseId: "qwen-4b" }), pesos({ id: "m2", baseId: "qwen-4b" }),
        pesos({ id: "m3", baseId: "qwen-4b" })]);
      expect(plan).toMatchObject({ estrategia: "mergekit", metodo: "ties" });
    });

    it("regla 7: tres pesos bf16 sin baseId común ⇒ mergekit linear", () => {
      const plan = planFusion([pesos(), pesos({ id: "m2" }), pesos({ id: "m3" })]);
      expect(plan).toMatchObject({ estrategia: "mergekit", metodo: "linear" });
    });

    it("regla 7: dos ternarios empaquetados ⇒ ninguna con la ruta bf16 unpacked", () => {
      const plan = planFusion([pesos({ empaquetado: "ternario-empaquetado" }),
        pesos({ id: "m2", empaquetado: "ternario-empaquetado" })]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.herramienta).toBeNull();
      const texto = plan.pasos.join(" ");
      expect(texto).toContain("*-unpacked");
      expect(texto).toContain("Q2_0");
      expect(texto).toContain("capas_banco");
    });

    it("regla 7: GGUF cuantizado junto a bf16 ⇒ ninguna con bloqueo de cuantización", () => {
      const plan = planFusion([pesos(), pesos({ id: "m2", empaquetado: "gguf-cuantizado" })]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.bloqueos.join(" ")).toContain("no se fusionan");
    });

    it("regla 7: tamaños fuera de ±1 % ⇒ ninguna con bloqueo", () => {
      const plan = planFusion([pesos({ parametrosB: 4 }), pesos({ id: "m2", parametrosB: 4.5 })]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.bloqueos.join(" ")).toContain("Tamaño o vocabulario distintos");
    });

    it("regla 7: tamaños dentro de ±1 % pasan", () => {
      const plan = planFusion([pesos({ parametrosB: 4 }), pesos({ id: "m2", parametrosB: 4.03 })]);
      expect(plan.estrategia).toBe("mergekit");
    });

    it("regla 7: vocabulario distinto ⇒ ninguna con bloqueo", () => {
      const plan = planFusion([pesos({ vocab: 151_936 }), pesos({ id: "m2", vocab: 32_000 })]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.bloqueos.join(" ")).toContain("Tamaño o vocabulario distintos");
    });

    it("regla 2: mismos ámbitos pero dueños distintos ⇒ ninguna", () => {
      const plan = planFusion([pesos({ dueno: "alex" }), pesos({ id: "m2", dueno: "otra" })]);
      expect(plan.estrategia).toBe("ninguna");
      expect(plan.bloqueos.join(" ")).toContain("otra persona");
    });
  });
});
