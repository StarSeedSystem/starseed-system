import { describe, it, expect } from "vitest";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "../entity-library";
import { planificar, resumenPlan, type PermisosBiblioteca } from "../biblioteca-plan";

const ana: EntityRef = { kind: "user", id: "ana" };
const luis: EntityRef = { kind: "user", id: "luis" };
const item = (id: string, extra: Partial<SavedItem> = {}): SavedItem => ({
    id, type: "external", title: id, tags: [], addedAt: "2026-01-01T00:00:00.000Z", addedBy: "ana", ...extra,
});
const doc = (...items: SavedItem[]): EntityLibraryDoc => ({ items, folders: [], rev: 0, updatedAt: "2026-01-01T00:00:00.000Z", version: 3 });
const snap = (origen: EntityLibraryDoc, destino: EntityLibraryDoc = doc()) => ({ "user:ana": origen, "user:luis": destino });
const todo: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: () => true };

describe("planificar · copiar", () => {
    it("crea solo lo que falta y omite el mismo id o el mismo refId (Entidad Única)", () => {
        const origen = doc(item("a1", { refId: "r1" }), item("a2"), item("a3"));
        const destino = doc(item("d1", { refId: "r1" }), item("a2"));
        const plan = planificar({ tipo: "copiar", origen: ana, destino: luis }, snap(origen, destino), todo);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["a3"]);
        expect(plan.vistaPrevia.omite.map((o) => o.id)).toEqual(["a1", "a2"]);
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: luis, itemId: "a3" }]);
    });
});

describe("planificar · mover", () => {
    it("deja lápida en origen, crea en destino y avisa de la última copia", () => {
        const origen = doc(item("a1", { refId: "r1", folderId: "f1" }));
        const plan = planificar({ tipo: "mover", origen: ana, destino: luis }, snap(origen), todo);
        expect(plan.vistaPrevia.crea).toEqual(["a1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["a1"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["a1"]);
        expect(plan.validacion.avisos.join(" ")).toContain("es la última copia");
        expect(plan.deshacer).toContainEqual({ op: "restaurar", ref: ana, itemId: "a1", haciaCarpeta: "f1" });
        expect(plan.deshacer).toContainEqual({ op: "quitar", ref: luis, itemId: "a1" });
    });
});

describe("planificar · fusionar", () => {
    it("trae lo que falta y nunca borra nada del origen ni del destino", () => {
        const origen = doc(item("a1", { refId: "r1" }), item("a2"));
        const destino = doc(item("d1", { refId: "r1" }));
        const plan = planificar({ tipo: "fusionar", origen: ana, destino: luis }, snap(origen, destino), todo);
        expect(plan.vistaPrevia.crea).toEqual(["a2"]);
        expect(plan.vistaPrevia.omite.map((o) => o.id)).toEqual(["a1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer.every((p) => p.op === "quitar")).toBe(true);
        expect(origen.items).toHaveLength(2);
        expect(destino.items).toHaveLength(1);
        expect(plan.validacion.avisos.join(" ")).toContain("fusionar nunca borra");
    });
});

describe("planificar · quitar", () => {
    it("usa lápida reversible y marca solo la última copia real", () => {
        const origen = doc(item("a1", { refId: "r1" }), item("a2"));
        const otro = doc(item("d1", { refId: "r1" }));
        const plan = planificar({ tipo: "quitar", origen: ana }, snap(origen, otro), todo);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["a1", "a2"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["a2"]);
        expect(plan.deshacer.every((p) => p.op === "restaurar" && p.ref.id === "ana")).toBe(true);
        expect(plan.validacion.avisos.join(" ")).toContain("es la última copia");
        expect(resumenPlan(plan)).toContain("Quitarías 2");
    });
});

describe("planificar · deduplicar", () => {
    it("solo propone sobrantes por refId, url o título+tipo y no toca las copias únicas", () => {
        const origen = doc(
            item("a1", { refId: "r1" }), item("a2", { refId: "r1" }), item("a3", { refId: "r2" }),
            item("a4", { title: "Misma" }), item("a5", { title: "Misma" }),
        );
        const plan = planificar({ tipo: "deduplicar", origen: ana }, snap(origen), todo);
        expect(plan.vistaPrevia.modifica).toEqual(["a2", "a5"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([]);
        expect(plan.vistaPrevia.modifica).not.toContain("a3");
        expect(plan.validacion.avisos.join(" ")).toContain("sin confirmación");
    });
});

describe("planificar · permisos y errores", () => {
    it("sin permiso de lectura no hay silencio: error en español", () => {
        const plan = planificar({ tipo: "copiar", origen: ana, destino: luis }, snap(doc(item("a1"))), {
            puedeVer: () => false, puedeEditar: () => true,
        });
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.join(" ")).toContain("No tienes permiso para ver");
        expect(plan.vistaPrevia.crea).toEqual([]);
    });

    it("un ítem con ACL restrictiva se omite con motivo, no rompe el plan", () => {
        const permisos: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: (_r, it) => !it || it.id !== "a1" };
        const plan = planificar({ tipo: "copiar", origen: ana, destino: luis }, snap(doc(item("a1"), item("a2"))), permisos);
        expect(plan.vistaPrevia.crea).toEqual(["a2"]);
        expect(plan.vistaPrevia.omite).toEqual([{ id: "a1", motivo: "la ACL del destino no te permite editar este ítem" }]);
    });

    it("destino igual a origen es error, y un ítem pedido que no existe también", () => {
        const mismo = planificar({ tipo: "copiar", origen: ana, destino: ana }, snap(doc(item("a1"))), todo);
        expect(mismo.validacion.ok).toBe(false);
        expect(mismo.validacion.errores.join(" ")).toContain("misma biblioteca");
        const falta = planificar({ tipo: "quitar", origen: ana, itemIds: ["nope"] }, snap(doc(item("a1"))), todo);
        expect(falta.validacion.errores.join(" ")).toContain("No encuentro el ítem");
    });
});

describe("planificar · determinismo y resumen", () => {
    it("dos planificaciones iguales dan exactamente el mismo plan, con ids ordenados", () => {
        const origen = doc(item("z9"), item("b2", { refId: "r1" }));
        const destino = doc(item("d1", { refId: "r1" }));
        const uno = planificar({ tipo: "copiar", origen: ana, destino: luis }, snap(origen, destino), todo);
        const dos = planificar({ tipo: "copiar", origen: ana, destino: luis }, snap(origen, destino), todo);
        expect(JSON.stringify(uno)).toBe(JSON.stringify(dos));
        expect(uno.vistaPrevia.crea).toEqual(["z9"]);
        expect(uno.vistaPrevia.omite.map((o) => o.id)).toEqual(["b2"]);
        expect(resumenPlan(uno)).toContain("Copiarías 1, omitiría 1");
    });
});
