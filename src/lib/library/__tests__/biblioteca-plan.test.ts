import { describe, it, expect } from "vitest";
import { planificar, resumenPlan } from "../biblioteca-plan";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "../entity-library";
import type { PermisosBiblioteca } from "../biblioteca-plan";

const docA: EntityRef = { kind: "user", id: "a" };
const docB: EntityRef = { kind: "user", id: "b" };

const permisosTotales: PermisosBiblioteca = {
    puedeVer: () => true,
    puedeEditar: () => true,
};

function item(id: string, extra: Partial<SavedItem> = {}): SavedItem {
    return {
        id,
        type: "post",
        title: `Elemento ${id}`,
        tags: [],
        addedAt: "2026-10-01T00:00:00.000Z",
        addedBy: "a",
        ...extra,
    };
}

function documento(items: SavedItem[]): EntityLibraryDoc {
    return {
        items,
        folders: [],
        rev: 1,
        updatedAt: "2026-10-01T00:00:00.000Z",
        version: 3,
        deletedItems: {},
        deletedFolders: {},
    };
}

function instantaneasBase(): Record<string, EntityLibraryDoc> {
    return {
        "user:a": documento([
            item("i1", { refId: "ref1", url: "https://ejemplo.test/1" }),
            item("i2", { refId: "ref2", url: "https://ejemplo.test/2" }),
        ]),
        "user:b": documento([
            item("i3", { refId: "ref3", url: "https://ejemplo.test/3" }),
        ]),
    };
}

describe("planificar · copiar", () => {
    it("crea el elemento y deja un paso para deshacerlo", () => {
        const plan = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] },
            instantaneasBase(),
            permisosTotales
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.omite).toEqual([]);
        expect(plan.deshacer).toEqual([
            { op: "quitar", ref: docB, itemId: "i1", haciaCarpeta: null },
        ]);
        expect(resumenPlan(plan)).toContain("Copiarías 1");
    });

    it("omite por mismo id o misma referencia en el destino", () => {
        const snap = instantaneasBase();
        snap["user:b"] = documento([
            item("i1", { refId: "otra" }),
            item("i99", { refId: "ref2" }),
        ]);
        const plan = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1", "i2"] },
            snap,
            permisosTotales
        );
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.vistaPrevia.omite).toHaveLength(2);
        expect(plan.vistaPrevia.omite.map((o) => o.id)).toEqual(["i1", "i2"]);
    });

    it("exige destino y que no sea la misma entidad", () => {
        const sinDestino = planificar(
            { tipo: "copiar", origen: docA, itemIds: ["i1"] },
            instantaneasBase(),
            permisosTotales
        );
        expect(sinDestino.validacion.ok).toBe(false);
        expect(sinDestino.validacion.errores.length).toBeGreaterThan(0);

        const mismoDestino = planificar(
            { tipo: "copiar", origen: docA, destino: docA, itemIds: ["i1"] },
            instantaneasBase(),
            permisosTotales
        );
        expect(mismoDestino.validacion.ok).toBe(false);
        expect(mismoDestino.validacion.errores.some((e) => e.includes("igual al origen"))).toBe(true);
    });
});

describe("planificar · permisos", () => {
    it("sin permiso de ver devuelve error en español", () => {
        const plan = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1"] },
            instantaneasBase(),
            { puedeVer: () => false, puedeEditar: () => false }
        );
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores[0]).toContain("Sin permiso");
    });

    it("un ítem con ACL que deniega la acción se omite con motivo", () => {
        const snap = instantaneasBase();
        snap["user:a"] = documento([
            item("i1", { acl: { read: [{ kind: "user", id: "otro" }], write: [] } }),
            item("i2"),
        ]);
        const permisos: PermisosBiblioteca = {
            puedeVer: (_ref, id) => id !== "i1",
            puedeEditar: () => true,
        };
        const plan = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1", "i2"] },
            snap,
            permisos
        );
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "i1", motivo: "el ACL del elemento no permite ver" },
        ]);
        expect(plan.vistaPrevia.crea).toEqual(["i2"]);
    });
});

