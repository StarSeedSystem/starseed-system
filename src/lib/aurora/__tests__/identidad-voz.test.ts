import { describe, expect, it } from "vitest";
import { vozDePersona } from "@/lib/aurora/voz-rt";
import { identidadVoz } from "@/lib/aurora/identidad-voz";

describe("vozDePersona", () => {
    it("cada personalidad suena siempre igual", () => {
        expect(vozDePersona("astraura")).toBe("F1");
        expect(vozDePersona("Hermes")).toBe("M2");
        expect(vozDePersona("desconocida")).toBe("F1");
    });
});

describe("identidadVoz", () => {
    it("resuelve la identidad con precedencia: agente > personalidad > cerebro > neurona > cuenta", () => {
        // Agente
        let id = identidadVoz({ agente: "AgenteX" });
        expect(id.origen).toBe("agent");
        expect(id.vozRT).toBe("F1");

        // Personalidad
        id = identidadVoz({ personalidad: "Astraura" });
        expect(id.origen).toBe("personality");
        expect(id.vozRT).toBe("F1");

        // Cerebro
        id = identidadVoz({ cerebro: "CerebroAlpha" });
        expect(id.origen).toBe("brain");
        expect(id.vozRT).toBe("F2");

        // Neurona
        id = identidadVoz({ neurona: "Neuron7" });
        expect(id.origen).toBe("neuron");
        expect(id.vozRT).toBe("M1");

        // Cuenta
        id = identidadVoz({ cuenta: "User123" });
        expect(id.origen).toBe("account");
        expect(id.vozRT).toBe("F1");
    });

    it("usa valor por defecto sin parámetros", () => {
        const id = identidadVoz();
        expect(id.origen).toBe("default");
        expect(id.vozRT).toBe("F1");
    });

    it("VOZ_POR_PERSONA incluye personalidades conocidas", () => {
        const personalidades = ["astraura", "Hermes", "AstrauraPrime", "Atenea", "Hermione", "Mnemosyne", "Kallisti", "Hefaestus", "Logos", "Oneiros"];
        personalidades.forEach(persona => {
            const id = identidadVoz({ personalidad: persona });
            expect(id.origen).toBe("personality");
            expect(typeof id.vozRT).toBe("string");
            expect(id.vozRT).toMatch(/^[FM][1-5]$/);
        });
    });
});
