import { describe, expect, it } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

const CON_AJUSTES = (ajustes: Partial<Candidato>): Candidato => ({
  id: ajustes.id ?? "m1",
  arquitectura: ajustes.arquitectura ?? "Qwen3",
  parametrosB: ajustes.parametrosB ?? 2,
  tipo: ajustes.tipo ?? "pesos",
  empaquetado: ajustes.empaquetado ?? "bf16",
  baseId: ajustes.baseId,
  vocab: ajustes.vocab,
  ambito: ajustes.ambito ?? "privado",
  dueno: ajustes.dueno,
});

describe("planFusion", () => {
  it("regla 1: un solo candidato no da plan", () => {
    const plan = planFusion([CON_AJUSTES({})]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    // Caso rescatado de la rama nube/40848921665: la negativa dice su motivo (texto de hoy).
    expect(plan.motivo).toContain("al menos dos");
  });

  it("regla 2: dueños distintos no se mezclan", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "p1", dueno: "alex" }),
      CON_AJUSTES({ id: "p2", dueno: "otra_persona" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
  });

  it("regla 3: dos adaptadores del mismo base ⇒ PEFT linear", () => {
    const base = { tipo: "adaptador" as const, baseId: "Qwen/Qwen3-2B" };
    const plan = planFusion([CON_AJUSTES({ ...base, id: "a1" }), CON_AJUSTES({ ...base, id: "a2" })]);
    expect(plan.estrategia).toBe("adaptadores-ponderados");
    expect(plan.herramienta).toBe("peft");
    expect(plan.metodo).toBe("linear");
    expect(plan.pasos.some((paso) => paso.includes("add_weighted_adapter"))).toBe(true);
  });

  it("regla 3 con tres adaptadores ⇒ PEFT ties con densidad 0,5", () => {
    const base = { tipo: "adaptador" as const, baseId: "Qwen/Qwen3-2B" };
    const grupo = ["a1", "a2", "a3"].map((id) => CON_AJUSTES({ ...base, id }));
    const plan = planFusion(grupo);
    expect(plan.metodo).toBe("ties");
    expect(plan.pasos.some((paso) => paso.includes("densidad 0,5"))).toBe(true);
    expect(plan.pasos.some((paso) => paso.includes("capas_banco"))).toBe(true);
  });

  it("regla 4: Needle con otra arquitectura ⇒ ensamble de sistema", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "n1", arquitectura: "needle-3", parametrosB: 0.02 }),
      CON_AJUSTES({ id: "b1", arquitectura: "BitNet-1.58", parametrosB: 2 }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.herramienta).toBe("sistema");
    expect(plan.motivo).toContain("no hay fusión de pesos");
    expect(plan.bloqueos.some((b) => b.includes("needle finetune"))).toBe(true);
  });

  it("regla 5: arquitecturas distintas sin Needle ⇒ ensamble con MoA", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "q1", arquitectura: "Qwen3.5" }),
      CON_AJUSTES({ id: "b1", arquitectura: "BitNet-1.58" }),
    ]);
    expect(plan.estrategia).toBe("ensamble-sistema");
    expect(plan.motivo).toBe("no hay fusión de pesos entre arquitecturas distintas");
    expect(plan.pasos.some((paso) => paso.includes("src/ai/moa/runtime.ts"))).toBe(true);
  });

  it("regla 2: lo privado no se mezcla con lo público", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "p1", ambito: "privado" }),
      CON_AJUSTES({ id: "p2", ambito: "publico" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("regla 7: dos pesos Qwen bf16 ⇒ mergekit slerp", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "q1", vocab: 151936 }),
      CON_AJUSTES({ id: "q2", vocab: 151936 }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.herramienta).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
    expect(plan.pasos.some((paso) => paso.includes("programa externo (LGPL-3.0)"))).toBe(true);
    expect(plan.pasos.some((paso) => paso.includes("capas_banco"))).toBe(true);
  });

  it("regla 7: tres pesos bf16 con base común ⇒ mergekit ties", () => {
    const base = { baseId: "Qwen/Qwen3-2B", vocab: 151936 };
    const grupo = ["q1", "q2", "q3"].map((id) => CON_AJUSTES({ ...base, id }));
    expect(planFusion(grupo).metodo).toBe("ties");
  });

  it("regla 7: tres pesos bf16 sin base común ⇒ mergekit linear", () => {
    const grupo = ["q1", "q2", "q3"].map((id) => CON_AJUSTES({ id, vocab: 151936 }));
    expect(planFusion(grupo).metodo).toBe("linear");
  });

  it("regla 7: pesos ternarios empaquetados ⇒ ninguna con ruta bf16", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "b1", empaquetado: "ternario-empaquetado" }),
      CON_AJUSTES({ id: "b2", empaquetado: "ternario-empaquetado" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos.some((b) => b.includes("no está en bf16"))).toBe(true);
    expect(plan.pasos.some((paso) => paso.includes("*-unpacked"))).toBe(true);
    expect(plan.pasos.some((paso) => paso.includes("recuantizar"))).toBe(true);
  });

  it("regla 7: tamaños distintos ⇒ ninguna con bloqueo", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "q1", parametrosB: 2, vocab: 151936 }),
      CON_AJUSTES({ id: "q2", parametrosB: 4, vocab: 151936 }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    expect(plan.bloqueos.length).toBeGreaterThan(0);
  });

  it("regla 7: vocab distintos ⇒ ninguna con bloqueo", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "q1", vocab: 151936 }),
      CON_AJUSTES({ id: "q2", vocab: 32000 }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.bloqueos.length).toBeGreaterThan(0);
  });

  it("regla 7: vocab solo indicado en un candidato no bloquea la fusión", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "q1", vocab: 151936 }),
      CON_AJUSTES({ id: "q2" }),
    ]);
    expect(plan.estrategia).toBe("mergekit");
    expect(plan.metodo).toBe("slerp");
  });

  it("regla 6: adaptador + pesos de la misma arquitectura ⇒ merge_and_unload primero", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "q1", tipo: "adaptador", baseId: "Qwen/Qwen3-2B" }),
      CON_AJUSTES({ id: "q2", baseId: "Qwen/Qwen3-2B" }),
      CON_AJUSTES({ id: "q3", baseId: "Qwen/Qwen3-2B" }),
    ]);
    expect(plan.pasos[0]).toContain("merge_and_unload");
    expect(plan.estrategia).toBe("mergekit");
  });

  it("regla 6: adaptador + pesos ternarios conserva el paso previo en la ruta bf16", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "a1", tipo: "adaptador", baseId: "Qwen/Qwen3-2B" }),
      CON_AJUSTES({ id: "b1", empaquetado: "ternario-empaquetado" }),
      CON_AJUSTES({ id: "b2", empaquetado: "ternario-empaquetado" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.pasos[0]).toContain("merge_and_unload");
    expect(plan.pasos.some((paso) => paso.includes("*-unpacked"))).toBe(true);
  });

  it("adaptadores con bases distintas no se fusionan entre sí", () => {
    const plan = planFusion([
      CON_AJUSTES({ id: "a1", tipo: "adaptador", baseId: "Qwen/Qwen3-2B" }),
      CON_AJUSTES({ id: "a2", tipo: "adaptador", baseId: "Qwen/Qwen3-4B" }),
    ]);
    expect(plan.estrategia).toBe("ninguna");
    expect(plan.herramienta).toBeNull();
    expect(plan.motivo).toContain("PEFT exige el mismo modelo base");
    expect(plan.bloqueos.some((b) => b.includes("modelos base distintos"))).toBe(true);
  });
});
