import { describe, expect, it } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

const BASE: Candidato = {
  id: "a", arquitectura: "qwen3.5", parametrosB: 8, tipo: "pesos",
  empaquetado: "bf16", ambito: "privado", dueno: "alex",
};
const c = (id: string, cambio: Partial<Candidato> = {}): Candidato => ({ ...BASE, id, ...cambio });
const ADAPT = { tipo: "adaptador" as const, baseId: "bitnet-b1.58-2b-4t" };
const BITNET = { arquitectura: "bitnet-b1.58", parametrosB: 2 };

describe("planFusion", () => {
  it("regla 1: con un solo candidato no hay fusión", () => {
    const plan = planFusion([{ ...BASE }]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    expect(plan.pasos).toEqual([]);
  });

  it("regla 2: lo privado no se mezcla con lo público", () => {
    const plan = planFusion([c("a"), c("b", { ambito: "publico", dueno: undefined })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos.join(" ")).toContain("lo privado no se mezcla");
  });

  it("regla 2: lo de otra persona tampoco se mezcla", () => {
    const plan = planFusion([c("a"), c("b", { dueno: "otra-persona" })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.motivo).toContain("otra persona");
  });

  it("regla 3: dos adaptadores de la misma base ⇒ linear con PEFT", () => {
    const plan = planFusion([c("r1", ADAPT), c("r2", ADAPT)]);
    expect(plan.estrategia).toBe("adaptadores-ponderados");
    expect(plan.herramienta).toBe("peft");
    expect(plan.metodo).toBe("linear");
    const texto = plan.pasos.join(" ");
    expect(texto).toContain("add_weighted_adapter");
    expect(texto).toContain("banco de capas");
  });

  it("regla 3: tres adaptadores de la misma base ⇒ TIES con densidad 0,5", () => {
    const plan = planFusion([c("r1", ADAPT), c("r2", ADAPT), c("r3", ADAPT)]);
    expect(plan.metodo).toBe("ties");
    expect(plan.motivo).toContain("densidad 0,5");
    expect(plan.pasos.join(" ")).toContain("ties");
  });

  it("regla 4: Needle con otra arquitectura ⇒ ensamble de sistema con sus adaptadores", () => {
    const plan = planFusion([c("n1", { arquitectura: "needle-reflejo", parametrosB: 0.14 }), c("bt", BITNET)]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.herramienta).toBe("sistema");
    expect(plan.motivo).toContain("needle finetune");
  });

  it("regla 5: arquitecturas distintas sin Needle ⇒ ensamble que cita MoA y la decisión híbrida", () => {
    const plan = planFusion([c("q1", { arquitectura: "qwen-no-es-bitnet" }), c("bt", BITNET)]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.motivo.toLowerCase()).toContain("no hay fusión de pesos entre arquitecturas distintas");
    const texto = plan.pasos.join(" ");
    expect(texto).toContain("moa/runtime.ts");
    expect(texto).toContain("decision-hibrida.ts");
  });

  it("regla 6: adaptador y pesos de la misma arquitectura ⇒ paso previo merge_and_unload", () => {
    const plan = planFusion([c("ad", { tipo: "adaptador", baseId: "qwen3.5-base" }), c("w1")]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.pasos[0]).toContain("merge_and_unload");
    expect(plan.pasos.join(" ")).toContain("banco de capas antes de promover");
  });

  it("regla 7: dos pesos bf16 de Qwen ⇒ mergekit con slerp como programa externo", () => {
    const plan = planFusion([c("q1"), c("q2")]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.herramienta).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
    const texto = plan.pasos.join(" ");
    expect(texto).toContain("no importarlo");
    expect(texto).toContain("banco de capas antes de promover");
  });

  it("regla 7: tres pesos bf16 con baseId común ⇒ ties; tres sin baseId ⇒ linear", () => {
    const conBase = planFusion([
      c("q1", { baseId: "qwen3.5-base" }), c("q2", { baseId: "qwen3.5-base" }),
      c("q3", { baseId: "qwen3.5-base" }),
    ]);
    expect(conBase.metodo).toBe("ties");
    const sinBase = planFusion([c("q1"), c("q2"), c("q3")]);
    expect(sinBase.metodo).toBe("linear");
  });

  it("regla 7: dos pesos ternarios empaquetados ⇒ ninguna con los pasos de la ruta bf16", () => {
    const plan = planFusion([
      c("t1", { empaquetado: "ternario-empaquetado" }), c("t2", { empaquetado: "ternario-empaquetado" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    const texto = plan.pasos.join(" ");
    expect(texto).toContain("-unpacked");
    expect(texto).toContain("cuantizar");
    expect(texto).toContain("banco de capas");
  });

  it("regla 7: tamaños fuera de ±1 % ⇒ ninguna con bloqueo", () => {
    const plan = planFusion([c("a", { parametrosB: 2 }), c("b", { parametrosB: 8 })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos.join(" ")).toContain("1 %");
  });

  it("regla 7: vocabulario distinto ⇒ ninguna con bloqueo", () => {
    const plan = planFusion([c("a", { vocab: 151936 }), c("b", { vocab: 32000 })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos.join(" ")).toContain("vocab");
  });
});
