import { describe, expect, it } from "vitest";
import {
    CURVA,
    DURACION,
    cssDe,
    escalonar,
    respetarMovimientoReducido,
    tokensDe,
    type Interaccion,
} from "@/lib/design/movimiento";

const INTERACCIONES: Interaccion[] = [
    "hover",
    "press",
    "entrar",
    "salir",
    "foco",
    "error",
    "exito",
];

const VALORES_DURACION = Object.values(DURACION);

describe("tokensDe — las siete interacciones dentro de la escala del OS", () => {
    it.each(INTERACCIONES)("devuelve duración de DURACION para «%s»", (i) => {
        const t = tokensDe(i, false);
        expect(VALORES_DURACION).toContain(t.duracionMs);
        expect(t.curva).toBeTruthy();
    });

    it.each(INTERACCIONES)("«%s» sin movimiento reducido conserva sus tokens", (i) => {
        const t = tokensDe(i, false);
        expect(t.duracionMs).toBeGreaterThan(0);
    });
});

describe("respetarMovimientoReducido", () => {
    it("con movimiento reducido pone duración 0 y quita el transform", () => {
        const resultado = respetarMovimientoReducido(
            { duracionMs: 220, curva: CURVA.suave, transform: "scale(0.97)" },
            true,
        );
        expect(resultado.duracionMs).toBe(0);
        expect(resultado).not.toHaveProperty("transform");
    });

    it("sin movimiento reducido deja el objeto intacto", () => {
        const original = { duracionMs: 220, curva: CURVA.suave, transform: "scale(0.97)" };
        const resultado = respetarMovimientoReducido(original, false);
        expect(resultado).toEqual(original);
    });
});

describe("escalonar", () => {
    it("incrementa por pasos y respeta el tope", () => {
        expect(escalonar(0)).toBe(0);
        expect(escalonar(1)).toBe(40);
        expect(escalonar(3)).toBe(120);
        expect(escalonar(100)).toBe(240);
        expect(escalonar(0, 30, 150)).toBe(0);
        expect(escalonar(100, 30, 150)).toBe(150);
    });

    it("usa los parámetros por defecto cuando se omite el paso", () => {
        expect(escalonar(2)).toBe(80);
    });
});

describe("cssDe", () => {
    it("formatea duración y curva como un transition válido", () => {
        expect(cssDe({ duracionMs: 220, curva: CURVA.suave })).toBe(
            "220ms cubic-bezier(0.4, 0, 0.2, 1)",
        );
        expect(cssDe({ duracionMs: 150, curva: CURVA.entrada })).toBe(
            "150ms cubic-bezier(0.16, 1, 0.3, 1)",
        );
    });
});