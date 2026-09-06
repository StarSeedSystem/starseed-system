/**
 * TESTS DE EMOCIÓN E INTENSIDAD DE VOZ (Tarea G1 · Ola 264)
 */

import { describe, expect, it } from "vitest";

import type { PerfilNeuronal } from "@/lib/voces/perfil-neuronal";
import { aplicarEmocion, emocionDesdeTexto } from "@/lib/voces/emociones";

const PERFIL_BASE: PerfilNeuronal = {
    voz: "ef_dora",
    speed: 1.0,
    instruct: "female, young adult, moderate pitch",
    seed: 700001,
    pitch: 1.0,
    ignorados: [],
};

const EXPR_BASE = { arco: 0.2, vivacidad: 0.2, calidez: 0.2 };

describe("aplicarEmocion", () => {
    it("neutra con intensidad 1 no cambia nada", () => {
        const r = aplicarEmocion(PERFIL_BASE, EXPR_BASE, "neutra", 1);
        expect(r.perfil.speed).toBeCloseTo(1.0);
        expect(r.perfil.pitch).toBeCloseTo(1.0);
        expect(r.expr).toEqual(EXPR_BASE);
        expect(r.perfil.instruct).toBe(PERFIL_BASE.instruct);
    });

    it("alegre con intensidad 2 duplica la desviación y acota", () => {
        // speed: 1 × (1 + (1.08 − 1) × 2) = 1.16; vivacidad: 0.2 + 0.15 × 2 = 0.5
        const r = aplicarEmocion(PERFIL_BASE, EXPR_BASE, "alegre", 2);
        expect(r.perfil.speed).toBeCloseTo(1.16);
        expect(r.perfil.pitch).toBeCloseTo(1.1);
        expect(r.expr.vivacidad).toBeCloseTo(0.5);
        // Con una base alta, la suma se acota a 1.
        const r2 = aplicarEmocion(PERFIL_BASE, { ...EXPR_BASE, vivacidad: 0.95 }, "alegre", 2);
        expect(r2.expr.vivacidad).toBe(1);
    });

    it("la intensidad se acota a [0, 2]", () => {
        const r = aplicarEmocion(PERFIL_BASE, EXPR_BASE, "urgente", 99);
        expect(r.perfil.speed).toBeCloseTo(1.36); // 1 + 0.18 × 2
    });

    it("susurro añade «whisper» al instruct y neutra lo quita", () => {
        const conSusurro = aplicarEmocion(PERFIL_BASE, EXPR_BASE, "susurro", 1);
        expect(conSusurro.perfil.instruct).toContain("whisper");
        expect(conSusurro.perfil.instruct).toContain("female");
        const deVuelta = aplicarEmocion(conSusurro.perfil, EXPR_BASE, "neutra", 1);
        expect(deVuelta.perfil.instruct).not.toContain("whisper");
    });

    it("susurro con intensidad < 0.5 no toca el instruct", () => {
        const r = aplicarEmocion(PERFIL_BASE, EXPR_BASE, "susurro", 0.4);
        expect(r.perfil.instruct).toBe(PERFIL_BASE.instruct);
    });

    it("triste reemplaza el token de tono por «low pitch»", () => {
        const r = aplicarEmocion(PERFIL_BASE, EXPR_BASE, "triste", 1);
        expect(r.perfil.instruct).toContain("low pitch");
        expect(r.perfil.instruct).not.toContain("moderate pitch");
    });
});

describe("emocionDesdeTexto", () => {
    it("reconoce «[Alegre 1.5] Hola» (insensible a mayúsculas)", () => {
        const r = emocionDesdeTexto("[Alegre 1.5] Hola");
        expect(r.emocion).toBe("alegre");
        expect(r.intensidad).toBe(1.5);
        expect(r.textoLimpio).toBe("Hola");
    });

    it("reconoce «[susurro]» sin intensidad", () => {
        const r = emocionDesdeTexto("[susurro] pssst");
        expect(r.emocion).toBe("susurro");
        expect(r.intensidad).toBeNull();
        expect(r.textoLimpio).toBe("pssst");
    });

    it("acepta tildes y mayúsculas en la etiqueta", () => {
        const r = emocionDesdeTexto("[JUGUETÓN] vamos");
        expect(r.emocion).toBe("jugueton");
    });

    it("texto sin etiqueta devuelve nulls y el mismo texto", () => {
        const r = emocionDesdeTexto("Hola, qué tal");
        expect(r.emocion).toBeNull();
        expect(r.intensidad).toBeNull();
        expect(r.textoLimpio).toBe("Hola, qué tal");
    });

    it("etiqueta desconocida no se consume", () => {
        const r = emocionDesdeTexto("[furiosa] no");
        expect(r.emocion).toBeNull();
        expect(r.textoLimpio).toBe("[furiosa] no");
    });
});
