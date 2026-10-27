import { describe, expect, it } from "vitest";

import { planificar, resumenPlan, type PermisosBiblioteca } from "../biblioteca-plan";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "../entity-library";

const ref = (id: string): EntityRef => ({ kind: "user", id });
const item = (id: string, extra: Partial<SavedItem> = {}): SavedItem => ({
    id,
    type: "package",
    refId: id,
    title: id,
    tags: [],
    addedAt: "2026-01-01T00:00:00.000Z",
    addedBy: "u",
    ...extra,
});
const doc = (items: SavedItem[]): EntityLibraryDoc => ({
    items,
    folders: [],
    rev: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
});
const todo: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: () => true };

describe("planificar · copiar, mover y fusionar", () => {
    it("copiar deja el diario para quitar lo creado y no pisa el mismo refId", () => {
        const a = ref("a");
        const b = ref("b");
        const plan = planificar(
            { tipo: "copiar", origen: a, destino: b },
            { "user:a": doc([item("x")]), "user:b": doc([item("y", { refId: "x" })]) },
            todo,
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.vistaPrevia.omite.map((o) => o.id)).toEqual(["x"]);
        expect(plan.deshacer).toEqual([]);
    });

    it("copiar un ítem nuevo crea y su deshacer lo quita del destino", () => {
        const a = ref("a");
        const b = ref("b");
        const plan = planificar({ tipo: "copiar", origen: a, destino: b }, { "user:a": doc([item("x")]), "user:b": doc([]) }, todo);
        expect(plan.vistaPrevia.crea).toEqual(["x"]);
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: b, itemId: "x" }]);
        expect(resumenPlan(plan)).toContain("Copiarías 1 ítem");
    });

    it("mover usa lápida, avisa de la última copia y reordena el destino", () => {
        const a = ref("a");
        const b = ref("b");
        const plan = planificar(
            { tipo: "mover", origen: a, destino: b },
            { "user:a": doc([item("x", { folderId: "f1" })]), "user:b": doc([]) },
            todo,
        );
        expect(plan.vistaPrevia.crea).toEqual(["x"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["x"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["x"]);
        expect(plan.validacion.avisos).toContain("es la última copia: haz una antes de quitarla");
        expect(plan.deshacer).toEqual([
            { op: "quitar", ref: b, itemId: "x" },
            { op: "mover", ref: a, itemId: "x", haciaCarpeta: "f1" },
        ]);
    });

    it("fusionar trae lo que falta y nunca borra en el destino", () => {
        const a = ref("a");
        const b = ref("b");
        const plan = planificar(
            { tipo: "fusionar", origen: a, destino: b },
            { "user:a": doc([item("x"), item("y")]), "user:b": doc([item("x")]) },
            todo,
        );
        expect(plan.vistaPrevia.crea).toEqual(["y"]);
        expect(plan.vistaPrevia.omite.map((o) => o.id)).toEqual(["x"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: b, itemId: "y" }]);
    });
});

describe("planificar · quitar y deduplicar", () => {
    it("quitar conserva el diario para restaurar", () => {
        const a = ref("a");
        const plan = planificar({ tipo: "quitar", origen: a }, { "user:a": doc([item("x", { folderId: "f1" })]) }, todo);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["x"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["x"]);
        expect(plan.deshacer).toEqual([{ op: "restaurar", ref: a, itemId: "x", haciaCarpeta: "f1" }]);
    });

    it("quitar no marca última copia si otra biblioteca conserva el mismo refId", () => {
        const a = ref("a");
        const plan = planificar(
            { tipo: "quitar", origen: a },
            { "user:a": doc([item("x")]), "user:otra": doc([item("copia", { refId: "x" })]) },
            todo,
        );
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos).toEqual([]);
    });

    it("deduplicar solo propone y no quita nada", () => {
        const a = ref("a");
        const plan = planificar(
            { tipo: "deduplicar", origen: a },
            {
                "user:a": doc([
                    item("d1", { refId: "comun" }),
                    item("d2", { refId: "comun" }),
                    item("d3", { refId: "comun" }),
                    item("unico", { refId: "otro" }),
                ]),
            },
            todo,
        );
        expect(plan.vistaPrevia.modifica).toEqual(["d2", "d3"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([]);
        expect(plan.validacion.avisos.some((a) => a.includes("no se quita nada sin confirmación humana"))).toBe(true);
    });

    it("agrupa también por url y por title+type, sin confundir únicos", () => {
        const a = ref("a");
        const plan = planificar(
            { tipo: "deduplicar", origen: a },
            {
                "user:a": doc([
                    item("u1", { refId: undefined, url: "https://ejemplo.org/x" }),
                    item("u2", { refId: undefined, url: "https://ejemplo.org/x" }),
                    item("t1", { refId: undefined, title: "Mismo título", type: "post" }),
                    item("t2", { refId: undefined, title: "Mismo título", type: "post" }),
                ]),
            },
            todo,
        );
        expect(plan.vistaPrevia.modifica).toEqual(["t2", "u2"]);
    });
});

describe("planificar · permisos, errores y determinismo", () => {
    it("sin permiso de edición omite el ítem con motivo, nunca en silencio", () => {
        const a = ref("a");
        const plan = planificar(
            { tipo: "quitar", origen: a },
            { "user:a": doc([item("x")]) },
            { puedeVer: () => true, puedeEditar: () => false },
        );
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.vistaPrevia.omite[0]?.motivo).toContain("No tienes permiso");
    });

    it("sin permiso en el destino es error y destino igual al origen también", () => {
        const a = ref("a");
        const sinDestino = planificar(
            { tipo: "copiar", origen: a, destino: ref("b") },
            { "user:a": doc([item("x")]), "user:b": doc([]) },
            { puedeVer: () => true, puedeEditar: (r) => r.id === "a" },
        );
        expect(sinDestino.validacion.ok).toBe(false);
        expect(sinDestino.validacion.errores.length).toBeGreaterThan(0);
        const mismo = planificar({ tipo: "copiar", origen: a, destino: a }, { "user:a": doc([item("x")]) }, todo);
        expect(mismo.validacion.errores).toContain("El destino no puede ser el mismo que el origen.");
    });

    it("planificar dos veces da exactamente lo mismo", () => {
        const a = ref("a");
        const b = ref("b");
        const docs = { "user:a": doc([item("x"), item("y")]), "user:b": doc([]) };
        const uno = planificar({ tipo: "copiar", origen: a, destino: b, itemIds: ["y", "x"] }, docs, todo);
        const dos = planificar({ tipo: "copiar", origen: a, destino: b, itemIds: ["x", "y"] }, docs, todo);
        expect(JSON.stringify(uno)).toBe(JSON.stringify(dos));
        expect(uno.vistaPrevia.crea).toEqual(["x", "y"]);
    });

    it("un id pedido que no existe se omite con motivo", () => {
        const a = ref("a");
        const plan = planificar(
            { tipo: "copiar", origen: a, destino: ref("b"), itemIds: ["fantasma"] },
            { "user:a": doc([item("x")]), "user:b": doc([]) },
            todo,
        );
        expect(plan.vistaPrevia.omite).toEqual([{ id: "fantasma", motivo: "No existe en la biblioteca de origen." }]);
    });
});
