import { describe, it, expect } from "vitest";
import { planificar, resumenPlan } from "../biblioteca-plan";
import type { EntityRef, EntityLibraryDoc } from "../entity-library";

describe("biblioteca-plan", () => {
  const docA = { kind: "user" as const, id: "a" };
  const docB = { kind: "user" as const, id: "b" };
  const permisos: { puedeVer(ref: EntityRef, item?: string): boolean; puedeEditar(ref: EntityRef, item?: string): boolean } = {
    puedeVer: () => true,
    puedeEditar: () => true,
  };

  const baseDoc = (items: any[]): EntityLibraryDoc => ({
    items,
    folders: [],
    rev: 1,
    updatedAt: new Date().toISOString(),
    version: 3,
    deletedItems: {},
    deletedFolders: {},
  });

  const instantaneas: Record<string, EntityLibraryDoc> = {
    "user:a": baseDoc([
      { id: "i1", type: "package", title: "Item 1", refId: "ref1", url: "url1", tags: [], addedAt: "", addedBy: "" },
      { id: "i2", type: "package", title: "Item 2", refId: "ref2", url: "url2", tags: [], addedAt: "", addedBy: "" },
    ]),
    "user:b": baseDoc([
      { id: "i3", type: "package", title: "Item 3", refId: "ref3", url: "url3", tags: [], addedAt: "", addedBy: "" },
    ]),
  };

  it("copiar crea sin conflicto", () => {
    const plan = planificar(
      { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] },
      instantaneas,
      permisos
    );
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.crea).toEqual(["i1"]);
    expect(plan.vistaPrevia.omite).toHaveLength(0);
    expect(resumenPlan(plan)).toContain("Copiarías 1");
  });

  it("copiar omite cuando ya existe por refId", () => {
    const iss: Record<string, EntityLibraryDoc> = { ...instantaneas };
    iss["user:b"] = baseDoc([
      { id: "i99", type: "package", title: "Otro", refId: "ref1", url: "otro", tags: [], addedAt: "", addedBy: "" },
    ]);
    const plan = planificar(
      { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] },
      iss,
      permisos
    );
    expect(plan.vistaPrevia.crea.length).toBe(0);
    expect(plan.vistaPrevia.omite[0].id).toBe("i1");
  });

  it("sin permisos devuelve error", () => {
    const bad = { puedeVer: () => false, puedeEditar: () => false };
    const plan = planificar(
      { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] },
      instantaneas,
      bad
    );
    expect(plan.validacion.ok).toBe(false);
    expect(plan.validacion.errores.length).toBeGreaterThan(0);
  });

  it("mover detecta última copia y aviso", () => {
    const plan = planificar(
      { tipo: "mover", origen: docA, destino: docB, itemIds: ["i2"] },
      instantaneas,
      permisos
    );
    expect(plan.vistaPrevia.ultimaCopia).toContain("i2");
    expect(plan.validacion.avisos.some(a => a.includes("última copia"))).toBe(true);
  });

  it("deduplicar propone modificación", () => {
    const dupDoc = baseDoc([
      { id: "x1", type: "post", title: "T", refId: "r1", url: "", tags: [], addedAt: "", addedBy: "" },
      { id: "x2", type: "post", title: "T", refId: "r1", url: "", tags: [], addedAt: "", addedBy: "" },
    ]);
    const iss = { "user:a": dupDoc };
    const plan = planificar(
      { tipo: "deduplicar", origen: docA, itemIds: ["x1", "x2"] },
      iss,
      permisos
    );
    expect(plan.vistaPrevia.modifica.length).toBeGreaterThan(0);
  });

  it("planificar es determinista", () => {
    const p1 = planificar({ tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] }, instantaneas, permisos);
    const p2 = planificar({ tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] }, instantaneas, permisos);
    expect(resumenPlan(p1)).toBe(resumenPlan(p2));
    expect(p1.vistaPrevia.crea).toEqual(p2.vistaPrevia.crea);
  });

  it("deshacer contiene pasos para quitar", () => {
    const plan = planificar(
      { tipo: "quitar", origen: docA, itemIds: ["i1"] },
      instantaneas,
      permisos
    );
    expect(plan.deshacer.find(d => d.itemId === "i1")).toBeDefined();
  });

  it("fusionar nunca borra", () => {
    const plan = planificar(
      { tipo: "fusionar", origen: docA, destino: docB, itemIds: ["i1"] },
      instantaneas,
      permisos
    );
    expect(plan.vistaPrevia.quitaReversible.length).toBe(0);
  });
});