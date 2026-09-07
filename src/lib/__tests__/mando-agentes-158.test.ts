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
});
