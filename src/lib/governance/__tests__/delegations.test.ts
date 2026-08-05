// StarSeed · Voto líquido delegado — tests de `computeEffectiveWeights`
// (src/lib/governance/delegations.ts). Función PURA: dado el conjunto de
// votos directos y las delegaciones activas de un tema, devuelve el peso
// EFECTIVO por votante (propia voz + lo que le delegaron y no fue reclamado).
import { describe, expect, it } from "vitest";
import { computeEffectiveWeights, topicForProposal, topicForScope } from "@/lib/governance/delegations";
import type { Delegation } from "@/lib/governance/delegations";

const future = () => new Date(Date.now() + 999 * 60_000).toISOString();

function deleg(delegator: string, delegate: string, topic = "group:g1"): Delegation {
  return { delegator_user: delegator, delegate_user: delegate, topic, expires_at: future() };
}

describe("computeEffectiveWeights", () => {
  it("sin delegaciones, cada votante pesa 1 (comportamiento base 1 persona = 1 voto)", () => {
    const w = computeEffectiveWeights([{ voter: "a" }, { voter: "b" }], []);
    expect(w).toEqual({ a: 1, b: 1 });
  });

  it("el peso delegado se PLIEGA sobre quien vota; el delegante (que no votó) no aparece", () => {
    const w = computeEffectiveWeights([{ voter: "a" }], [deleg("x", "a")]);
    expect(w).toEqual({ a: 2 });
  });

  it("varios delegantes ACUMULAN sobre el mismo delegado", () => {
    const w = computeEffectiveWeights([{ voter: "d" }], [deleg("a", "d"), deleg("b", "d")]);
    expect(w).toEqual({ d: 3 });
  });

  it("pliega CADENAS de delegación (A→B→C) hacia quien vota, sumando cada eslabón", () => {
    const w = computeEffectiveWeights([{ voter: "c" }], [deleg("a", "b"), deleg("b", "c")]);
    expect(w).toEqual({ c: 3 }); // propia voz de c + la de a (vía b) + la de b
  });

  it("un delegante que vota DIRECTAMENTE reclama su propio peso (no se transfiere ni se duplica)", () => {
    const w = computeEffectiveWeights([{ voter: "a" }, { voter: "x" }], [deleg("x", "a")]);
    expect(w).toEqual({ a: 1, x: 1 });
  });

  it("rompe CICLOS de delegación (A→B, B→A) sin lanzar y sin inflar el conteo", () => {
    const w = computeEffectiveWeights([{ voter: "c" }], [deleg("a", "b"), deleg("b", "a")]);
    expect(w).toEqual({ c: 1 }); // a y b no aparecen: nadie en el ciclo votó
  });

  it("si nadie en la cadena de delegación vota, el peso simplemente no se ejerce", () => {
    const w = computeEffectiveWeights([{ voter: "z" }], [deleg("a", "b")]); // b nunca vota
    expect(w).toEqual({ z: 1 });
  });
});

describe("topicForProposal / topicForScope", () => {
  it("compone 'scope:ref' cuando hay scope_ref", () => {
    expect(topicForProposal({ scope: "group", scope_ref: "abc" })).toBe("group:abc");
  });

  it("usa solo el scope cuando scope_ref es null (p.ej. propuestas globales)", () => {
    expect(topicForProposal({ scope: "global", scope_ref: null })).toBe("global");
  });

  it("topicForScope (UI de delegación) es equivalente a topicForProposal", () => {
    expect(topicForScope("page", "xyz")).toBe("page:xyz");
    expect(topicForScope("account")).toBe("account");
  });
});
