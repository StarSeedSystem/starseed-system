import { describe, it, expect } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

function pesos(id: string, extra: Partial<Candidato> = {}): Candidato {
  return {
    id, arquitectura: "qwen35", parametrosB: 8, tipo: "pesos", empaquetado: "bf16",
    ambito: "privado", ...extra,
  };
}

function adaptador(id: string, baseId: string, extra: Partial<Candidato> = {}): Candidato {
  return pesos(id, { tipo: "adaptador", baseId, ...extra });
}

describe("planFusion", () => {
  it("con menos de dos candidatos no hay fusión", () => {
    const plan = planFusion([pesos("a")]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
  });

  it("lo privado y lo público no se mezclan", () => {
    const plan = planFusion([pesos("a"), pesos("b", { ambito: "publico" })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("el mismo ámbito con dueños distintos tampoco se mezcla", () => {
    const plan = planFusion([
      pesos("a", { ambito: "ambito", dueno: "ana" }),
      pesos("b", { ambito: "ambito", dueno: "diaz" }),
    ]);
    expect(plan.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("dos adaptadores del mismo base usan linear en PEFT", () => {
    const plan = planFusion([adaptador("a", "base-q"), adaptador("b", "base-q")]);
    expect(plan).toMatchObject({ estrategia: "adaptadores-ponderados", herramienta: "peft", metodo: "linear" });
    expect(plan.pasos.join("\n")).toContain("add_weighted_adapter");
  });

  it("tres o más adaptadores del mismo base usan ties con densidad 0,5", () => {
    const plan = planFusion([adaptador("a", "base-q"), adaptador("b", "base-q"), adaptador("c", "base-q")]);
    expect(plan.metodo).toBe("ties");
    expect(plan.pasos.join("\n")).toContain("densidad 0,5");
    expect(plan.pasos[plan.pasos.length - 1]).toContain("banco de capas");
  });

  it("adaptadores de bases distintas o sin base se bloquean por PEFT", () => {
    const plan = planFusion([adaptador("a", "base-q"), adaptador("b", "base-r")]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos.join("\n")).toContain("mismo modelo base");
  });

  it("Needle con otra arquitectura solo admite sus adaptadores de needle finetune", () => {
    const plan = planFusion([
      pesos("n", { arquitectura: "needle-3" }),
      pesos("b", { arquitectura: "bitnet-158" }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.herramienta).toBe("sistema");
    expect(plan.motivo).toContain("needle finetune");
    expect(plan.pasos.join("\n")).toContain("MoA");
  });

  it("arquitecturas distintas van a ensamble de sistema sin fusión de pesos", () => {
    const plan = planFusion([
      pesos("b", { arquitectura: "bitnet-158" }),
      pesos("q", { arquitectura: "qwen35-hybrid" }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.motivo).toBe("no hay fusión de pesos entre arquitecturas distintas");
    expect(plan.pasos.join("\n")).toContain("decision-hibrida");
  });

  it("mezcla de adaptador y pesos: primero merge_and_unload y luego reglas de pesos", () => {
    const plan = planFusion([adaptador("a", "base-q", { arquitectura: "qwen35" }), pesos("p")]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.pasos[0]).toContain("merge_and_unload");
    expect(plan.metodo).toBe("slerp");
  });

  it("dos Qwen bf16 compatibles van a mergekit con slerp", () => {
    const plan = planFusion([pesos("a", { vocab: 151936 }), pesos("b", { vocab: 151936 })]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.herramienta).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
    const pasos = plan.pasos.join("\n");
    expect(pasos).toContain("Ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo.");
    expect(pasos).toContain("Pasar el banco de capas antes de promover");
    expect(plan.bloqueos).toEqual([]);
  });

  it("una lectura de tamaño dentro del 1 por ciento pasa al plan", () => {
    const plan = planFusion([pesos("a"), pesos("b", { parametrosB: 8.05 })]);
    expect(plan.estrategia).toBe("mergekit");
  });

  it("dos ternarios empaquetados no se fusionan sin pasar por bf16", () => {
    const plan = planFusion([
      pesos("a", { arquitectura: "bitnet-158", empaquetado: "ternario-empaquetado" }),
      pesos("b", { arquitectura: "bitnet-158", empaquetado: "ternario-empaquetado" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.pasos.join("\n")).toContain("*-unpacked");
    expect(plan.pasos.join("\n")).toContain("Pasar el banco de capas");
    expect(plan.bloqueos.length).toBeGreaterThan(0);
  });

  it("tamaños fuera del 1 por ciento se bloquean por los tensores", () => {
    const plan = planFusion([pesos("a", { parametrosB: 7.9 }), pesos("b", { parametrosB: 8 })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("mergekit exige la misma arquitectura y los mismos tamaños de tensor");
  });

  it("vocabularios distintos se bloquean aunque el tamaño coincida", () => {
    const plan = planFusion([pesos("a", { vocab: 151936 }), pesos("b", { vocab: 32768 })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.pasos).toEqual([]);
  });

  it("tres pesos con base común van a ties y sin base van a linear", () => {
    const conBase = planFusion([
      pesos("a", { baseId: "q" }), pesos("b", { baseId: "q" }), pesos("c", { baseId: "q" }),
    ]);
    expect(conBase.metodo).toBe("ties");
    const sinBase = planFusion([pesos("a"), pesos("b"), pesos("c")]);
    expect(sinBase.metodo).toBe("linear");
  });
});
