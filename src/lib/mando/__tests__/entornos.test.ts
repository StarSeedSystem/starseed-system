import { describe, it, expect } from "vitest";

import { serviciosConocidos } from "../entornos";

describe("serviciosConocidos · nombres de imaginación", () => {
    it("la nota de Hermes habla de imaginación diaria con su horario", () => {
        const hermes = serviciosConocidos().find((s) => s.id === "agente-hermes");
        expect(hermes).toBeDefined();
        expect(hermes?.nota).toContain("Imaginación diaria");
        expect(hermes?.nota).toContain("07:00 o según su horario");
    });
});
