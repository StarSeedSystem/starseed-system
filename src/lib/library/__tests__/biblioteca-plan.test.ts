import { describe, it, expect } from "vitest";
import type { EntityLibraryDoc, SavedItem } from "@/lib/library/entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";
import { planificar, resumenPlan } from "@/lib/library/biblioteca-plan";

const refA: EntityRef = { kind: "user" as any, id: "a" };
const refB: EntityRef = { kind: "user" as any, id: "b" };

function makeItem(id: string, overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    id,
    type: "post" as any,
    title: `item-${id}`,
    tags: [],
    addedAt: new Date().toISOString(),
    addedBy: "a",
    ...overrides,
  } as SavedItem;
}

function makeDoc(items: SavedItem[]): EntityLibraryDoc {
  return {
    items,
    folders: [],
    rev: 1,
    updatedAt: new Date().toISOString(),
  } as EntityLibraryDoc;
}

const permisosAllow = {
  puedeVer: () => true,
  puedeEditar: () => true,
};

describe("biblioteca-plan", () => {
  it("planifica copiar", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]), "user:b": makeDoc([]) };
    const plan = planificar({ tipo: "copiar", origen: refA, destino: refB, itemIds: ["1"] }, inst, permisosAllow);
    expect(plan.vistaPrevia.crea).toContain("1");
    expect(plan.validacion.ok).toBe(true);
  });

  it("sin permisos da error en español", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]), "user:b": makeDoc([]) };
    const permisos = { puedeVer: () => true, puedeEditar: () => false };
    const plan = planificar({ tipo: "copiar", origen: refA, destino: refB, itemIds: ["1"] }, inst, permisos);
    expect(plan.validacion.ok).toBe(false);
    expect(plan.validacion.errores.some((e) => typeof e === "string" && /permiso/i.test(e))).toBe(true);
  });

  it("ultima copia avisa", () => {
    const inst = { "user:a": makeDoc([makeItem("1", { refId: "r1" })]) };
    const plan = planificar({ tipo: "quitar", origen: refA, itemIds: ["1"] }, inst, permisosAllow);
    expect(plan.vistaPrevia.ultimaCopia).toContain("1");
    expect(plan.validacion.avisos.some((a) => /última copia/i.test(a))).toBe(true);
  });

  it("fusionar no borra", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]), "user:b": makeDoc([makeItem("2")]) };
    const plan = planificar({ tipo: "fusionar", origen: refA, destino: refB }, inst, permisosAllow);
    expect(plan.vistaPrevia.quitaReversible.length).toBe(0);
    expect(plan.validacion.ok).toBe(true);
  });

  it("deduplicar solo propone", () => {
    const inst = { "user:a": makeDoc([makeItem("1", { refId: "x" }), makeItem("2", { refId: "x" })]) };
    const plan = planificar({ tipo: "deduplicar", origen: refA }, inst, permisosAllow);
    expect(plan.validacion.avisos.some((a) => /confirmación humana/i.test(a))).toBe(true);
    expect(plan.vistaPrevia.quitaReversible.length).toBe(0);
  });

  it("planificar dos veces da lo mismo", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]), "user:b": makeDoc([]) };
    const p1 = planificar({ tipo: "copiar", origen: refA, destino: refB, itemIds: ["1"] }, inst, permisosAllow);
    const p2 = planificar({ tipo: "copiar", origen: refA, destino: refB, itemIds: ["1"] }, inst, permisosAllow);
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
  });

  it("diario deshace copiar", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]), "user:b": makeDoc([]) };
    const plan = planificar({ tipo: "copiar", origen: refA, destino: refB, itemIds: ["1"] }, inst, permisosAllow);
    expect(plan.deshacer.some((d) => d.op === "quitar" && d.itemId === "1")).toBe(true);
  });

  it("diario deshace quitar", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]) };
    const plan = planificar({ tipo: "quitar", origen: refA, itemIds: ["1"] }, inst, permisosAllow);
    expect(plan.deshacer.some((d) => d.op === "restaurar" && d.itemId === "1")).toBe(true);
  });

  it("resumenPlan en español", () => {
    const inst = { "user:a": makeDoc([makeItem("1")]), "user:b": makeDoc([]) };
    const plan = planificar({ tipo: "copiar", origen: refA, destino: refB, itemIds: ["1"] }, inst, permisosAllow);
    const s = resumenPlan(plan);
    expect(typeof s).toBe("string");
    expect(s).toMatch(/Copiar/i);
  });
});
