/**
 * Tests de `variablesDeProveedor` y `pasarelasDeclaradas` (Ola 286 · F4):
 * cómo el Mando reconoce las claves de TODOS los proveedores del catálogo y las
 * pasarelas declaradas por entorno. Solo funciones PURAS; jamás valores de claves.
 */
import { describe, expect, it } from "vitest";
import { pasarelasDeclaradas, variablesDeProveedor } from "../mando/modelos-disponibles";

describe("variablesDeProveedor (Ola 286 · F4)", () => {
    it("incluye las variables del catálogo del proveedor", () => {
        const resultado = variablesDeProveedor("groq", ["GROQ_API_KEY"]);
        expect(resultado).toContain("GROQ_API_KEY");
    });

    it("fusiona los alias que el catálogo no tenga y no duplica", () => {
        // El catálogo de nim solo trae NVIDIA_API_KEY; el alias añade NVIDIA_SHARED_KEY.
        const resultado = variablesDeProveedor("nim", ["NVIDIA_API_KEY"]);
        expect(resultado).toContain("NVIDIA_API_KEY");
        expect(resultado).toContain("NVIDIA_SHARED_KEY");
        // Ninguna variable repetida en la unión.
        const unicos = new Set(resultado);
        expect(unicos.size).toBe(resultado.length);
    });

    it("no repite variables que ya vienen del catálogo", () => {
        const resultado = variablesDeProveedor("nim", ["NVIDIA_API_KEY", "NVIDIA_SHARED_KEY"]);
        expect(resultado.filter((v) => v === "NVIDIA_SHARED_KEY")).toHaveLength(1);
    });
});

describe("pasarelasDeclaradas (Ola 286 · F4)", () => {
    it("detecta una pasarela por su URL y lee clave, modelos y rpm", () => {
        const pasarela = pasarelasDeclaradas({
            STARSEED_PASARELA_GROQ_URL: "https://api.groq.com/openai/v1",
            STARSEED_PASARELA_GROQ_KEY: "x",
            STARSEED_PASARELA_GROQ_MODELOS: "a,b",
            STARSEED_PASARELA_GROQ_RPM: "30",
        });
        expect(pasarela).toHaveLength(1);
        expect(pasarela[0].id).toBe("groq");
        expect(pasarela[0].variable).toBe("STARSEED_PASARELA_GROQ_KEY");
        expect(pasarela[0].url).toBe("https://api.groq.com/openai/v1");
        expect(pasarela[0].modelos).toEqual(["a", "b"]);
        expect(pasarela[0].rpm).toBe(30);
    });

    it("nunca expone el valor de la clave en la salida", () => {
        const valorSecreto = "sk-valor-secreto-de-prueba";
        const pasarela = pasarelasDeclaradas({
            STARSEED_PASARELA_GROQ_URL: "https://api.groq.com/openai/v1",
            STARSEED_PASARELA_GROQ_KEY: valorSecreto,
        });
        const enJson = JSON.stringify(pasarela);
        expect(enJson).not.toContain(valorSecreto);
    });

    it("normaliza la URL sin barra final y aplica rpm por defecto a 15", () => {
        const pasarela = pasarelasDeclaradas({
            STARSEED_PASARELA_NAVY_URL: "https://api.navy.ai/v1/",
        });
        expect(pasarela).toHaveLength(1);
        expect(pasarela[0].id).toBe("navy");
        expect(pasarela[0].url).toBe("https://api.navy.ai/v1");
        expect(pasarela[0].modelos).toEqual([]);
        expect(pasarela[0].rpm).toBe(15);
    });
});