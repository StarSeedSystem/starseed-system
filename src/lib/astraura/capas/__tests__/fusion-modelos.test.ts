import { describe, it, expect } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

/** Candidato de pesos por defecto: Qwen bf16 público. */
const pesos = (extra: Partial<Candidato> = {}): Candidato => ({
  id: extra.id ?? "qwen-a", arquitectura: "qwen", parametrosB: 4,
  tipo: "pesos", empaquetado: "bf16", ambito: "publico", ...extra,
});

const adaptador = (extra: Partial<Candidato> = {}): Candidato => ({
  id: extra.id ?? "lora-a", arquitectura: "qwen", parametrosB: 4,
  tipo: "adaptador", empaquetado: "bf16", baseId: "qwen-base",
  ambito: "publico", ...extra,
});

describe("planFusion", () => {
  it("regla 1: con un solo candidato no hay plan", () => {
    const plan = planFusion([pesos()]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    expect(plan.bloqueos).toEqual([]);
  });

  it("regla 2: privado con público ⇒ ninguna con el bloqueo de ámbito", () => {
    const plan = planFusion([
      pesos({ ambito: "privado" }),
      pesos({ id: "qwen-b", ambito: "publico" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("regla 2: dueños distintos ⇒ ninguna aunque el ámbito coincida", () => {
    const plan = planFusion([
      pesos({ dueno: "alex" }),
      pesos({ id: "qwen-b", dueno: "carlos" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("regla 3 a: dos adaptadores del mismo base ⇒ PEFT con método linear", () => {
    const plan = planFusion([adaptador({ id: "lora-a" }), adaptador({ id: "lora-b" })]);
    expect(plan.estrategia).toBe("adaptadores-ponderados");
    expect(plan.herramienta).toBe("peft");
    expect(plan.metodo).toBe("linear");
    expect(plan.pasos.join(" ")).toContain("add_weighted_adapter");
  });

  it("regla 3 b: tres adaptadores ⇒ ties con densidad 0,5", () => {
    const plan = planFusion([
      adaptador({ id: "lora-a" }), adaptador({ id: "lora-b" }), adaptador({ id: "lora-c" }),
    ]);
    expect(plan.metodo).toBe("ties");
    expect(plan.pasos.join(" ")).toContain("densidad 0,5");
  });

  it("regla 4: Needle con otra arquitectura ⇒ ensamble de sistema", () => {
    const plan = planFusion([
      pesos({ id: "nd", arquitectura: "needle3", parametrosB: 0.121 }),
      pesos({ id: "bn", arquitectura: "bitnet", parametrosB: 2 }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.herramienta).toBe("sistema");
    expect(plan.motivo).toContain("needle finetune");
  });

  it("regla 5: Qwen con BitNet (sin Needle) ⇒ ensamble con MoA y decisión híbrida", () => {
    const plan = planFusion([
      pesos({ arquitectura: "qwen" }),
      pesos({ id: "bn", arquitectura: "bitnet" }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.motivo).toBe("no hay fusión de pesos entre arquitecturas distintas");
    const juntas = plan.pasos.join(" ");
    expect(juntas).toContain("MoA");
    expect(juntas).toContain("decisión híbrida");
  });

  it("regla 6: adaptador + pesos de la misma arquitectura ⇒ paso previo merge_and_unload y luego mergekit", () => {
    const plan = planFusion([
      adaptador({ id: "lora-a", arquitectura: "mistral", baseId: "mistral-base" }),
      pesos({ id: "mistral-x", arquitectura: "mistral" }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    const juntas = plan.pasos.join(" ");
    expect(juntas).toContain("merge_and_unload");
    expect(juntas).toContain("mergekit como programa externo");
  });

  it("regla 7 a: dos Qwen bf16 ⇒ mergekit con slerp", () => {
    const plan = planFusion([
      pesos({ id: "qwen-a", vocab: 151000 }),
      pesos({ id: "qwen-b", vocab: 151000 }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.herramienta).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
    expect(plan.pasos.join(" ")).toContain("banco de capas");
  });

  it("regla 7 b: cuatro pesos bf16 que comparten baseId ⇒ mergekit ties", () => {
    const plan = planFusion([
      pesos({ id: "a", baseId: "mistral-pool" }), pesos({ id: "b", baseId: "mistral-pool" }),
      pesos({ id: "c", baseId: "mistral-pool" }), pesos({ id: "d", baseId: "mistral-pool" }),
    ]);
    expect(plan.metodo).toBe("ties");
  });

  it("regla 7 c: ≥ 3 pesos sin baseId común ⇒ mergekit linear", () => {
    const plan = planFusion([
      pesos({ id: "a" }), pesos({ id: "b" }), pesos({ id: "c" }),
    ]);
    expect(plan.metodo).toBe("linear");
  });

  it("regla 7 d: dos ternarios empaquetados ⇒ ninguna con la ruta bf16 unpacked", () => {
    const plan = planFusion([
      pesos({ id: "bn-a", arquitectura: "bitnet", empaquetado: "ternario-empaquetado", baseId: "bn" }),
      pesos({ id: "bn-b", arquitectura: "bitnet", empaquetado: "ternario-empaquetado", baseId: "bn" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    const juntas = plan.pasos.join(" ");
    expect(juntas).toContain("unpacked");
    expect(juntas).toContain("Recuantizar");
    expect(juntas).toContain("capas_banco");
  });

  it("regla 7 e: tamaños distintos (4 B frente a 7 B) ⇒ ninguna con bloqueo", () => {
    const plan = planFusion([
      pesos({ id: "qwen-4", parametrosB: 4 }),
      pesos({ id: "qwen-7", parametrosB: 7 }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("tamaños de tensor o vocabulario distintos");
  });

  it("regla 7 f: vocabularios distintos ⇒ ninguna", () => {
    const plan = planFusion([
      pesos({ id: "qwen-a", vocab: 151000 }),
      pesos({ id: "qwen-b", vocab: 32000 }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("tamaños de tensor o vocabulario distintos");
  });

  it("regla 7 g: tamaños dentro de ±1 % se aceptan como iguales", () => {
    const plan = planFusion([
      pesos({ id: "qwen-a", parametrosB: 4 }),
      pesos({ id: "qwen-b", parametrosB: 4.02 }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
  });

  it("regla 7 h: mezcla de empaquetados (bf16 con GGUF) ⇒ ninguna y ruta bf16", () => {
    const plan = planFusion([
      pesos({ id: "a", empaquetado: "bf16" }),
      pesos({ id: "b", empaquetado: "gguf-cuantizado" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.pasos.join(" ")).toContain("unpacked");
  });
});