describe("planificar · mover y quitar", () => {
    it("mover avisa de última copia y es reversible", () => {
        const plan = planificar(
            { tipo: "mover", origen: docA, destino: docB, itemIds: ["i2"] },
            instantaneasBase(),
            permisosTotales
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["i2"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["i2"]);
        expect(plan.validacion.avisos).toContain("es la última copia: haz una antes de quitarla");
        expect(plan.deshacer[0]).toEqual({
            op: "mover",
            ref: docA,
            itemId: "i2",
            haciaCarpeta: null,
        });
    });

    it("mover no marca última copia si otro documento conserva la referencia", () => {
        const snap = instantaneasBase();
        snap["user:b"] = documento([item("i3", { refId: "ref2" })]);
        const plan = planificar(
            { tipo: "mover", origen: docA, destino: docB, itemIds: ["i2"] },
            snap,
            permisosTotales
        );
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos).not.toContain("es la última copia: haz una antes de quitarla");
    });

    it("quitar usa lápida y el diario restaura con su carpeta", () => {
        const snap = instantaneasBase();
        snap["user:a"] = documento([
            item("q1", { refId: "unica", folderId: "carpeta-7" }),
        ]);
        const plan = planificar(
            { tipo: "quitar", origen: docA, itemIds: ["q1"] },
            snap,
            permisosTotales
        );
        expect(plan.vistaPrevia.quitaReversible).toEqual(["q1"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["q1"]);
        expect(plan.deshacer).toEqual([
            { op: "restaurar", ref: docA, itemId: "q1", haciaCarpeta: "carpeta-7" },
        ]);
    });
});

describe("planificar · fusionar", () => {
    it("crea lo que falta y modifica lo existente, nunca borra", () => {
        const snap = instantaneasBase();
        snap["user:b"] = documento([item("i1", { refId: "ref1", note: "ya estaba" })]);
        const plan = planificar(
            { tipo: "fusionar", origen: docA, destino: docB, itemIds: ["i1", "i2"] },
            snap,
            permisosTotales
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.modifica).toEqual(["i1"]);
        expect(plan.vistaPrevia.crea).toEqual(["i2"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos.some((a) => a.includes("última copia"))).toBe(false);
    });
});

describe("planificar · deduplicar", () => {
    it("solo propone sobrantes y pide confirmación humana", () => {
        const dup = documento([
            item("d1", { type: "post", title: "Mismo título", refId: "r1" }),
            item("d2", { type: "post", title: "Mismo título", refId: "r1" }),
            item("d3", { type: "post", title: "Otro", refId: "r2" }),
        ]);
        const plan = planificar(
            { tipo: "deduplicar", origen: docA },
            { "user:a": dup },
            permisosTotales
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.modifica).toEqual(["d2"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.deshacer).toEqual([]);
        expect(plan.validacion.avisos).toContain(
            "Solo es una propuesta: no se quita nada sin confirmación humana."
        );
        expect(resumenPlan(plan)).toContain("Propondrías quitar 1 duplicado");
    });

    it("no propone quitar el único elemento de un recurso", () => {
        const doc = documento([
            item("u1", { refId: "unico", url: "https://unico.test" }),
            item("u2", { refId: "otro", url: "https://otro.test" }),
        ]);
        const plan = planificar(
            { tipo: "deduplicar", origen: docA },
            { "user:a": doc },
            permisosTotales
        );
        expect(plan.vistaPrevia.modifica).toEqual([]);
        expect(plan.validacion.avisos.some((a) => a.includes("confirmación humana"))).toBe(false);
    });
});

describe("planificar · invariantes", () => {
    it("es determinista aunque los ids entren desordenados", () => {
        const snap = instantaneasBase();
        const uno = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i2", "i1"] },
            snap,
            permisosTotales
        );
        const otro = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: ["i1", "i2", "i1"] },
            snap,
            permisosTotales
        );
        expect(uno.vistaPrevia.crea).toEqual(otro.vistaPrevia.crea);
        expect(uno.deshacer).toEqual(otro.deshacer);
        expect(resumenPlan(uno)).toBe(resumenPlan(otro));
    });

    it("un ítem inexistente es un error, no silencio", () => {
        const plan = planificar(
            { tipo: "quitar", origen: docA, itemIds: ["fantasma"] },
            instantaneasBase(),
            permisosTotales
        );
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.some((e) => e.includes("fantasma"))).toBe(true);
    });

    it("resume un plan vacío sin romper", () => {
        const plan = planificar(
            { tipo: "copiar", origen: docA, destino: docB, itemIds: [] },
            instantaneasBase(),
            permisosTotales
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.validacion.avisos).toContain("No hay elementos que planificar.");
        expect(resumenPlan(plan)).toBe("No hay cambios que planificar.");
    });
});

describe("planificar · deduplicar por url y por título", () => {
    it("agrupa por url aunque cambie la referencia", () => {
        const doc = documento([
            item("u1", { refId: "r1", url: "https://misma.test/x" }),
            item("u2", { refId: "r2", url: "https://misma.test/x" }),
        ]);
        const plan = planificar(
            { tipo: "deduplicar", origen: docA },
            { "user:a": doc },
            permisosTotales
        );
        expect(plan.vistaPrevia.modifica).toEqual(["u2"]);
    });

    it("agrupa por título y tipo cuando no hay referencia ni url", () => {
        const doc = documento([
            item("t1", { type: "post", title: "Nota repetida" }),
            item("t2", { type: "post", title: "Nota repetida" }),
        ]);
        const plan = planificar(
            { tipo: "deduplicar", origen: docA },
            { "user:a": doc },
            permisosTotales
        );
        expect(plan.vistaPrevia.modifica).toEqual(["t2"]);
    });
});

describe("planificar · quitar con otra copia", () => {
    it("no avisa de última copia si otro documento conserva la referencia", () => {
        const snap: Record<string, EntityLibraryDoc> = {
            "user:a": documento([item("q1", { refId: "compartida" })]),
            "user:b": documento([item("q2", { refId: "compartida" })]),
        };
        const plan = planificar(
            { tipo: "quitar", origen: docA, itemIds: ["q1"] },
            snap,
            permisosTotales
        );
        expect(plan.vistaPrevia.quitaReversible).toEqual(["q1"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos.some((a) => a.includes("última copia"))).toBe(false);
    });
});
