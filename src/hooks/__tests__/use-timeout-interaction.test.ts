/**
 * useTimeoutInteraction · lógica pura del temporizador de calma.
 *
 * La guía de Aurora se abre sola tras un respiro, pero SOLO si la persona no
 * está haciendo algo (deslizar, pulsar, mover el ratón, leer con scroll): el
 * temporizador se reinicia con cada interacción y expira en calma. Aquí se
 * prueban las funciones puras que deciden cuándo reiniciar y qué eventos
 * cuentan como interacción; la suscripción real vive en el hook (DOM).
 */
import { describe, expect, it } from "vitest";
import {
    EVENTOS_INTERACCION,
    REPOSICION_MINIMA_MS,
    debeReiniciar,
} from "../use-timeout-interaction";

describe("EVENTOS_INTERACCION", () => {
    it("cubre los gestos que interrumpen una lectura: pulsar, mover, rueda, tecla, dedo y scroll", () => {
        for (const evento of ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "scroll"]) {
            expect(EVENTOS_INTERACCION).toContain(evento);
        }
    });

    it("no repite eventos (cada uno se suscribe una sola vez)", () => {
        expect(new Set(EVENTOS_INTERACCION).size).toBe(EVENTOS_INTERACCION.length);
    });
});

describe("debeReiniciar", () => {
    it("reinicia con la primera interacción de la que tiene constancia", () => {
        expect(debeReiniciar(null, 1000, 250)).toBe(true);
    });

    it("reinicia si la anterior reposición es más antigua que el mínimo", () => {
        expect(debeReiniciar(1000, 1400, 250)).toBe(true);
    });

    it("no reinicia en el mismo gesto (menos de REPOSICION_MINIMA_MS desde la última)", () => {
        expect(debeReiniciar(1000, 1200, REPOSICION_MINIMA_MS)).toBe(false);
    });

    it("reinicia justo al cumplir el mínimo", () => {
        expect(debeReiniciar(1000, 1250, REPOSICION_MINIMA_MS)).toBe(true);
    });

    it("sin mínimo (0) reinicia siempre", () => {
        expect(debeReiniciar(1000, 1100, 0)).toBe(true);
    });
});
