import { describe, expect, it } from "vitest";
import { presupuestoOidoMs } from "../vibeasr-local";

/**
 * Pruebas del presupuesto de reconocimiento del oído (2026-09-06, Ola 255).
 * La fórmula es la misma que el daemon (`asrTimeoutMs`): 60 s de base más 20 s
 * por segundo de audio, acotado a [120 s, 360 s]; NaN o negativo → 180 s.
 */
describe("presupuestoOidoMs", () => {
    it("0 segundos → suelo mínimo de 120 s", () => {
        expect(presupuestoOidoMs(0)).toBe(120_000);
    });

    it("6,3 segundos → 186 s", () => {
        expect(presupuestoOidoMs(6.3)).toBe(186_000);
    });

    it("30 segundos → tope máximo de 360 s", () => {
        expect(presupuestoOidoMs(30)).toBe(360_000);
    });

    it("NaN → valor por defecto de 180 s", () => {
        expect(presupuestoOidoMs(Number.NaN)).toBe(180_000);
    });

    it("-1 → valor por defecto de 180 s", () => {
        expect(presupuestoOidoMs(-1)).toBe(180_000);
    });
});