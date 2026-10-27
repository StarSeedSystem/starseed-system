import { describe, it, expect } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

function mk(sobre: Partial<Candidato> = {}): Candidato {
  return {
    id: sobre.id ?? "c-" + Math.random().toString(36).slice(2, 7),
    arquitectura: sobre.arquitectura ?? "qwen3.5",
    parametrosB: sobre.parametrosB ?? 4,
    tipo: sobre.tipo ?? "pesos",
    empaquetado: sobre.empaquetado ?? "bf16",
    baseId: sobre.baseId,
    vocab: sobre.vocab,
    ambito: sobre.ambito ?? "privado",
    dueno: sobre.dueno,
  };
}

describe("planFusion", () => {
  it("regla 1: con un solo candidato no hay fusión", () => {
    const plan = planFusion([mk()]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    expect(plan.pasos).toHaveLength(0);
  });

  it("regla 3: dos adaptadores del mismo base ⇒ PEFT linear", () => {
    const plan = planFusion([
      mk({ tipo: "adaptador", baseId: "base-a" }),
      mk({ tipo: "adaptador", baseId: "base-a", id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("adaptadores-ponderados");
    expect(plan.herramienta).toBe("peft");
    expect(plan.metodo).toBe("linear");
    expect(plan.pasos.some((p) => p.includes("add_weighted_adapter"))).toBe(true);
  });

  it("regla 3: tres adaptadores o más ⇒ TIES con densidad 0,5", () => {
    const plan = planFusion([
      mk({ tipo: "adaptador", baseId: "base-a" }),
      mk({ tipo: "adaptador", baseId: "base-a", id: "c2" }),
      mk({ tipo: "adaptador", baseId: "base-a", id: "c3" }),
    ]);
    expect(plan.metodo).toBe("ties");
    expect(plan.pasos[1]).toContain("densidad 0,5");
  });

  it("adaptadores con base distinto no se suman", () => {
    const plan = planFusion([
      mk({ tipo: "adaptador", baseId: "base-a" }),
      mk({ tipo: "adaptador", baseId: "base-b", id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos[0]).toContain("baseId");
  });

  it("regla 2: privado y público no se mezclan", () => {
    const plan = planFusion([
      mk({ ambito: "privado" }),
      mk({ ambito: "publico", id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos[0]).toContain("lo privado no se mezcla");
  });

  it("regla 2: dueños distintos tampoco", () => {
    const plan = planFusion([mk({ dueno: "alex" }), mk({ dueno: "otro" })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain(
      "lo privado no se mezcla con lo público ni con lo de otra persona",
    );
  });

  it("regla 4: Needle junto a otra arquitectura ⇒ ensamble de sistema", () => {
    const plan = planFusion([
      mk({ arquitectura: "needle-san" }),
      mk({ arquitectura: "bitnet", id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.herramienta).toBe("sistema");
    expect(plan.motivo).toContain("needle finetune");
    expect(plan.pasos.some((p) => p.includes("MoA"))).toBe(true);
  });

  it("regla 5: arquitecturas distintas distintas de Needle ⇒ ensamble", () => {
    const plan = planFusion([mk({ arquitectura: "bitnet" }), mk({ arquitectura: "qwen3.5", id: "c2" })]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.motivo).toBe("no hay fusión de pesos entre arquitecturas distintas");
    expect(plan.pasos.some((p) => p.includes("decision-hibrida"))).toBe(true);
  });

  it("regla 6: mezcla de adaptador y pesos pasa por merge_and_unload y luego mergekit", () => {
    const plan = planFusion([
      mk({ tipo: "adaptador", baseId: "base-a" }),
      mk({ id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.herramienta).toBe("mergekit");
    expect(plan.pasos[0]).toContain("merge_and_unload");
  });

  it("regla 7: dos pesos bf16 compatibles ⇒ mergekit slerp", () => {
    const plan = planFusion([
      mk({ vocab: 32000 }),
      mk({ vocab: 32000, id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
    expect(plan.pasos[0]).toContain("programa externo");
    expect(plan.pasos.some((p) => p.includes("banco de capas"))).toBe(true);
  });

  it("regla 7: tres bf16 que comparten baseId ⇒ TIES en mergekit", () => {
    const plan = planFusion([
      mk({ baseId: "base-a", vocab: 32000 }),
      mk({ baseId: "base-a", vocab: 32000, id: "c2" }),
      mk({ baseId: "base-a", vocab: 32000, id: "c3" }),
    ]);
    expect(plan.metodo).toBe("ties");
  });

  it("regla 7: ternarios empaquetados ⇒ ninguna con la ruta bf16 en los pasos", () => {
    const plan = planFusion([
      mk({ empaquetado: "ternario-empaquetado" }),
      mk({ empaquetado: "ternario-empaquetado", id: "c2" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos[0]).toContain("bf16");
    expect(plan.pasos.some((p) => p.includes("-unpacked"))).toBe(true);
    expect(plan.pasos.some((p) => p.includes("cuantizar"))).toBe(true);
  });

  it("regla 7: tamaños distintos ⇒ ninguna con bloqueo", () => {
    const plan = planFusion([mk({ parametrosB: 7 }), mk({ parametrosB: 4, id: "c2" })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos[0]).toContain("tamaños");
  });

  it("regla 7: vocabularios distintos ⇒ ninguna", () => {
    const plan = planFusion([mk({ vocab: 32000 }), mk({ vocab: 151000, id: "c2" })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos[0]).toContain("mergekit");
  });

  it("regla 7: ±1 % de margen sí se acepta", () => {
    const plan = planFusion([mk({ parametrosB: 7.02 }), mk({ parametrosB: 7, id: "c2" })]);
    expect(plan.estrategia).toBe("mergekit");
  });
});
