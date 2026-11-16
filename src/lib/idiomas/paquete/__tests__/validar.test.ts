import { describe, it, expect, beforeEach, vi } from "vitest";
import { validarPaquete } from "../validar";
import { inyectarCrypto, hashDe, type PaqueteIdioma, type CryptoProvider } from "../formato";
import { LIMITES } from "../formato";

const cryptoMock: CryptoProvider = {
    subtle: {
        async digest(_algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer> {
            const view = new Uint8Array(data);
            let hash = 0;
            for (let i = 0; i < view.length; i++) {
                hash = (hash * 31 + view[i]) >>> 0;
            }
            const buffer = new ArrayBuffer(32);
            const out = new Uint8Array(buffer);
            for (let i = 0; i < 32; i++) {
                out[i] = (hash >> (i % 8)) & 0xff;
            }
            return buffer;
        },
    },
};

beforeEach(() => {
    inyectarCrypto(cryptoMock);
});

const paqueteBase: Omit<PaqueteIdioma, "hash"> = {
    formato: "starseed-idioma",
    version: 1,
    codigo: "es-ES",
    nombre: "Español",
    nombreIngles: "Spanish",
    dir: "ltr",
    autor: { nombre: "Test Autor" },
    creado: "2026-01-01T00:00:00.000Z",
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas: {
        hola: "hola",
        mundo: "mundo",
    },
};

describe("validarPaquete", () => {
    it("rechaza entrada que no es objeto", async () => {
        const r = await validarPaquete(null);
        expect(r.ok).toBe(false);
        expect(r.errores).toContain("El paquete no es un objeto válido.");
    });

    it("rechaza array", async () => {
        const r = await validarPaquete([]);
        expect(r.ok).toBe(false);
    });

    it("rechaza string", async () => {
        const r = await validarPaquete("texto");
        expect(r.ok).toBe(false);
    });

    it("rechaza número", async () => {
        const r = await validarPaquete(123);
        expect(r.ok).toBe(false);
    });

    it("acepta paquete válido mínimo", async () => {
        const hash = await hashDe(paqueteBase);
        const paquete = { ...paqueteBase, hash };
        const r = await validarPaquete(paquete);
        expect(r.ok).toBe(true);
    });
});