import { describe, it, expect } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

let n = 0;
const peso = (compuesto: Partial<Candidato> = {}): Candidato => ({
  id: `m${++n}`, arquitectura: "qwen3.5", parametrosB: 4, tipo: "pesos",
  empaquetado: "bf16", ambito: "publico", ...compuesto,
});

describe("planFusion", () => {
  it("con un solo candidato no hay fusión", () => {
    const plan = planFusion([peso()]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
  });

  it("privado y público no se mezclan", () => {
    const plan = planFusion([peso({ ambito: "privado" }), peso()]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos[0]).toContain("lo privado no se mezcla");
  });

  it("dos dueños distintos no se mezclan", () => {
    const plan = planFusion([peso({ dueno: "alex" }), peso({ dueno: "otra" })]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toHaveLength(1);
  });

  it("dos adaptadores del mismo base ⇒ PEFT linear", () => {
    const plan = planFusion([
      peso({ tipo: "adaptador", baseId: "qwen-base" }),
      peso({ tipo: "adaptador", baseId: "qwen-base" }),
    ]);
    expect(plan.estrategia).toBe("adaptadores-ponderados");
    expect(plan.herramienta).toBe("peft");
    expect(plan.metodo).toBe("linear");
    expect(plan.pasos.some((p) => p.includes("add_weighted_adapter"))).toBe(true);
    expect(plan.pasos[plan.pasos.length - 1]).toContain("banco de capas");
  });
  it("tres adaptadores del mismo base ⇒ PEFT ties con densidad", () => {
    const plan = planFusion([
      peso({ tipo: "adaptador", baseId: "qwen-base" }),
      peso({ tipo: "adaptador", baseId: "qwen-base" }),
      peso({ tipo: "adaptador", baseId: "qwen-base" }),
    ]);
    expect(plan.metodo).toBe("ties");
    expect(plan.pasos.join(" ")).toContain("densidad 0,5");
  });
  it("Needle con otra arquitectura ⇒ ensamble de sistema", () => {
    const plan = planFusion([
      peso({ arquitectura: "needle3", id: "needle" }),
      peso({ arquitectura: "bitnet1.58" }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.herramienta).toBe("sistema");
    expect(plan.motivo).toContain("needle finetune");
    expect(plan.pasos.join(" ")).toContain("MoA");
  });
  it("arquitecturas distintas sin Needle ⇒ ensamble por no hay fusión de pesos", () => {
    const plan = planFusion([peso({ arquitectura: "bitnet1.58" }), peso()]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.motivo).toBe("no hay fusión de pesos entre arquitecturas distintas");
    expect(plan.pasos.join(" ")).toContain("decision-hibrida");
  });
  it("mixto adaptador + pesos: añade merge_and_unload antes de mergekit", () => {
    const plan = planFusion([
      peso({ tipo: "adaptador", baseId: "qwen-base" }),
      peso(),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.pasos[0]).toContain("merge_and_unload");
    expect(plan.metodo).toBe("slerp");
  });
  it("dos Qwen bf16 compatibles ⇒ mergekit slerp", () => {
    const plan = planFusion([peso({ vocab: 152000 }), peso({ vocab: 152000 })]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
    expect(plan.pasos[0]).toContain("programa externo");
    expect(plan.pasos[0]).toContain("no importarlo");
    expect(plan.pasos[1]).toContain("banco de capas");
  });
  it("tres bf16 con base común ⇒ ties; sin base común ⇒ linear", () => {
    const ties = planFusion([
      peso({ baseId: "qwen" }), peso({ baseId: "qwen" }), peso({ baseId: "qwen" }),
    ]);
    expect(ties.metodo).toBe("ties");
    const linear = planFusion([peso(), peso(), peso()]);
    expect(linear.metodo).toBe("linear");
  });
  it("pesos no bf16 ⇒ ninguna con ruta de recuantización", () => {
    const ternarios = planFusion([
      peso({ arquitectura: "bitnet1.58", empaquetado: "ternario-empaquetado" }),
      peso({ arquitectura: "bitnet1.58", empaquetado: "ternario-empaquetado" }),
    ]);
    expect(ternarios.estrategia).toBe("ninguna");
    expect(ternarios.bloqueos.length).toBeGreaterThan(0);
    expect(ternarios.pasos.join(" ")).toContain("*-unpacked");
    const gguf = planFusion([peso({ empaquetado: "gguf-cuantizado" }), peso()]);
    expect(gguf.estrategia).toBe("ninguna");
    expect(gguf.pasos).toHaveLength(3);
  });
  it("tamaños o vocabularios distintos ⇒ ninguna con bloqueo", () => {
    const tamanos = planFusion([peso({ parametrosB: 4 }), peso({ parametrosB: 8 })]);
    expect(tamanos.estrategia).toBe("ninguna");
    expect(tamanos.bloqueos[0]).toContain("tamaños de tensor");
    const vocabus = planFusion([peso({ vocab: 152000 }), peso({ vocab: 32768 })]);
    expect(vocabus.estrategia).toBe("ninguna");
    expect(vocabus.herramienta).toBeNull();
  });
  it("diferencia de tamaño dentro del 1 % sí es compatible (bf16)", () => {
    const plan = planFusion([peso({ parametrosB: 4 }), peso({ parametrosB: 4.02 })]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
  });
});
