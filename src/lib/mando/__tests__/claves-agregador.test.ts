import { describe, expect, it } from "vitest";
import {
    identificarClaveEntrante,
    variablePermitida,
} from "@/lib/mando/claves-agregador";

describe("claves-agregador", () => {
    describe("identificarClaveEntrante", () => {
        it("identifica una clave gsk_... como groq", () => {
            const res = identificarClaveEntrante("gsk_1234567890abcdef12345678");
            expect(res.proveedor).toBe("groq");
            expect(res.variable).toBe("GROQ_API_KEY");
            expect(res.confianza).toBe("alta");
            expect(res.huella).toHaveLength(12);
            expect(res.mascara).toBe("gsk_********************5678");
        });

        it("permite especificar variableManual válida asignando el proveedor del catálogo", () => {
            const res = identificarClaveEntrante("sk-12345678901234567890", "OPENAI_API_KEY");
            expect(res.proveedor).toBe("openai");
            expect(res.variable).toBe("OPENAI_API_KEY");
            expect(res.confianza).toBe("alta");
        });

        it("ignora variableManual no permitida", () => {
            const res = identificarClaveEntrante("gsk_1234567890abcdef", "PATH");
            expect(res.variable).toBe("GROQ_API_KEY");
            expect(res.proveedor).toBe("groq");
        });
    });

    describe("variablePermitida", () => {
        it("acepta variables del catálogo como GROQ_API_KEY", () => {
            expect(variablePermitida("GROQ_API_KEY")).toBe(true);
            expect(variablePermitida("OPENAI_API_KEY")).toBe(true);
            expect(variablePermitida("ANTHROPIC_API_KEY")).toBe(true);
        });

        it("rechaza variables del sistema o arbitrarias", () => {
            expect(variablePermitida("PATH")).toBe(false);
            expect(variablePermitida("; rm -rf /")).toBe(false);
            expect(variablePermitida("CUALQUIERA_API_KEY")).toBe(false);
            expect(variablePermitida("")).toBe(false);
        });

        it("acepta variables de pasarela STARSEED_PASARELA_NIM_URL", () => {
            expect(variablePermitida("STARSEED_PASARELA_NIM_URL")).toBe(true);
            expect(variablePermitida("STARSEED_PASARELA_OPENAI_KEY")).toBe(true);
        });
    });
});
