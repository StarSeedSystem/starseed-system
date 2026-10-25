import { describe, it, expect } from "vitest";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "../entity-library";
import { planificar, resumenPlan, type PermisosBiblioteca } from "../biblioteca-plan";

function item(id: string, extra: Partial<SavedItem> = {}): SavedItem {
    return {
        id,
        type: "page",
        title: `Página ${id}`,
        tags: [],
        addedAt: "2026-01-01T00:00:00.000Z",
        addedBy: "ana",
        ...extra,
    };
}

function doc(items: SavedItem[]): EntityLibraryDoc {
    return { items, folders: [], rev: 0, updatedAt: "" };
}

const perfil: EntityRef = { kind: "profile", id: "ana" };
const grupo: EntityRef = { kind: "group", id: "club" };
const permisos: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: () => true };
const snapshot = (a: EntityLibraryDoc, b: EntityLibraryDoc = doc([])): Record<string, EntityLibraryDoc> => ({
    "profile:ana": a,
    "group:club": b,
});

describe("planificar · copiar", () => {
    it("crea la referencia en el destino y deja diario para deshacerla", () => {
        const plan = planificar(
            { tipo: "copiar", origen: perfil, destino: grupo, itemIds: ["i1"] },
            snapshot(doc([item("i1", { refId: "post:1" })])),
            permisos,
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: grupo, itemId: "i1" }]);
    });

    it("omite si el destino ya tiene el mismo id o la misma referencia", () => {
        const plan = planificar(
            { tipo: "copiar", origen: perfil, destino: grupo, itemIds: ["i1", "i2"] },
            snapshot(doc([item("i1", { refId: "post:1" }), item("i2", { refId: "post:2" })]), doc([
                item("i1"),
                item("otro", { refId: "post:2" }),
            ])),
            permisos,
        );
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.vistaPrevia.omite.map((o) => o.id)).toEqual(["i1", "i2"]);
        expect(plan.vistaPrevia.omite[0].motivo).toContain("mismo id");
        expect(plan.vistaPrevia.omite[1].motivo).toContain("referencia");
    });

    it("no copia con destino igual al origen", () => {
        const plan = planificar(
            { tipo: "copiar", origen: perfil, destino: { ...perfil } },
            snapshot(doc([item("i1")])),
            permisos,
        );
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.join(" ")).toContain("misma biblioteca");
    });
});

describe("planificar · mover y quitar (reversibles)", () => {
    it("mueve con lápida y recuerda la carpeta para volver", () => {
        const plan = planificar(
            { tipo: "mover", origen: perfil, destino: grupo, itemIds: ["i1"] },
            snapshot(doc([item("i1", { folderId: "f1" })])),
            permisos,
        );
        expect(plan.vistaPrevia.quitaReversible).toEqual(["i1"]);
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.deshacer).toEqual([{ op: "mover", ref: perfil, itemId: "i1", haciaCarpeta: "f1" }]);
    });

    it("avisa y marca la última copia al quitar", () => {
        const plan = planificar(
            { tipo: "quitar", origen: perfil, itemIds: ["i1"] },
            snapshot(doc([item("i1", { refId: "post:1" })])),
            permisos,
        );
        expect(plan.vistaPrevia.quitaReversible).toEqual(["i1"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["i1"]);
        expect(plan.validacion.avisos.join(" ")).toContain("es la última copia: haz una antes de quitarla");
        expect(plan.deshacer).toEqual([{ op: "restaurar", ref: perfil, itemId: "i1" }]);
    });

    it("no es última copia si otro documento conserva el refId", () => {
        const plan = planificar(
            { tipo: "quitar", origen: perfil, itemIds: ["i1"] },
            snapshot(doc([item("i1", { refId: "post:1" })]), doc([item("g1", { refId: "post:1" })])),
            permisos,
        );
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos).toEqual([]);
    });

    it("si se quitan a la vez todas las copias, todas son última copia", () => {
        const plan = planificar(
            { tipo: "quitar", origen: perfil, itemIds: ["i1", "i2"] },
            snapshot(doc([item("i1", { refId: "post:1" }), item("i2", { refId: "post:1" })])),
            permisos,
        );
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["i1", "i2"]);
    });

    it("un ítem sin refId ni url también es su única copia", () => {
        const plan = planificar(
            { tipo: "quitar", origen: perfil, itemIds: ["i1"] },
            snapshot(doc([item("i1")])),
            permisos,
        );
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["i1"]);
    });
});

