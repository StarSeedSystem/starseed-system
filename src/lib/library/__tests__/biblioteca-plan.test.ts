import { describe, it, expect } from "vitest";
import { planificar, resumenPlan, type PermisosPlan } from "../biblioteca-plan";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "../entity-library";

const A: EntityRef = { kind: "user", id: "cuenta-a" };
const B: EntityRef = { kind: "group", id: "equipo" };

function item(id: string, sobre: Partial<SavedItem> = {}): SavedItem {
    const base: SavedItem = {
        id,
        type: "post",
        title: `Ítem ${id}`,
        tags: [],
        folderId: null,
        addedAt: "2026-10-25T10:00:00.000Z",
        addedBy: "alex",
    };
    return { ...base, ...sobre };
}

function doc(items: SavedItem[]): EntityLibraryDoc {
    return { items, folders: [], rev: 1, updatedAt: "2026-10-25T10:00:00.000Z" };
}

function instantaneas(a: EntityLibraryDoc, b: EntityLibraryDoc): Record<string, EntityLibraryDoc> {
    return { "user:cuenta-a": a, "group:equipo": b };
}

const TODO: PermisosPlan = { puedeVer: () => true, puedeEditar: () => true };

describe("biblioteca-plan", () => {
    it("planifica copiar y el diario deshace quitando lo creado", () => {
        const plan = planificar(
            { tipo: "copiar", origen: A, destino: B, itemIds: ["i1"] },
            instantaneas(doc([item("i1", { refId: "u9" })]), doc([item("z1")])),
            TODO,
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: B, itemId: "i1" }]);
    });

    it("copiar no pisa: mismo id o misma referencia van a omite con motivo", () => {
        const plan = planificar(
            { tipo: "copiar", origen: A, destino: B, itemIds: ["i1", "i2", "i3"] },
            instantaneas(
                doc([item("i1"), item("i2", { refId: "r7" }), item("i3", { refId: "r8" })]),
                doc([item("i1"), item("pepito", { refId: "r7" })]),
            ),
            TODO,
        );
        expect(plan.vistaPrevia.crea).toEqual(["i3"]);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "i1", motivo: "Ya existe un ítem con el mismo id en el destino." },
            { id: "i2", motivo: "La misma referencia ya está guardada en el destino." },
        ]);
    });

    it("mover crea en el destino, deja lápida reversible y el diario devuelve el ítem", () => {
        const plan = planificar(
            { tipo: "mover", origen: A, destino: B, itemIds: ["m1"] },
            instantaneas(doc([item("m1", { refId: "mm", folderId: "carpeta-3" })]), doc([])),
            TODO,
        );
        expect(plan.vistaPrevia.crea).toEqual(["m1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["m1"]);
        // El contrato incluye «mover» en la regla de última copia: la
        // instantánea B no conserva la referencia, así que se avisa.
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["m1"]);
        expect(plan.validacion.avisos.join(" ")).toContain("es la última copia");
        expect(plan.deshacer.length).toBe(2);
        expect(plan.deshacer[0]).toEqual({ op: "quitar", ref: B, itemId: "m1" });
        expect(plan.deshacer[1]).toEqual({ op: "restaurar", ref: A, itemId: "m1", haciaCarpeta: "carpeta-3" });
    });

    it("fusionar trae lo que falta al destino y NUNCA borra", () => {
        const plan = planificar(
            { tipo: "fusionar", origen: A, destino: B },
            instantaneas(
                doc([item("x1", { refId: "rx", url: "https://e/1" }), item("y1", { refId: "ry" })]),
                doc([item("zz", { refId: "rx" })]),
            ),
            TODO,
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["y1"]);
        expect(plan.vistaPrevia.omite).toEqual([{ id: "x1", motivo: "Ya está en el destino; fusionar nunca lo toca." }]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer.every((p) => p.op === "quitar" && p.ref.id === "equipo")).toBe(true);
    });

    it("quitar avisa la ÚLTIMA copia y no cuando otra entrada conserva el mismo refId o url", () => {
        const planUnica = planificar(
            { tipo: "quitar", origen: A, itemIds: ["u1"] },
            instantaneas(doc([item("u1", { refId: "solo" })]), doc([])),
            TODO,
        );
        expect(planUnica.vistaPrevia.quitaReversible).toEqual(["u1"]);
        expect(planUnica.vistaPrevia.ultimaCopia).toEqual(["u1"]);
        expect(planUnica.validacion.avisos.join(" ")).toContain("es la última copia: haz una antes de quitarla");
        expect(planUnica.deshacer).toEqual([
            { op: "restaurar", ref: A, itemId: "u1", haciaCarpeta: null },
        ]);

        const planConOtras = planificar(
            { tipo: "quitar", origen: A, itemIds: ["b1", "c1"] },
            instantaneas(
                doc([item("b1", { refId: "rb" }), item("c1", { url: "https://c/1" })]),
                doc([item("otro-b", { refId: "rb" }), item("otro-c", { url: "https://c/1" })]),
            ),
            TODO,
        );
        expect(planConOtras.vistaPrevia.ultimaCopia).toEqual([]);
        expect(planConOtras.validacion.avisos).toEqual([]);

        const planHermana = planificar(
            { tipo: "quitar", origen: A, itemIds: ["g1"] },
            instantaneas(doc([item("g1", { refId: "gg" }), item("g2", { refId: "gg" })]), doc([])),
            TODO,
        );
        expect(planHermana.vistaPrevia.ultimaCopia).toEqual([]);
    });

    it("sin permiso no hay silencio: sin instantánea o sin destino, error en español", () => {
        const sinOrigen = planificar({ tipo: "quitar", origen: A }, {}, TODO);
        expect(sinOrigen.validacion.ok).toBe(false);
        expect(sinOrigen.validacion.errores[0]).toContain("No hay instantánea de la biblioteca de origen");
        const sinDestino = planificar(
            { tipo: "copiar", origen: A },
            instantaneas(doc([]), doc([])),
            TODO,
        );
        expect(sinDestino.validacion.errores).toEqual(["Falta la biblioteca de destino."]);
        const mismo = planificar({ tipo: "mover", origen: A, destino: A }, instantaneas(doc([]), doc([])), TODO);
        expect(mismo.validacion.errores).toEqual(["El destino es la misma biblioteca que el origen."]);
        const sinDestinoDoc = planificar(
            { tipo: "copiar", origen: A, destino: B },
            { "user:cuenta-a": doc([]) },
            TODO,
        );
        expect(sinDestinoDoc.validacion.errores[0]).toContain("No hay instantánea de la biblioteca de destino");
    });

    it("ítems sin permiso de ver o de editar se omiten con su motivo", () => {
        const permisos: PermisosPlan = {
            puedeVer: (_ref, it) => (it ? it.id !== "oculto" : true),
            puedeEditar: (_ref, it) => (it ? it.id !== "candado" : true),
        };
        const plan = planificar(
            { tipo: "quitar", origen: A, itemIds: ["oculto", "candado", "free"] },
            instantaneas(doc([item("oculto"), item("candado"), item("free")]), doc([])),
            permisos,
        );
        expect(plan.vistaPrevia.quitaReversible).toEqual(["free"]);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "candado", motivo: "Sin permiso para editar este ítem." },
            { id: "oculto", motivo: "Sin permiso para ver este ítem." },
        ]);
    });

    it("deduplicar solo PROPONE: agrupa y no quita ni deja diario", () => {
        const plan = planificar(
            { tipo: "deduplicar", origen: A, itemIds: ["d1", "d2", "e1", "e2"] },
            instantaneas(
                doc([item("d1", { refId: "dup-1" }), item("d2", { refId: "dup-1" }), item("e1", { title: "Igual" }), item("e2", { title: "Igual" })]),
                doc([]),
            ),
            TODO,
        );
        expect(plan.validacion.avisos.join(" ")).toContain("solo PROPONE");
        expect(plan.vistaPrevia.modifica).toEqual(["d2", "e2"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.deshacer).toEqual([]);
    });

    it("planificar dos veces da exactamente lo mismo", () => {
        const op = { tipo: "copiar" as const, origen: A, destino: B, itemIds: ["i1", "i2"] };
        const instant = instantaneas(doc([item("i2"), item("i1")]), doc([]));
        expect(JSON.stringify(planificar(op, instant, TODO))).toBe(JSON.stringify(planificar(op, instant, TODO)));
        const opQuitar = { tipo: "quitar" as const, origen: A, itemIds: ["u1", "u2"] };
        const docA = doc([item("u1", { refId: "s" }), item("u2")]);
        expect(JSON.stringify(planificar(opQuitar, instantaneas(docA, doc([])), TODO))).toBe(
            JSON.stringify(planificar(opQuitar, instantaneas(docA, doc([])), TODO)),
        );
    });

    it("resumenPlan habla en español y dice lo que pasaría", () => {
        const copiar = planificar(
            { tipo: "copiar", origen: A, destino: B, itemIds: ["s1", "s2", "s3"] },
            instantaneas(doc([item("s1"), item("s2", { refId: "s2" }), item("s3")]), doc([item("ya", { refId: "s2" })])),
            TODO,
        );
        expect(resumenPlan(copiar)).toBe("Copiarías 2, omitiría 1.");
        const quitar = planificar(
            { tipo: "quitar", origen: A, itemIds: ["q1", "q2"] },
            instantaneas(doc([item("q1", { refId: "solo" }), item("q2")]), doc([])),
            TODO,
        );
        const resumenQuitar = resumenPlan(quitar);
        expect(resumenQuitar).toContain("Quitarías 2 (reversible)");
        expect(resumenQuitar).toContain("2 últimas copias");
        const dedup = planificar(
            { tipo: "deduplicar", origen: A, itemIds: ["d1", "d2"] },
            instantaneas(doc([item("d1", { refId: "k" }), item("d2", { refId: "k" })]), doc([])),
            TODO,
        );
        expect(resumenPlan(dedup)).toContain("Propondría quitar 1 duplicado");
        expect(resumenPlan(dedup)).toContain("No se quita nada sin tu confirmación.");
    });
});
