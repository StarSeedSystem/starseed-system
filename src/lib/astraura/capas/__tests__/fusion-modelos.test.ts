import { describe, it, expect } from "vitest";
import { planFusion, type Candidato } from "../fusion-modelos";

const base = (p: Partial<Candidato> = {}): Candidato => ({
  id: "qwen-a",
  arquitectura: "qwen3.5",
  parametrosB: 4,
  tipo: "pesos",
  empaquetado: "bf16",
  ambito: "publico",
  ...p,
});
const plan = (...cs: Partial<Candidato>[]) => planFusion(cs.map(base));
const pasos = (p: ReturnType<typeof planFusion>) => p.pasos.join(" | ");

describe("planFusion", () => {
  it("con menos de dos candidatos no hay nada que fusionar", () => {
    const p = plan({});
    expect([p.estrategia, p.herramienta]).toEqual(["ninguna", null]);
    expect(p.bloqueos.length).toBeGreaterThan(0);
  });

  it("no mezcla privado con público", () => {
    const p = plan({ ambito: "privado" }, {});
    expect(p.estrategia).toBe("ninguna");
    expect(p.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("tampoco mezcla dueños distintos", () => {
    const p = plan({ dueno: "ana" }, { dueno: "luis" });
    expect(p.estrategia).toBe("ninguna");
    expect(p.bloqueos).toContain("lo privado no se mezcla con lo público ni con lo de otra persona");
  });

  it("dos adaptadores del mismo base se combinan con PEFT en linear", () => {
    const p = plan({ id: "a1", tipo: "adaptador", baseId: "qwen-base" },
      { id: "a2", tipo: "adaptador", baseId: "qwen-base" });
    expect([p.estrategia, p.herramienta, p.metodo]).toEqual(["adaptadores-ponderados", "peft", "linear"]);
    expect(pasos(p)).toContain("add_weighted_adapter");
    expect(pasos(p)).toContain("banco de capas");
  });

  it("tres adaptadores del mismo base usan ties con densidad 0,5", () => {
    const p = plan({ tipo: "adaptador", baseId: "qwen-base" },
      { tipo: "adaptador", baseId: "qwen-base" }, { tipo: "adaptador", baseId: "qwen-base" });
    expect([p.estrategia, p.herramienta, p.metodo]).toEqual(["adaptadores-ponderados", "peft", "ties"]);
    expect(pasos(p)).toContain("densidad 0,5");
  });

  it("adaptadores con bases distintas no se combinan con PEFT", () => {
    const p = plan({ tipo: "adaptador", baseId: "base-uno" }, { tipo: "adaptador", baseId: "base-dos" });
    expect(p.estrategia).toBe("ninguna");
    expect(p.bloqueos).toContain("adaptadores con modelos base distintos");
  });

  it("Needle con otra arquitectura va a ensamble de sistema", () => {
    const p = plan({ arquitectura: "needle-3-san" }, { arquitectura: "bitnet-b1.58" });
    expect([p.estrategia, p.herramienta]).toEqual(["ensamble-sistema", "sistema"]);
    expect(pasos(p)).toContain("needle finetune");
    expect(pasos(p)).toContain("MoA");
  });

  it("arquitecturas distintas sin Needle van a ensamble con MoA y decisión híbrida", () => {
    const p = plan({ arquitectura: "bitnet-b1.58" }, { arquitectura: "qwen3.5" });
    expect(p.estrategia).toBe("ensamble-sistema");
    expect(p.motivo).toContain("no hay fusión de pesos entre arquitecturas distintas");
    expect(pasos(p)).toContain("MoA");
    expect(pasos(p)).toContain("decisión híbrida");
  });

  it("mezcla de adaptador y peso fusiona antes con merge_and_unload", () => {
    const p = plan({ tipo: "adaptador", baseId: "qwen-base" }, {});
    expect([p.estrategia, p.herramienta]).toEqual(["mergekit", "mergekit"]);
    expect(p.pasos[0]).toContain("merge_and_unload");
  });

  it("dos pesos Qwen en bf16 se fusionan con mergekit slerp", () => {
    const p = plan({}, { id: "qwen-b" });
    expect([p.estrategia, p.herramienta, p.metodo]).toEqual(["mergekit", "mergekit", "slerp"]);
    expect(pasos(p)).toContain("mergekit como programa externo");
    expect(pasos(p)).toContain("banco de capas");
  });

  it("tres pesos bf16 con base común usan ties en mergekit", () => {
    const p = plan({ baseId: "qwen-base" }, { baseId: "qwen-base" }, { baseId: "qwen-base" });
    expect([p.estrategia, p.metodo]).toEqual(["mergekit", "ties"]);
  });

  it("tres pesos bf16 sin base común caen a linear en mergekit", () => {
    const p = plan({}, { id: "qwen-b" }, { id: "qwen-c" });
    expect([p.estrategia, p.metodo]).toEqual(["mergekit", "linear"]);
  });

  it("dos ternarios empaquetados no se fusionan y marcan la ruta bf16", () => {
    const p = plan({ empaquetado: "ternario-empaquetado" }, { empaquetado: "ternario-empaquetado" });
    expect([p.estrategia, p.herramienta]).toEqual(["ninguna", null]);
    expect(p.bloqueos.join(" ")).toContain("se fusiona en bf16");
    expect(pasos(p)).toContain("unpacked");
    expect(pasos(p)).toContain("recuantizar");
    expect(pasos(p)).toContain("banco de capas");
  });

  it("tamaños de parámetros distintos bloquean la fusión", () => {
    const p = plan({ parametrosB: 4 }, { parametrosB: 8 });
    expect(p.estrategia).toBe("ninguna");
    expect(p.bloqueos.join(" ")).toContain("tamaño de parámetros");
  });

  it("vocabularios distintos también bloquean la fusión", () => {
    const p = plan({ vocab: 151936 }, { vocab: 152064 });
    expect(p.estrategia).toBe("ninguna");
    expect(p.bloqueos.join(" ")).toContain("vocabulario");
  });

  it("un tamaño dentro de ±1 % sigue siendo compatible", () => {
    const p = plan({ parametrosB: 4 }, { parametrosB: 4.04 });
    expect(p.estrategia).toBe("mergekit");
  });
});