describe("planificar · fusionar", () => {
    it("rellena lo que falta al destino y nunca borra", () => {
        const origen = doc([item("i1", { refId: "post:1", note: "nota nueva" })]);
        const destinoDoc = doc([item("d1", { refId: "post:1", title: "Título que manda" })]);
        const instantaneas = snapshot(origen, destinoDoc);
        const antes = JSON.stringify(instantaneas);
        const plan = planificar({ tipo: "fusionar", origen: perfil, destino: grupo }, instantaneas, permisos);
        expect(plan.vistaPrevia.modifica).toEqual(["d1"]);
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([]);
        expect(plan.validacion.avisos.join(" ")).toContain("nunca borra");
        expect(JSON.stringify(instantaneas)).toBe(antes);
    });

    it("crea en el destino lo que no existe allí", () => {
        const plan = planificar(
            { tipo: "fusionar", origen: perfil, destino: grupo, itemIds: ["i1"] },
            snapshot(doc([item("i1", { refId: "post:1" })])),
            permisos,
        );
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.deshacer).toEqual([]);
    });
});

describe("planificar · deduplicar", () => {
    it("solo propone y deja fuera la última copia de un refId único", () => {
        const plan = planificar(
            { tipo: "deduplicar", origen: perfil },
            snapshot(doc([
                item("i1", { refId: "post:1", addedAt: "2026-01-02T00:00:00.000Z" }),
                item("i2", { refId: "post:1", addedAt: "2026-01-01T00:00:00.000Z" }),
                item("i3", { refId: "post:9" }),
            ])),
            permisos,
        );
        expect(plan.vistaPrevia.modifica).toEqual(["i1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([]);
        expect(plan.validacion.avisos.join(" ")).toContain("sin confirmación humana");
    });

    it("agrupa por título y tipo cuando no hay refId ni url", () => {
        const plan = planificar(
            { tipo: "deduplicar", origen: perfil },
            snapshot(doc([
                item("a", { title: "Notas", addedAt: "2026-01-01T00:00:00.000Z" }),
                item("b", { title: "Notas", addedAt: "2026-01-02T00:00:00.000Z" }),
            ])),
            permisos,
        );
        expect(plan.vistaPrevia.modifica).toEqual(["b"]);
    });

    it("nunca propone quitar una referencia que solo existe en ese ítem", () => {
        const plan = planificar(
            { tipo: "deduplicar", origen: perfil },
            snapshot(doc([
                item("a", { title: "Compartido", refId: "r1", addedAt: "2026-01-02T00:00:00.000Z" }),
                item("b", { title: "Compartido", refId: "r2", addedAt: "2026-01-01T00:00:00.000Z" }),
            ])),
            permisos,
        );
        expect(plan.vistaPrevia.modifica).toEqual([]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["a"]);
    });
});

describe("permisos", () => {
    it("sin permiso de edición falla en español, nunca en silencio", () => {
        const sinEditar: PermisosBiblioteca = { puedeVer: () => true, puedeEditar: () => false };
        const plan = planificar(
            { tipo: "quitar", origen: perfil, itemIds: ["i1"] },
            snapshot(doc([item("i1")])),
            sinEditar,
        );
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.length).toBeGreaterThan(0);
        expect(plan.validacion.errores.join(" ")).toContain("No tienes permiso");
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
    });

    it("omite el ítem concreto que no se puede ver", () => {
        const soloI2: PermisosBiblioteca = { puedeVer: (_ref, id) => id === "i2", puedeEditar: () => true };
        const plan = planificar(
            { tipo: "copiar", origen: perfil, destino: grupo, itemIds: ["i1", "i2"] },
            snapshot(doc([item("i1", { refId: "post:1" }), item("i2", { refId: "post:2" })])),
            soloI2,
        );
        expect(plan.vistaPrevia.crea).toEqual(["i2"]);
        expect(plan.vistaPrevia.omite).toEqual([{ id: "i1", motivo: "sin permiso para ver el ítem" }]);
    });
});

describe("determinismo y resumen", () => {
    it("planificar dos veces da exactamente el mismo plan", () => {
        const instantaneas = snapshot(
            doc([item("b", { refId: "post:2" }), item("a", { refId: "post:1" })]),
            doc([item("z", { refId: "post:3" })]),
        );
        const op = { tipo: "copiar" as const, origen: perfil, destino: grupo };
        expect(planificar(op, instantaneas, permisos)).toEqual(planificar(op, instantaneas, permisos));
    });

    it("resume en español con los pasos del plan", () => {
        const plan = planificar(
            { tipo: "copiar", origen: perfil, destino: grupo },
            snapshot(doc([item("i1", { refId: "post:1" }), item("i2", { refId: "post:2" })])),
            permisos,
        );
        expect(resumenPlan(plan)).toContain("Copiarías 2");
        expect(plan.vistaPrevia.crea).toEqual(["i1", "i2"]);
    });
});
