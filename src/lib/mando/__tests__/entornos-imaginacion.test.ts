/**
 * Entornos de Genesis · textos de «Imaginación» (Ola 1021I · IMN1021K3 parte 3).
 *
 * §2 de `architecture/imaginacion-autodesarrollo.md`: todo texto que lee una
 * persona dice «Imaginación»; los identificadores no cambian. Aquí solo se
 * comprueba la nota de Hermes que antes decía «Dream diario 07:00».
 */
import { describe, it, expect } from "vitest";
import { serviciosConocidos } from "../entornos";

describe("serviciosConocidos · textos de imaginación", () => {
    it("la nota de Hermes dice «Imaginación diaria» con su horario", () => {
        const hermes = serviciosConocidos().find((s) => s.id === "agente-hermes");
        expect(hermes).toBeDefined();
        expect(hermes?.nota).toContain("Imaginación diaria");
        expect(hermes?.nota).toContain("07:00 o según su horario");
    });

    it("ninguna nota conserva el nombre viejo «Dream diario»", () => {
        for (const servicio of serviciosConocidos()) {
            expect(servicio.nota).not.toContain("Dream diario");
            expect(servicio.nota).not.toContain("Sueño profundo");
        }
    });
});
