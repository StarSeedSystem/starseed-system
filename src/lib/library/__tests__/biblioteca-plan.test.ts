import { describe, it, expect } from "vitest";
import { planificar, resumenPlan } from "../biblioteca-plan";
import type { EntityLibraryDoc, SavedItem } from "../entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";

function makeRef(kind: EntityRef["kind"], id: string): EntityRef {
  return { kind, id };
}

function makeItem(id: string, partial: Partial<SavedItem> = {}): SavedItem {
  return {
    id,
    type: "post",
    title: `Item ${id}`,
    tags: [],
    addedAt: "2026-01-01T00:00:00.000Z",
    addedBy: "u1",
    ...partial,
  };
}

function makeDoc(items: SavedItem[] = []): EntityLibraryDoc {
  return {
    items,
    folders: [],
    rev: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 3,
  };
}

const permisosPermiso = {
  puedeVer: () => true,
  puedeEditar: () => true,
};

describe("biblioteca-plan", () => {
  it("copiar: planifica creación y diario para deshacer", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1", { refId: "r1" })]),
      [destino.kind + ":" + destino.id]: makeDoc([]),
    };
    const plan = planificar({ tipo: "copiar", origen, destino }, instantaneas, permisosPermiso);
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.crea).toContain("i1");
    expect(plan.deshacer.some((d) => d.op === "quitar" && d.itemId === "i1")).toBe(true);
  });

  it("mover: usa lápida reversible", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1")]),
      [destino.kind + ":" + destino.id]: makeDoc([]),
    };
    const plan = planificar({ tipo: "mover", origen, destino }, instantaneas, permisosPermiso);
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.quitaReversible).toContain("i1");
  });

  it("quitar: diario restaura", () => {
    const origen = makeRef("user", "o1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1")]),
    };
    const plan = planificar({ tipo: "quitar", origen }, instantaneas, permisosPermiso);
    expect(plan.validacion.ok).toBe(true);
    expect(plan.deshacer.some((d) => d.op === "restaurar" && d.itemId === "i1")).toBe(true);
  });

  it("fusionar no borra", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1", { refId: "r1" })]),
      [destino.kind + ":" + destino.id]: makeDoc([makeItem("d2")]),
    };
    const plan = planificar({ tipo: "fusionar", origen, destino }, instantaneas, permisosPermiso);
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.quitaReversible.length).toBe(0);
  });

  it("deduplicar solo propone", () => {
    const ref = makeRef("user", "u1");
    const instantaneas = {
      [ref.kind + ":" + ref.id]: makeDoc([
        makeItem("i1", { refId: "r1" }),
        makeItem("i2", { refId: "r1" }),
      ]),
    };
    const plan = planificar({ tipo: "deduplicar", origen: ref }, instantaneas, permisosPermiso);
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.modifica.length).toBeGreaterThan(0);
    expect(plan.vistaPrevia.quitaReversible.length).toBeGreaterThan(0);
    const aviso = plan.validacion.avisos.some((a) => a.includes("NO se quita nada"));
    expect(aviso).toBe(true);
  });

  it("sin permisos: error en español", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1")]),
      [destino.kind + ":" + destino.id]: makeDoc([]),
    };
    const sinPermiso = {
      puedeVer: () => false,
      puedeEditar: () => false,
    };
    const plan = planificar({ tipo: "copiar", origen, destino }, instantaneas, sinPermiso);
    expect(plan.validacion.ok).toBe(false);
    expect(plan.validacion.errores.length).toBeGreaterThan(0);
  });

  it("ultima copia avisa", () => {
    const origen = makeRef("user", "o1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1", { refId: "r1" })]),
    };
    const plan = planificar({ tipo: "quitar", origen }, instantaneas, permisosPermiso);
    expect(plan.vistaPrevia.ultimaCopia).toContain("i1");
    expect(plan.validacion.avisos.some((a) => a.includes("última copia"))).toBe(true);
  });

  it("planificar dos veces da lo mismo", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1")]),
      [destino.kind + ":" + destino.id]: makeDoc([]),
    };
    const p1 = planificar({ tipo: "copiar", origen, destino }, instantaneas, permisosPermiso);
    const p2 = planificar({ tipo: "copiar", origen, destino }, instantaneas, permisosPermiso);
    expect(p1.vistaPrevia.crea).toEqual(p2.vistaPrevia.crea);
    expect(p1.vistaPrevia.omite).toEqual(p2.vistaPrevia.omite);
  });

  it("resumenPlan en español", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1"), makeItem("i2"), makeItem("i3")]),
      [destino.kind + ":" + destino.id]: makeDoc([]),
    };
    const plan = planificar({ tipo: "copiar", origen, destino }, instantaneas, permisosPermiso);
    const r = resumenPlan(plan);
    expect(r).toContain("Copiarías");
  });

  it("destino igual al origen da error", () => {
    const ref = makeRef("user", "u1");
    const instantaneas = {
      [ref.kind + ":" + ref.id]: makeDoc([makeItem("i1")]),
    };
    const plan = planificar({ tipo: "copiar", origen: ref, destino: ref }, instantaneas, permisosPermiso);
    expect(plan.validacion.ok).toBe(false);
  });

  it("copiar no pisa mismo id o refId", () => {
    const origen = makeRef("user", "o1");
    const destino = makeRef("user", "d1");
    const instantaneas = {
      [origen.kind + ":" + origen.id]: makeDoc([makeItem("i1", { refId: "r1" })]),
      [destino.kind + ":" + destino.id]: makeDoc([makeItem("i2", { refId: "r1" })]),
    };
    const plan = planificar({ tipo: "copiar", origen, destino }, instantaneas, permisosPermiso);
    expect(plan.vistaPrevia.crea.length).toBe(0);
    expect(plan.vistaPrevia.omite.length).toBeGreaterThan(0);
  });

  it("deduplicar nunca quita ultima copia", () => {
    const ref = makeRef("user", "u1");
    const instantaneas = {
      [ref.kind + ":" + ref.id]: makeDoc([
        makeItem("i1", { refId: "r1" }),
        makeItem("i2", { refId: "r1" }),
      ]),
    };
    const plan = planificar({ tipo: "deduplicar", origen: ref }, instantaneas, permisosPermiso);
    // ambas tienen refId r1, solo 2 copias total en ese doc? pero cuenta todas las instantaneas
    // debe proponer solo el segundo
    expect(plan.vistaPrevia.modifica).toContain("i2");
  });
});
