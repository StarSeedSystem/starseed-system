// src/lib/aurora/voz-starseed/__tests__/motor-intensidad.test.ts
/**
 * TESTS DE VALIDACIÓN DE INTENSIDAD EN EL MOTOR ÚNICO «VOZ STARSEED».
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corrobora el arreglo de los riesgos de la revisión:
 *   1. `clampIntensidad` no debe dejar pasar NaN (antes: NaN atravesaba las
 *      comparaciones y llegaba al timbre con speed/pitch rotos).
 *   2. `clampIntensidad` debe estar EN USO: `resolverEmocion` valida ahora toda
 *      entrada de intensidad (etiqueta, opciones del turno, timbre persistido).
 *
 * Rango operativo documentado del motor (Ola 264 · `emociones.ts`): [0, 2],
 * con 1 = la emoción «de manual». Entrada no útil → 0 («sin marca»), que es
 * la salida segura.
 */

import { describe, expect, it } from "vitest";
import {
    clampIntensidad,
    resolverEmocion,
} from "@/lib/aurora/voz-starseed/motor";
import type { Timbre } from "@/lib/aurora/timbres";

/** Timbre mínimo de prueba (mismo esqueleto que motor-emocion.test.ts). */
const timbre: Timbre = {
    id: "t-prueba",
    nombre: "Prueba",
    genero: "neutra",
    desc: "Timbre de test",
    local: { voz: "em_alex", speed: 1, instruct: "young adult, moderate pitch" },
    sistema: { bases: ["Paulina"], pitch: 1, rate: 1 },
    expr: { arco: 0.1, vivacidad: 0.1, calidez: 0.1 },
    emocionBase: "serena",
    intensidad: 0.7,
};

describe("clampIntensidad — entrada del motor validada", () => {
    it("NaN es una salida segura: devuelve 0 («sin marca»)", () => {
        expect(clampIntensidad(Number.NaN)).toBe(0);
    });

    it("Infinity no atraviesa: devuelve 0", () => {
        expect(clampIntensidad(Number.POSITIVE_INFINITY)).toBe(0);
        expect(clampIntensidad(Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it("por debajo de 0 devuelve 0", () => {
        expect(clampIntensidad(-3)).toBe(0);
        expect(clampIntensidad(-0.001)).toBe(0);
        expect(clampIntensidad(0)).toBe(0);
    });

    it("dentro del rango [0, 2] se devuelve tal cual", () => {
        expect(clampIntensidad(0.5)).toBe(0.5);
        expect(clampIntensidad(1)).toBe(1);
        expect(clampIntensidad(2)).toBe(2);
    });

    it("por encima del tope operativo (2) devuelve 2", () => {
        expect(clampIntensidad(5)).toBe(2);
        expect(clampIntensidad(999.9)).toBe(2);
    });
});

describe("resolverEmocion — la validación está EN USO en la costura pública", () => {
    it("opciones NaN: intensidad 0, timbre base intacto", () => {
        const r = resolverEmocion("Hola", { emocion: "alegre", intensidad: Number.NaN });
        expect(r.intensidad).toBe(0);
    });

    it("opciones fuera de rango (5): acotada al tope 2", () => {
        const r = resolverEmocion("Hola", { emocion: "jugueton", intensidad: 5 });
        expect(r.intensidad).toBe(2);
    });

    it("timbre persistido con intensidad rota (NaN): acotada a 0 en vez de atravesar", () => {
        const roto: Timbre = { ...timbre, intensidad: Number.NaN };
        const r = resolverEmocion("Hola", {}, roto);
        expect(r.intensidad).toBe(0);
    });

    it("las entradas ya válidas no cambian (regresión de precedencia)", () => {
        expect(resolverEmocion("[triste 1.5] Hola.", {}, timbre).intensidad).toBe(1.5);
        expect(resolverEmocion("Hola", { intensidad: 2 }, timbre).intensidad).toBe(2);
        expect(resolverEmocion("Hola", {}, timbre).intensidad).toBe(0.7);
    });
});
