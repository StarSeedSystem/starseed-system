/**
 * Test de `cruzarPersonalidades` (Ola 270 · 2026-09-07).
 * ─────────────────────────────────────────────────────────────────────────────
 * La función pura que une el corpus vivo del backend 1.58 con las
 * personalidades del OS. Sin ella bien, el árbol del Mando dibujaría turnos
 * de personalidades que no son o marcaría activas dos a la vez.
 * Cubre: con corpus (turnos y último por nombre, activa elegida) y sin corpus
 * (ceros y primera activa), además del emparejado tolerante a mayúsculas.
 */

import { describe, expect, it } from "vitest";

import {
    cruzarPersonalidades,
    normalizarProcesos,
    type CorpusRama,
    type PersonalidadBasica,
} from "@/lib/mando/agentes-158";

const PERS: PersonalidadBasica[] = [
    { id: "preset-aurora", nombre: "Aurora" },
    { id: "preset-poeta-ciberdelica", nombre: "Poeta Ciberdélica" },
];

function corpusCon(entradas: Record<string, number>): CorpusRama {
    const personalidades: CorpusRama["personalidades"] = {};
    for (const [nombre, turnos] of Object.entries(entradas)) {
        personalidades[nombre] = { turnos, train: turnos, val: 0, ultimo: "2026-09-07T10:00:00Z" };
    }
    return {
        activo: true,
        personalidades,
        total: Object.values(entradas).reduce((a, b) => a + b, 0),
        valoraciones: 0,
        bytes: 0,
    };
}

describe("cruzarPersonalidades", () => {
    it("sin corpus: devuelve la lista del OS con ceros y marca la primera como activa", () => {
        const rama = cruzarPersonalidades(null, PERS, null);
        expect(rama).toHaveLength(2);
        expect(rama[0].turnos).toBe(0);
        expect(rama[0].ultimo).toBeNull();
        expect(rama[0].activa).toBe(true);
        expect(rama[1].activa).toBe(false);
    });

    it("con corpus: copia turnos y último por nombre, y marca la activa elegida", () => {
        const corpus = corpusCon({ Aurora: 42, "Poeta Ciberdélica": 7 });
        const rama = cruzarPersonalidades(corpus, PERS, "preset-poeta-ciberdelica");
        expect(rama[0].turnos).toBe(42);
        expect(rama[0].ultimo).toBe("2026-09-07T10:00:00Z");
        expect(rama[0].activa).toBe(false);
        expect(rama[1].turnos).toBe(7);
        expect(rama[1].activa).toBe(true);
    });

    it("empareja nombres sin sustos de mayúsculas ni espacios", () => {
        const corpus = corpusCon({ "  aurora  ": 5 });
        const rama = cruzarPersonalidades(corpus, PERS, null);
        expect(rama[0].turnos).toBe(5);
    });

    it("una personalidad sin turnos en el corpus sale a cero, no undefined", () => {
        const corpus = corpusCon({ Aurora: 3 });
        const rama = cruzarPersonalidades(corpus, PERS, null);
        expect(rama[1].turnos).toBe(0);
        expect(rama[1].ultimo).toBeNull();
    });

    it("marca las del OS con origen «os»", () => {
        const rama = cruzarPersonalidades(null, PERS, null);
        expect(rama.every((p) => p.origen === "os")).toBe(true);
    });

    it("las ramas solo del corpus (astraura_prime, cognition…) salen al final con origen «corpus»", () => {
        const corpus = corpusCon({ Aurora: 2, astraura_prime: 1, cognition: 344, default: 0 });
        const rama = cruzarPersonalidades(corpus, PERS, null);
        // Las dos del OS primero, intactas y con su origen.
        expect(rama[0].id).toBe("preset-aurora");
        expect(rama[0].origen).toBe("os");
        expect(rama[0].turnos).toBe(2);
        expect(rama[1].id).toBe("preset-poeta-ciberdelica");
        // Después las tres del corpus que no casaron: no se pierde ninguna.
        expect(rama).toHaveLength(5);
        const delCorpus = rama.slice(2);
        expect(delCorpus.every((p) => p.origen === "corpus")).toBe(true);
        const porId = new Map(delCorpus.map((p) => [p.id, p]));
        expect(porId.get("astraura_prime")?.nombre).toBe("Astraura Prime");
        expect(porId.get("astraura_prime")?.turnos).toBe(1);
        expect(porId.get("cognition")?.nombre).toBe("Cognition (fondo)");
        expect(porId.get("cognition")?.turnos).toBe(344);
        expect(porId.get("default")?.nombre).toBe("Default");
    });

    it("casa por nombre normalizado: «astraura_prime» no cuela como preset y una del OS que sí nombra el corpus casa", () => {
        const corpus = corpusCon({ "poeta ciberdelica": 9 });
        const rama = cruzarPersonalidades(corpus, PERS, null);
        // Casa por nombre (sin acento contra acento) por la normalización.
        expect(rama[1].turnos).toBe(9);
        expect(rama[1].origen).toBe("os");
        // Y no queda duplicada como rama del corpus.
        expect(rama).toHaveLength(2);
    });

    it("una rama del corpus marcada activa por el backend se respeta", () => {
        const corpus = corpusCon({ cognition: 5 });
        corpus.personalidades.cognition.activa = true;
        const rama = cruzarPersonalidades(corpus, PERS, null);
        const cognition = rama.find((p) => p.id === "cognition");
        expect(cognition?.activa).toBe(true);
    });

});

describe("normalizarProcesos", () => {
    it("acepta la forma envuelta del backend: {success, procesos: [...]}", () => {
        const procesos = normalizarProcesos({
            success: true,
            procesos: [
                { id: "imaginacion", nombre: "Imaginación", activo: true, ultimo: "2026-09-07T10:00:00Z", detalle: "soñando" },
                { id: "learner", nombre: "Learner", activo: null, ultimo: null, detalle: null },
            ],
        });
        expect(procesos).toHaveLength(2);
        expect(procesos[0].id).toBe("imaginacion");
        expect(procesos[0].activo).toBe(true);
        expect(procesos[1].id).toBe("learner");
        expect(procesos[1].activo).toBeNull();
    });

    it("acepta un array suelto y descarta entradas sin id", () => {
        const procesos = normalizarProcesos([
            { id: "director", nombre: "Director" },
            { nombre: "sin id" },
        ]);
        expect(procesos).toHaveLength(1);
        expect(procesos[0].id).toBe("director");
    });

    it("con cualquier otra forma devuelve vacío", () => {
        expect(normalizarProcesos(null)).toEqual([]);
        expect(normalizarProcesos({ success: true })).toEqual([]);
        expect(normalizarProcesos("no")).toEqual([]);
    });
});
