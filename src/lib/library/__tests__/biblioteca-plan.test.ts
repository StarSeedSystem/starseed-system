import { describe, it, expect } from "vitest";
import { planificar, resumenPlan } from "../biblioteca-plan";
import type { EntityLibraryDoc } from "../entity-library";

describe("biblioteca-plan", () => {
  it("debería planificar quitar un ítem y detectar última copia", () => {
    const item = { id: "item1", refId: "ref1", title: "Test", tags: [], addedAt: "...", addedBy: "..." } as any;
    const doc: EntityLibraryDoc = { items: [item], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const instantaneas = { "kind:id": doc };
    const permisos = { puedeVer: () => true, puedeEditar: () => true };
    
    const plan = planificar({ tipo: 'quitar', origen: { kind: 'kind', id: 'id' }, itemIds: ['item1'] }, instantaneas, permisos);
    
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.quitaReversible).toContain("Test");
    expect(plan.vistaPrevia.ultimaCopia).toContain("item1");
    expect(resumenPlan(plan)).toContain("quitaría 1");
  });

  it("debería planificar copiar un ítem sin colisión", () => {
    const item = { id: "item1", refId: "ref1", title: "Test", tags: [], addedAt: "...", addedBy: "..." } as any;
    const docOrigen: EntityLibraryDoc = { items: [item], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const docDestino: EntityLibraryDoc = { items: [], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const instantaneas = { "origen:id": docOrigen, "destino:id": docDestino };
    const permisos = { puedeVer: () => true, puedeEditar: () => true };
    
    const plan = planificar({ tipo: 'copiar', origen: { kind: 'origen', id: 'id' }, destino: { kind: 'destino', id: 'id' } }, instantaneas, permisos);
    
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.crea).toContain("item1");
  });

  it("debería fallar si no hay permisos de lectura", () => {
    const item = { id: "item1", refId: "ref1", title: "Test", tags: [], addedAt: "...", addedBy: "..." } as any;
    const doc: EntityLibraryDoc = { items: [item], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const instantaneas = { "kind:id": doc };
    const permisos = { puedeVer: () => false, puedeEditar: () => false };
    
    const plan = planificar({ tipo: 'quitar', origen: { kind: 'kind', id: 'id' }, itemIds: ['item1'] }, instantaneas, permisos);
    
    expect(plan.validacion.ok).toBe(false);
    expect(plan.validacion.errores.length).toBeGreaterThan(0);
  });

  it("debería fusionar sin borrar", () => {
    const item1 = { id: "item1", refId: "ref1", title: "Test 1", tags: [], addedAt: "...", addedBy: "..." } as any;
    const item2 = { id: "item2", refId: "ref2", title: "Test 2", tags: [], addedAt: "...", addedBy: "..." } as any;
    const docOrigen: EntityLibraryDoc = { items: [item1, item2], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const docDestino: EntityLibraryDoc = { items: [item1], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const instantaneas = { "origen:id": docOrigen, "destino:id": docDestino };
    const permisos = { puedeVer: () => true, puedeEditar: () => true };
    
    const plan = planificar({ tipo: 'fusionar', origen: { kind: 'origen', id: 'id' }, destino: { kind: 'destino', id: 'id' } }, instantaneas, permisos);
    
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.crea).toContain("item2");
    expect(plan.vistaPrevia.crea).not.toContain("item1");
  });

  it("debería deduplicar solo proponiendo", () => {
    const item1 = { id: "item1", refId: "ref1", title: "Test", tags: [], addedAt: "...", addedBy: "..." } as any;
    const item2 = { id: "item2", refId: "ref1", title: "Test Duplicado", tags: [], addedAt: "...", addedBy: "..." } as any;
    const doc: EntityLibraryDoc = { items: [item1, item2], folders: [], rev: 1, updatedAt: "...", deletedItems: {}, deletedFolders: {} };
    const instantaneas = { "kind:id": doc };
    const permisos = { puedeVer: () => true, puedeEditar: () => true };
    
    const plan = planificar({ tipo: 'deduplicar', origen: { kind: 'kind', id: 'id' } }, instantaneas, permisos);
    
    expect(plan.validacion.ok).toBe(true);
    expect(plan.vistaPrevia.modifica).toContain("item2");
    expect(plan.validacion.avisos.length).toBeGreaterThan(0);
  });
});
