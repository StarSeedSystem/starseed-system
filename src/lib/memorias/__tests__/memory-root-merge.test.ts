import { describe, expect, it } from "vitest";

import type { MemoryRootBranch } from "../memory-root";
import { planificarMerge, type PlanMerge } from "../memory-root-merge";

/** Crea una rama del contrato portátil con valores mínimos sensatos. */
function rama(archivo: string, extras: Partial<MemoryRootBranch> = {}): MemoryRootBranch {
  return { rama: archivo.split("/")[0], tipo: "memory", archivo, ...extras };
}

describe("planificarMerge · subida y bajada por archivo", () => {
  it("una rama que solo existe en local se PROPONE SUBIR", () => {
    const plan = planificarMerge([rama("soul/soul.md", { hash: "a1" })], []);
    expect(plan.ramas[0].accion).toBe("subir");
    expect(plan.subir).toBe(1);
  });

  it("una rama que solo existe en el destino se PROPONE BAJAR", () => {
    const plan = planificarMerge([], [rama("memory/log.md", { hash: "b2" })]);
    expect(plan.ramas[0].accion).toBe("bajar");
    expect(plan.bajar).toBe(1);
  });

  it("la misma rama con el mismo hash queda INTACTA", () => {
    const plan = planificarMerge([rama("soul.md", { hash: "a1" })], [rama("soul.md", { hash: "a1" })]);
    expect(plan.ramas[0].accion).toBe("intacto");
    expect(plan.intactos).toBe(1);
  });

  it("la misma rama con hash distinto en ambas partes es CONFLICTO", () => {
    const plan = planificarMerge([rama("soul.md", { hash: "a1" })], [rama("soul.md", { hash: "a2" })]);
    expect(plan.ramas[0].accion).toBe("conflicto");
    expect(plan.conflictos).toBe(1);
  });
});

describe("planificarMerge · el scope manda sobre la propagación", () => {
  it("la misma rama con scope DISTINTO en cada parte NO se toca", () => {
    const plan = planificarMerge(
      [rama("m.md", { scope: "global", hash: "a" })],
      [rama("m.md", { scope: "chat-x", hash: "a" })],
    );
    expect(plan.ramas[0]).toMatchObject({ accion: "sinSync", scopeLocal: "global", scopeDestino: "chat-x" });
    expect(plan.sinSync).toBe(1);
  });

  it("el scope sin declarar se trata como global en los dos lados", () => {
    const plan = planificarMerge([rama("skills/uno.md")], [rama("skills/uno.md")]);
    expect(plan.ramas[0].accion).toBe("intacto");
  });

  it("un scope protegido de la opción JAMÁS sale de su lado", () => {
    const plan = planificarMerge([rama("m.md", { scope: "chat-x", hash: "a" })], [], {
      scopesProtegidos: ["chat-x"],
    });
    expect(plan.ramas[0].accion).toBe("sinSync");
    expect(plan.subir).toBe(0);
  });

  it("un scope protegido que existiría en el destino tampoco se baja", () => {
    const plan = planificarMerge([], [rama("m.md", { scope: "chat-x", hash: "a" })], {
      scopesProtegidos: ["chat-x"],
    });
    expect(plan.ramas[0].accion).toBe("sinSync");
    expect(plan.bajar).toBe(0);
  });
});

describe("planificarMerge · determinismo y resumen", () => {
  it("el plan sale ORDENADO por archivo y repite igual en cada llamada", () => {
    const local = [rama("z.md", { hash: "1" }), rama("a.md", { hash: "2" }), rama("m.md", { hash: "3" })];
    const destino = [rama("m.md", { hash: "3" })];
    const esperado: PlanMerge = planificarMerge(local, destino);
    expect(esperado.ramas.map((r) => r.archivo)).toEqual(["a.md", "m.md", "z.md"]);
    expect(planificarMerge(local, destino)).toEqual(esperado);
  });

  it("el resumen reparte cada rama en su cubo y solo hay una por archivo", () => {
    const plan = planificarMerge(
      [rama("a/nueva.md", { hash: "1" }), rama("b/igual.md", { hash: "x" })],
      [rama("b/igual.md", { hash: "y" }), rama("c/remota.md", { hash: "2" })],
    );
    expect(plan.ramas.map((r) => r.accion)).toEqual(["subir", "conflicto", "bajar"]);
    expect(plan).toMatchObject({ subir: 1, bajar: 1, conflictos: 1, intactos: 0, sinSync: 0 });
    expect(plan.ramas).toHaveLength(3);
  });

  it("un archivo duplicado en el mismo lado solo produce UNA entrada", () => {
    const plan = planificarMerge([rama("a/a.md", { hash: "1" }), rama("a/a.md", { hash: "yy" })], []);
    expect(plan.ramas).toHaveLength(1);
    expect(plan.subir).toBe(1);
  });
});
