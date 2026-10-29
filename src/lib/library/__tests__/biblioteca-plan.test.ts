import { describe, it, expect } from "vitest";
import { planificar, resumenPlan, type OperacionBiblioteca, type PermisosBiblioteca } from "../biblioteca-plan";
import type { EntityLibraryDoc, SavedItem } from "../entity-library";

const item = (id: string, extra: Partial<SavedItem> = {}): SavedItem => ({
    id, type: "post", title: `t-${id}`, tags: [], folderId: null, addedAt: "2026-01-01T00:00:00Z", addedBy: "alex", ...extra,
});
const doc = (items: SavedItem[]): EntityLibraryDoc => ({
    items, folders: [], rev: 0, updatedAt: "2026-01-01T00:00:00Z", deletedItems: {}, deletedFolders: {},
});
const O = { kind: "user" as const, id: "alex" };
const D = { kind: "group" as const, id: "club" };
const TODO_OK: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: () => true };

function instCon(destino: EntityLibraryDoc): Record<string, EntityLibraryDoc> {
    return {
        "user:alex": doc([item("a", { refId: "r1" }), item("b", { url: "https://x.y", folderId: "f1" }), item("c")]),
        "group:club": destino,
    };
}

describe("biblioteca-plan · planificar", () => {
    it("copiar crea, no pisa id/refId y el diario deshace quitando lo creado", () => {
        const plan = planificar({ tipo: "copiar", origen: O, destino: D }, instCon(doc([item("a2", { refId: "r1" })])), TODO_OK);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["b", "c"]);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "a", motivo: expect.stringContaining("guarda esta referencia") },
        ]);
        expect(plan.deshacer).toEqual([
            { op: "quitar", ref: D, itemId: "b" },
            { op: "quitar", ref: D, itemId: "c" },
        ]);
    });

    it("copiar omite si el destino ya tiene un ítem con el mismo id", () => {
        const plan = planificar({ tipo: "copiar", origen: O, destino: D }, instCon(doc([item("c", { title: "duplicado" })])), TODO_OK);
        expect(plan.vistaPrevia.crea).toEqual(["a", "b"]);
        expect(plan.vistaPrevia.omite[0]?.id).toBe("c");
        expect(plan.vistaPrevia.omite[0]?.motivo).toContain("mismo id");
    });

    it("sin permiso o destino igual al origen, error en español (nunca silencio)", () => {
        const sinEditar: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: () => false };
        const doce = instCon(doc([]));
        expect(planificar({ tipo: "copiar", origen: O, destino: D }, doce, sinEditar).validacion.errores.join(" "))
            .toContain("No tienes permiso para editar");
        expect(planificar({ tipo: "copiar", origen: O, destino: O }, doce, TODO_OK).validacion.errores)
            .toContain("El origen y el destino son la misma biblioteca.");
    });

    it("mover usa lápida reversible, guarda carpeta en el diario y avisa si es la última copia", () => {
        const plan = planificar({ tipo: "mover", origen: O, destino: D, itemIds: ["b"] }, instCon(doc([])), TODO_OK);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["b"]);
        expect(plan.deshacer).toEqual([{ op: "mover", ref: O, itemId: "b", haciaCarpeta: "f1" }]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["b"]);
        expect(plan.validacion.avisos.join(" ")).toContain("es la última copia: haz una antes de quitarla");
    });

    it("quitar es reversible, restaurando; no es última copia si otra biblioteca la conserva", () => {
        const plan = planificar({ tipo: "quitar", origen: O, itemIds: ["b"] }, instCon(doc([item("z", { url: "https://x.y" })])), TODO_OK);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["b"]);
        expect(plan.deshacer).toEqual([{ op: "restaurar", ref: O, itemId: "b" }]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos).toEqual([]);
    });

    it("fusionar trae lo que falta y nunca borra lo que el destino ya tiene", () => {
        const plan = planificar({ tipo: "fusionar", origen: O, destino: D }, instCon(doc([item("otra", { refId: "r1" })])), TODO_OK);
        expect(plan.vistaPrevia.crea).toEqual(["b", "c"]);
        expect(plan.vistaPrevia.omite[0]).toEqual({ id: "a", motivo: expect.any(String) });
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.vistaPrevia.modifica).toEqual([]);
    });

    it("deduplicar solo propone (no quita nada) y jamás propone una última copia", () => {
        const instantaneas = { "user:alex": doc([
            item("u1", { refId: "dup" }), item("u2", { refId: "dup" }),
            item("v1", { title: "igual", type: "bookmark" as const }), item("v2", { title: "igual", type: "bookmark" as const }),
        ]) };
        const plan = planificar({ tipo: "deduplicar", origen: O }, instantaneas, TODO_OK);
        expect(plan.vistaPrevia.modifica).toEqual(["u2"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.validacion.avisos.join(" ")).toContain("no se quita nada sin confirmación humana");
    });

    it("un acl que no permite la acción del ítem lo omite con motivo", () => {
        const permisos: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: (r, it) => it?.id !== "c" };
        const plan = planificar({ tipo: "quitar", origen: O }, instCon(doc([])), permisos);
        expect(plan.vistaPrevia.omite).toEqual([{ id: "c", motivo: expect.stringContaining("acl") }]);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["a", "b"]);
    });

    it("planificar dos veces da exactamente lo mismo", () => {
        const doce = instCon(doc([item("a2", { refId: "r1" })]));
        const p1 = JSON.stringify(planificar({ tipo: "copiar", origen: O, destino: D }, doce, TODO_OK));
        const p2 = JSON.stringify(planificar({ tipo: "copiar", origen: O, destino: D }, doce, TODO_OK));
        expect(p1).toBe(p2);
    });
});

describe("biblioteca-plan · resumenPlan", () => {
    it("resume en español los planes", () => {
        expect(resumenPlan(planificar({ tipo: "copiar", origen: O, destino: D }, instCon(doc([])), TODO_OK)))
            .toMatch(/^Copiarías 3, omitirías 0\.$/);
        expect(resumenPlan(planificar({ tipo: "quitar", origen: O }, instCon(doc([])), TODO_OK)))
            .toContain("Quitarías 3 (reversible)");
    });
});
