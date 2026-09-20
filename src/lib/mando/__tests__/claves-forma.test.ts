import { describe, expect, it } from "vitest";

import { enmascarar, reconocer } from "@/lib/mando/claves-forma";
import { huellaDe } from "@/lib/mando/claves-forma-servidor";

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
    it("muestra los 4 primeros y 4 últimos en claves de 20 o más", () => {
        const clave = "abcdefghij1234567890abcd";
        const resultado = enmascarar(clave);
        expect(resultado.slice(0, 4)).toBe("abcd");
        expect(resultado.slice(-4)).toBe("abcd");
        expect(resultado.length).toBe(clave.length);
        expect(resultado).toContain("*");
    });

    it("no deja ver el centro de la clave", () => {
        const clave = "sk-or-mi-clave-super-secreta-1234567890";
        const resultado = enmascarar(clave);
        expect(resultado.startsWith("sk-o")).toBe(true);
        expect(resultado.endsWith("7890")).toBe(true);
        expect(resultado.length).toBe(clave.length);
        expect(resultado).not.toContain("super-secreta");
    });

    it("clave de 3 caracteres: solo asteriscos, misma longitud", () => {
        const resultado = enmascarar("abc");
        expect(resultado).toBe("***");
        expect(resultado.length).toBe(3);
    });

    it("clave de 9 caracteres: 2 visibles a cada lado, misma longitud", () => {
        const resultado = enmascarar("abcdefghi");
        expect(resultado.length).toBe(9);
        expect(resultado.startsWith("ab")).toBe(true);
        expect(resultado.endsWith("hi")).toBe(true);
        expect(resultado.slice(2, -2)).toBe("*****");
    });

    it("clave de 19 caracteres: 2 visibles a cada lado, misma longitud", () => {
        const clave = "1234567890123456789";
        const resultado = enmascarar(clave);
        expect(resultado.length).toBe(19);
        expect(resultado.startsWith("12")).toBe(true);
        expect(resultado.endsWith("89")).toBe(true);
        expect(resultado.slice(2, -2)).toBe("*".repeat(15));
    });

    it("clave de 40 caracteres: 4 visibles a cada lado, misma longitud", () => {
        const clave = "sk-or-0123456789abcdef0123456789abcdef12";
        const resultado = enmascarar(clave);
        expect(resultado.length).toBe(40);
        expect(resultado.startsWith("sk-o")).toBe(true);
        expect(resultado.endsWith("ef12")).toBe(true);
        expect(resultado.slice(4, -4)).toBe("*".repeat(32));
    });
});