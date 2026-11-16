import { describe, it, expect } from "vitest";
import {
    PACIENCIA_GUIA_MS,
    esperaHastaSilencio,
    interaccionReciente,
} from "../guia-espera";

describe("guia-espera · el temporizador se reinicia con la interacción", () => {
    describe("interaccionReciente", () => {
        it("sin interacción registrada no hay nada que esperar", () => {
            expect(interaccionReciente(null, 10_000)).toBe(false);
        });

        it("una interacción dentro de la paciencia cuenta como reciente", () => {
            expect(interaccionReciente(8_000, 10_000, 3_000)).toBe(true);
        });

        it("justo al agotarse la paciencia ya no es reciente", () => {
            expect(interaccionReciente(7_000, 10_000, 3_000)).toBe(false);
        });

        it("una marca futura (reloj que retrocede) nunca interrumpe", () => {
            expect(interaccionReciente(12_000, 10_000, 3_000)).toBe(false);
        });

        it("usa la paciencia por defecto cuando no se indica otra", () => {
            expect(interaccionReciente(10_000 - PACIENCIA_GUIA_MS + 1, 10_000)).toBe(true);
            expect(interaccionReciente(10_000 - PACIENCIA_GUIA_MS, 10_000)).toBe(false);
        });
    });

    describe("esperaHastaSilencio", () => {
        it("sin interacción previa espera la paciencia completa", () => {
            expect(esperaHastaSilencio(null, 10_000, 3_000)).toBe(3_000);
        });

        it("con interacción reciente espera solo lo que falta", () => {
            expect(esperaHastaSilencio(8_500, 10_000, 3_000)).toBe(1_500);
        });

        it("si la paciencia ya se agotó no espera nada", () => {
            expect(esperaHastaSilencio(1_000, 10_000, 3_000)).toBe(0);
        });

        it("nunca devuelve una espera negativa", () => {
            expect(esperaHastaSilencio(12_000, 10_000, 3_000)).toBe(0);
            expect(esperaHastaSilencio(10_000, 10_000, -5)).toBe(0);
        });
    });
});
