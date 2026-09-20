import { describe, expect, it } from "vitest";

import { enmascarar, huellaDe, reconocer } from "@/lib/mando/claves-forma";

describe("reconocer", () => {
    it("reconoce GROQ por prefijo gsk_", () => {
        const r = reconocer("gsk_test123abc");
        expect(r.proveedor).toBe("groq");
        expect(r.variable).toBe("GROQ_API_KEY");
        expect(r.confianza).toBe("alta");
    });

    it("reconoce xAI por prefijo xai-", () => {
        const r = reconocer("xai-mykey123456");
        expect(r.proveedor).toBe("xai");
        expect(r.variable).toBe("XAI_API_KEY");
        expect(r.confianza).toBe("alta");
    });

    it("reconoce NVIDIA por prefijo nvapi-", () => {
        const r = reconocer("nvapi-1234567890ab");
        expect(r.proveedor).toBe("nvidia");
        expect(r.variable).toBe("NVIDIA_API_KEY");
        expect(r.confianza).toBe("alta");
    });

    it("reconoce OpenRouter por prefijo sk-or-", () => {
        const r = reconocer("sk-or-abc123xyz789");
        expect(r.proveedor).toBe("openrouter");
        expect(r.variable).toBe("OPENROUTER_API_KEY");
        expect(r.confianza).toBe("alta");
    });

    it("da confianza media para sk- que no coincide con otros prefijos", () => {
        const r = reconocer("sk-deepseek-test123");
        expect(r.proveedor).toBe("otro");
        expect(r.variable).toBe("API_KEY");
        expect(r.confianza).toBe("media");
    });

    it("clase una clave irreconocible con ninguna confianza", () => {
        const r = reconocer("api-key-xyz-12345");
        expect(r.proveedor).toBe("desconocido");
        expect(r.variable).toBe("API_KEY");
        expect(r.confianza).toBe("ninguna");
    });
});

describe("reconocer · cadena vacía", () => {
    it("clase una cadena vacía como desconocida", () => {
        const r = reconocer("");
        expect(r.proveedor).toBe("desconocido");
        expect(r.confianza).toBe("ninguna");
    });
});

describe("huellaDe", () => {
    it("devuelve los primeros 12 caracteres del sha256", () => {
        const huella = huellaDe("mi-clave-secreta-12345");
        expect(huella).toHaveLength(12);
        expect(/^[0-9a-f]{12}$/.test(huella)).toBe(true);
    });

    it("da siempre 12 caracteres hexadecimales", () => {
        const h1 = huellaDe("clave1");
        const h2 = huellaDe("clave2");
        expect(/^[0-9a-f]{12}$/.test(h1)).toBe(true);
        expect(/^[0-9a-f]{12}$/.test(h2)).toBe(true);
    });

    it("la misma clave da la misma huella", () => {
        const clave = "test-12345678901234";
        const h1 = huellaDe(clave);
        const h2 = huellaDe(clave);
        expect(h1).toBe(h2);
    });
});

describe("enmascarar", () => {
    it("muestra los 4 primeros y 4 últimos caracteres", () => {
        const resultado = enmascarar("abcdefghij123456");
        expect(resultado.slice(0, 4)).toBe("abcd");
        expect(resultado.slice(-4)).toBe("3456");
        expect(resultado).toContain("*");
    });

    it("no deja ver el centro de la clave", () => {
        const clave = "sk-or-mi-clave-super-secreta-1234567890";
        const resultado = enmascarar(clave);
        expect(resultado.startsWith("sk-o")).toBe(true);
        expect(resultado.endsWith("890")).toBe(true);
        const puntos = resultado.match(/\*+/g);
        expect(puntos).toBeTruthy();
    });

    it("máscara el centro de la clave sin revelar el contenido", () => {
        const clave = "gsk-mi-clave-super-secreta-1234567890";
        const resultado = enmascarar(clave);
        expect(resultado.startsWith("gsk-")).toBe(true);
        expect(resultado.endsWith("890")).toBe(true);
        const puntos = resultado.match(/\*+/g);
        expect(puntos).toBeTruthy();
        expect(resultado.length - 8).toBe(puntos![0].length);
    });
});