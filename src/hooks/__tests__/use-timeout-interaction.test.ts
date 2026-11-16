import { describe, expect, it } from "vitest";
import {
    EVENTOS_INTERACCION,
    alInteractuar,
    haVencido,
    msRestantes,
    nuevaCuentaAtras,
} from "@/hooks/use-timeout-interaction";

describe("cuenta atrás por interacción", () => {
    it("no vence antes de la espera y vence justo al cumplirla", () => {
        const cuenta = nuevaCuentaAtras(1_000, 900);
        expect(haVencido(cuenta, 1_899)).toBe(false);
        expect(haVencido(cuenta, 1_900)).toBe(true);
    });

    it("cada interacción reinicia la espera completa (no acumula el tiempo anterior)", () => {
        let cuenta = nuevaCuentaAtras(1_000, 900);
        cuenta = alInteractuar(cuenta, 1_500);
        expect(haVencido(cuenta, 2_399)).toBe(false);
        expect(haVencido(cuenta, 2_400)).toBe(true);
        expect(msRestantes(cuenta, 2_000)).toBe(400);
    });

    it("lo que falta nunca es negativo, aunque se pregunte mucho después", () => {
        const cuenta = nuevaCuentaAtras(0, 500);
        expect(msRestantes(cuenta, 10_000)).toBe(0);
    });

    it("datos no finitos no adelantan la apertura", () => {
        const cuenta = nuevaCuentaAtras(Number.NaN, Number.NaN);
        expect(haVencido(cuenta, Number.NaN)).toBe(false);
        expect(alInteractuar(cuenta, Number.NaN)).toBe(cuenta);
    });

    it("vigila los gestos con los que se navega de verdad", () => {
        for (const evento of ["scroll", "pointerdown", "keydown", "wheel", "touchstart"]) {
            expect(EVENTOS_INTERACCION).toContain(evento);
        }
    });
});
