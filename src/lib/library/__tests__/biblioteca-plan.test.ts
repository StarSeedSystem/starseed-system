import { describe, it, expect } from "vitest";
import {
    planificar,
    resumenPlan,
    claveInstantanea,
    type OperacionBiblioteca,
} from "../biblioteca-plan";
import type { EntityLibraryDoc, EntityRef, SavedItem } from "../entity-library";

const ORIGEN: EntityRef = { kind: "user", id: "cuenta-a" };
const DESTINO: EntityRef = { kind: "group", id: "grupo-b" };
const OTRO: EntityRef = { kind: "page", id: "pagina-c" };

function item(id: string, extra: Partial<SavedItem> = {}): SavedItem {
    return {
        id,
        type: "bookmark",
        title: `Ítem ${id}`,
        tags: [],
        folderId: null,
        addedAt: "2026-10-25T10:00:00.000Z",
        addedBy: "cuenta-a",
        ...extra,
    };
}

function doc(items: SavedItem[]): EntityLibraryDoc {
    return {
        items,
        folders: [],
        rev: 1,
        updatedAt: "2026-10-25T10:00:00.000Z",
        version: 3,
        deletedItems: {},
        deletedFolders: {},
    };
}

function instantaneas(
    ...pares: Array<[EntityRef, EntityLibraryDoc]>
): Record<string, EntityLibraryDoc> {
    const out: Record<string, EntityLibraryDoc> = {};
    for (const [ref, d] of pares) out[claveInstantanea(ref)] = d;
    return out;
}

const PERMISOS_TODO = {
    puedeVer: () => true,
    puedeEditar: () => true,
};

