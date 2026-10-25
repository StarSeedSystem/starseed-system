import { describe, it, expect } from "vitest";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "@/lib/library/entity-library";
import { planificar, resumenPlan, type OperacionBiblioteca, type PermisosBiblioteca } from "@/lib/library/biblioteca-plan";

function makeRef(kind: EntityRef["kind"], id: string): EntityRef {
    return { kind, id };
}

function makeItem(id: string, overrides: Partial<SavedItem> = {}): SavedItem {
    return {
        id,
        type: "page",
        title: `Item ${id}`,
        tags: [],
        addedAt: new Date().toISOString(),
        addedBy: "user1",
        ...overrides,
    };
}

function makeDoc(items: SavedItem[] = []): EntityLibraryDoc {
    return {
        items,
        folders: [],
        rev: 1,
        updatedAt: new Date().toISOString(),
        version: 3,
        deletedItems: {},
        deletedFolders: {},
    };
}

function permisosPermisivos(): PermisosBiblioteca {
    return {
        puedeVer: () => true,
        puedeEditar: () => true,
    };
}

function permisosSinVer(): PermisosBiblioteca {
    return {
        puedeVer: () => false,
        puedeEditar: () => true,
    };
}

describe("biblioteca-plan", () => {
    it("copiar crea elementos en destino, quita duplicados por id o refId", () => {
        const origenRef = makeRef("user", "u1");
        const destinoRef = makeRef("user", "u2");
        const item1 = makeItem("i1", { refId: "r1" });
        const item2 = makeItem("i2");
        const destinoExistente = makeItem("i1");
        const instantaneas = {
            "user:u1": makeDoc([item1, item2]),
            "user:u2": makeDoc([destinoExistente]),
        };
        const op: OperacionBiblioteca = { tipo: "copiar", origen: origenRef, destino: destinoRef };
        const plan = planificar(op, instantaneas, permisosPermisivos());
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toContain("i2");
        expect(plan.vistaPrevia.omite.some((o) => o.id === "i1")).toBe(true);
        expect(plan.deshacer.some((d) => d.op === "quitar" && d.itemId === "i2")).toBe(true);
    });

    it("mover usa lápida reversible y marca última copia con aviso", () => {
        const origenRef = makeRef("user", "u1");
        const destinoRef = makeRef("user", "u2");
        const item1 = makeItem("i1", { refId: "r1", folderId: "f1" });
        const instantaneas = {
            "user:u1": makeDoc([item1]),
            "user:u2": makeDoc([]),
        };
        const op: OperacionBiblioteca = { tipo: "mover", origen: origenRef, destino: destinoRef };
        const plan = planificar(op, instantaneas, permisosPermisivos());
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.quitaReversible).toContain("i1");
        expect(plan.vistaPrevia.ultimaCopia).toContain("i1");
        expect(plan.validacion.avisos.some((a) => a.includes("última copia"))).toBe(true);
        expect(plan.deshacer.some((d) => d.op === "restaurar" && d.itemId === "i1")).toBe(true);
    });

    it("sin permisos da error en español", () => {
        const origenRef = makeRef("user", "u1");
        const destinoRef = makeRef("user", "u2");
        const item1 = makeItem("i1");
        const instantaneas = {
            "user:u1": makeDoc([item1]),
            "user:u2": makeDoc([]),
        };
        const op: OperacionBiblioteca = { tipo: "copiar", origen: origenRef, destino: destinoRef };
        const plan = planificar(op, instantaneas, permisosSinVer());
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.length).toBeGreaterThan(0);
    });

    it("destino igual al origen da error", () => {
        const ref = makeRef("user", "u1");
        const item1 = makeItem("i1");
        const instantaneas = { "user:u1": makeDoc([item1]) };
        const op: OperacionBiblioteca = { tipo: "copiar", origen: ref, destino: ref };
        const plan = planificar(op, instantaneas, permisosPermisivos());
        expect(plan.validacion.ok).toBe(false);
    });

    it("fusionar nunca borra y solo trae lo que falta", () => {
        const origenRef = makeRef("user", "u1");
        const destinoRef = makeRef("user", "u2");
        const item1 = makeItem("i1", { refId: "r1" });
        const item2 = makeItem("i2", { refId: "r2" });
        const item3 = makeItem("i3", { refId: "r1" });
        const instantaneas = {
            "user:u1": makeDoc([item1, item2]),
            "user:u2": makeDoc([item3]),
        };
        const op: OperacionBiblioteca = { tipo: "fusionar", origen: origenRef, destino: destinoRef };
        const plan = planificar(op, instantaneas, permisosPermisivos());
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toContain("i2");
        expect(plan.vistaPrevia.omite.some((o) => o.id === "i1")).toBe(true);
        expect(plan.deshacer.every((d) => d.op !== "restaurar")).toBe(true);
    });

    it("deduplicar solo propone, no quita, avisa y respeta última copia", () => {
        const origenRef = makeRef("user", "u1");
        const item1 = makeItem("i1", { refId: "r1" });
        const item2 = makeItem("i2", { refId: "r1" });
        const item3 = makeItem("i3", { refId: "r2" });
        const instantaneas = {
            "user:u1": makeDoc([item1, item2, item3]),
        };
        const op: OperacionBiblioteca = { tipo: "deduplicar", origen: origenRef };
        const plan = planificar(op, instantaneas, permisosPermisivos());
        expect(plan.validacion.ok).toBe(true);
        expect(plan.validacion.avisos.some((a) => a.includes("confirmación humana"))).toBe(true);
        expect(plan.deshacer.length).toBe(0);
        expect(plan.vistaPrevia.modifica.length).toBeGreaterThanOrEqual(0);
    });

    it("planificar dos veces da lo mismo", () => {
        const origenRef = makeRef("user", "u1");
        const destinoRef = makeRef("user", "u2");
        const item1 = makeItem("i1");
        const instantaneas = {
            "user:u1": makeDoc([item1]),
            "user:u2": makeDoc([]),
        };
        const op: OperacionBiblioteca = { tipo: "copiar", origen: origenRef, destino: destinoRef };
        const plan1 = planificar(op, instantaneas, permisosPermisivos());
        const plan2 = planificar(op, instantaneas, permisosPermisivos());
        expect(plan1.vistaPrevia.crea).toEqual(plan2.vistaPrevia.crea);
        expect(plan1.vistaPrevia.omite).toEqual(plan2.vistaPrevia.omite);
    });

    it("el diario deshace copiar (quitar lo creado) y quitar (restaurar)", () => {
        const origenRef = makeRef("user", "u1");
        const destinoRef = makeRef("user", "u2");
        const item1 = makeItem("i1", { folderId: "f1" });
        const instantaneas1 = { "user:u1": makeDoc([item1]), "user:u2": makeDoc([]) };
        const planCopiar = planificar({ tipo: "copiar", origen: origenRef, destino: destinoRef }, instantaneas1, permisosPermisivos());
        expect(planCopiar.deshacer.some((d) => d.op === "quitar" && d.ref.kind === "user" && d.ref.id === "u2")).toBe(true);

        const instantaneas2 = { "user:u1": makeDoc([item1]) };
        const planQuitar = planificar({ tipo: "quitar", origen: origenRef }, instantaneas2, permisosPermisivos());
        expect(planQuitar.deshacer.some((d) => d.op === "restaurar" && d.haciaCarpeta === "f1")).toBe(true);
    });

    it("resumenPlan produce texto en español", () => {
        const plan: any = {
            operacion: { tipo: "copiar", origen: makeRef("user", "u1") },
            validacion: { ok: true, errores: [], avisos: [] },
            vistaPrevia: { crea: ["1", "2", "3"], modifica: [], omite: [{ id: "x", motivo: "y" }], quitaReversible: [], ultimaCopia: [] },
            deshacer: [],
        };
        const resumen = resumenPlan(plan);
        expect(resumen).toMatch(/Copiarías/);
        expect(resumen).toMatch(/omitiría/);
    });
});