describe("biblioteca-plan (INF1025G)", () => {
    it("claveInstantanea usa kind:id", () => {
        expect(claveInstantanea(ORIGEN)).toBe("user:cuenta-a");
    });

    it("copiar crea en el destino lo que falta, sin pisar el mismo id, y su diario quita lo creado", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("i1", { refId: "r1" }), item("i2")])],
            [DESTINO, doc([item("i2")])],
        );
        const plan = planificar({ tipo: "copiar", origen: ORIGEN, destino: DESTINO }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "i2", motivo: "Ya existe un ítem con el mismo id en el destino." },
        ]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: DESTINO, itemId: "i1" }]);
    });

    it("copiar no pisa un recurso que el destino ya referencia (Entidad Única)", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("i1", { refId: "paquete-x" })])],
            [DESTINO, doc([item("otro", { refId: "paquete-x" })])],
        );
        const plan = planificar({ tipo: "copiar", origen: ORIGEN, destino: DESTINO }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual([]);
        expect(plan.vistaPrevia.omite[0].id).toBe("i1");
        expect(plan.vistaPrevia.omite[0].motivo).toContain("Entidad Única");
    });

    it("mover deja lápida reversible en el origen, crea en el destino y el diario lo restaura", () => {
        const urlCompartida = "https://ejemplo.com/compartida";
        const inst = instantaneas(
            [ORIGEN, doc([item("i1", { folderId: "f-9", url: urlCompartida })])],
            [DESTINO, doc([])],
            [OTRO, doc([item("z", { url: urlCompartida })])],
        );
        const plan = planificar(
            { tipo: "mover", origen: ORIGEN, destino: DESTINO, itemIds: ["i1"] },
            inst,
            PERMISOS_TODO,
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.validacion.avisos).toEqual([]);
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["i1"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.deshacer).toEqual([
            { op: "quitar", ref: DESTINO, itemId: "i1" },
            { op: "restaurar", ref: ORIGEN, itemId: "i1", haciaCarpeta: "f-9" },
        ]);
    });

    it("mover también avisa cuando lo que se mueve es la última copia", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("u", { url: "https://ejemplo.com/unica" })])],
            [DESTINO, doc([])],
        );
        const plan = planificar(
            { tipo: "mover", origen: ORIGEN, destino: DESTINO, itemIds: ["u"] },
            inst,
            PERMISOS_TODO,
        );
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["u"]);
        expect(plan.validacion.avisos).toContain("Es la última copia: haz una antes de quitarla.");
    });

    it("fusionar añade al destino lo que le falta y NUNCA borra nada", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("i1", { refId: "r1" }), item("i2", { refId: "r2" })])],
            [DESTINO, doc([item("d2", { refId: "r2" })])],
        );
        const plan = planificar({ tipo: "fusionar", origen: ORIGEN, destino: DESTINO }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.vistaPrevia.omite).toEqual([
            {
                id: "i2",
                motivo: "Ya está en el destino: la fusión no lo toca. (El destino ya referencia este recurso (Entidad Única): no se duplica.)",
            },
        ]);
        expect(plan.validacion.avisos).toContain("La fusión nunca borra: solo añade al destino lo que le falta.");
        expect(plan.deshacer).toEqual([{ op: "quitar", ref: DESTINO, itemId: "i1" }]);
    });

    it("quitar avisa cuando el ítem es la última copia y su diario lo restaura", () => {
        const inst = instantaneas([ORIGEN, doc([item("unico", { url: "https://ejemplo.com/unica" })])]);
        const plan = planificar({ tipo: "quitar", origen: ORIGEN, itemIds: ["unico"] }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["unico"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual(["unico"]);
        expect(plan.validacion.avisos).toContain("Es la última copia: haz una antes de quitarla.");
        expect(plan.deshacer).toEqual([{ op: "restaurar", ref: ORIGEN, itemId: "unico" }]);
    });

    it("quitar NO avisa cuando otra biblioteca conserva la misma url", () => {
        const url = "https://ejemplo.com/compartida";
        const inst = instantaneas(
            [ORIGEN, doc([item("a", { url })])],
            [OTRO, doc([item("b", { url })])],
        );
        const plan = planificar({ tipo: "quitar", origen: ORIGEN, itemIds: ["a"] }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.quitaReversible).toEqual(["a"]);
        expect(plan.vistaPrevia.ultimaCopia).toEqual([]);
        expect(plan.validacion.avisos).toEqual([]);
    });

    it("sin permiso de edición en el origen el plan se bloquea con error en español", () => {
        const inst = instantaneas([ORIGEN, doc([item("i1")])]);
        const plan = planificar(
            { tipo: "quitar", origen: ORIGEN, itemIds: ["i1"] },
            inst,
            { puedeVer: () => true, puedeEditar: () => false },
        );
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.join(" ")).toContain("Sin permiso de edición en la biblioteca de origen.");
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([]);
    });

    it("sin permiso de edición en el destino el plan de copiar se bloquea", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("i1")])],
            [DESTINO, doc([])],
        );
        const plan = planificar(
            { tipo: "copiar", origen: ORIGEN, destino: DESTINO },
            inst,
            { puedeVer: () => true, puedeEditar: () => false },
        );
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores.join(" ")).toContain("Sin permiso de edición en la biblioteca destino.");
        expect(plan.vistaPrevia.crea).toEqual([]);
    });

    it("un ítem sin permiso de ver se omite CON motivo, nunca en silencio", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("visible"), item("oculto")])],
            [DESTINO, doc([])],
        );
        const plan = planificar(
            { tipo: "copiar", origen: ORIGEN, destino: DESTINO, itemIds: ["visible", "oculto"] },
            inst,
            { puedeVer: (_ref, it) => it.id !== "oculto", puedeEditar: () => true },
        );
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.crea).toEqual(["visible"]);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "oculto", motivo: "Sin permiso para ver este ítem." },
        ]);
    });

    it("deduplicar agrupa por refId y SOLO PROPONE: no quita nada ni deja diario", () => {
        const inst = instantaneas([
            ORIGEN,
            doc([item("d1", { refId: "r" }), item("d2", { refId: "r" }), item("d3", { refId: "otro" })]),
        ]);
        const plan = planificar({ tipo: "deduplicar", origen: ORIGEN }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(true);
        expect(plan.vistaPrevia.modifica).toEqual(["d2"]);
        expect(plan.vistaPrevia.quitaReversible).toEqual([]);
        expect(plan.deshacer).toEqual([]);
        expect(plan.validacion.avisos).toContain(
            "La deduplicación solo propone: no se quita nada sin confirmación humana.",
        );
    });

    it("deduplicar NUNCA propone quitar una última copia (título+tipo sin identidad)", () => {
        const inst = instantaneas([
            ORIGEN,
            doc([item("n1", { title: "Notas" }), item("n2", { title: "Notas" })]),
        ]);
        const plan = planificar({ tipo: "deduplicar", origen: ORIGEN }, inst, PERMISOS_TODO);
        expect(plan.vistaPrevia.modifica).toEqual([]);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "n2", motivo: "Es la última copia: no se propone quitarla." },
        ]);
    });

    it("planificar DOS VECES da exactamente lo mismo (determinista)", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("m1", { url: "https://ejemplo.com/1" }), item("m2"), item("m3", { refId: "rx" })])],
            [DESTINO, doc([item("m3", { refId: "rx" })])],
        );
        const op: OperacionBiblioteca = { tipo: "mover", origen: ORIGEN, destino: DESTINO };
        const a = planificar(op, inst, PERMISOS_TODO);
        const b = planificar(op, inst, PERMISOS_TODO);
        expect(b).toEqual(a);
        expect(a.vistaPrevia.crea).toEqual(["m1", "m2"]);
        expect(a.vistaPrevia.omite.map((o) => o.id)).toEqual(["m3"]);
    });

    it("el destino igual al origen es un error", () => {
        const inst = instantaneas([ORIGEN, doc([item("i1")])]);
        const plan = planificar({ tipo: "copiar", origen: ORIGEN, destino: ORIGEN }, inst, PERMISOS_TODO);
        expect(plan.validacion.ok).toBe(false);
        expect(plan.validacion.errores).toContain("El destino es igual al origen: no hay nada que hacer.");
    });

    it("copiar sin destino y sin instantánea del origen son errores en español", () => {
        const sinDestino = planificar({ tipo: "copiar", origen: ORIGEN }, {}, PERMISOS_TODO);
        expect(sinDestino.validacion.ok).toBe(false);
        expect(sinDestino.validacion.errores.join(" ")).toContain("necesita una biblioteca destino");

        const sinOrigen = planificar(
            { tipo: "copiar", origen: ORIGEN, destino: DESTINO },
            instantaneas([DESTINO, doc([])]),
            PERMISOS_TODO,
        );
        expect(sinOrigen.validacion.ok).toBe(false);
        expect(sinOrigen.validacion.errores.join(" ")).toContain("No hay instantánea de la biblioteca de origen");
    });

    it("un itemIds desconocido se omite con motivo", () => {
        const inst = instantaneas(
            [ORIGEN, doc([item("i1")])],
            [DESTINO, doc([])],
        );
        const plan = planificar(
            { tipo: "copiar", origen: ORIGEN, destino: DESTINO, itemIds: ["i1", "fantasma"] },
            inst,
            PERMISOS_TODO,
        );
        expect(plan.vistaPrevia.crea).toEqual(["i1"]);
        expect(plan.vistaPrevia.omite).toEqual([
            { id: "fantasma", motivo: "No existe en la biblioteca de origen." },
        ]);
    });

    it("resumenPlan habla en español y con los números del plan", () => {
        const instCopiar = instantaneas(
            [ORIGEN, doc([item("i1"), item("i2")])],
            [DESTINO, doc([item("i2")])],
        );
        const planCopiar = planificar({ tipo: "copiar", origen: ORIGEN, destino: DESTINO }, instCopiar, PERMISOS_TODO);
        expect(resumenPlan(planCopiar)).toBe("Copiarías 1 y omitirías 1.");

        const instQuitar = instantaneas([ORIGEN, doc([item("unico")])]);
        const planQuitar = planificar({ tipo: "quitar", origen: ORIGEN, itemIds: ["unico"] }, instQuitar, PERMISOS_TODO);
        expect(resumenPlan(planQuitar)).toBe(
            "Quitarías 1 (reversible con lápida). Es la última copia: haz una antes de quitarla.",
        );

        const instDedupe = instantaneas([ORIGEN, doc([item("d1", { refId: "r" }), item("d2", { refId: "r" })])]);
        const planDedupe = planificar({ tipo: "deduplicar", origen: ORIGEN }, instDedupe, PERMISOS_TODO);
        expect(resumenPlan(planDedupe)).toBe(
            "Deduplicarías 1 (solo propuesta: no se quita nada sin tu confirmación).",
        );

        const bloqueado = planificar({ tipo: "copiar", origen: ORIGEN, destino: ORIGEN }, instCopiar, PERMISOS_TODO);
        expect(resumenPlan(bloqueado)).toBe(
            "Plan bloqueado: El destino es igual al origen: no hay nada que hacer.",
        );
    });
});
