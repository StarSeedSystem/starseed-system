import { describe, it, expect, beforeEach } from "vitest";
import {
    extension,
    LIMITES,
    inyectarCrypto,
    canonico,
    hashDe,
    nombreDeArchivo,
    construirPaquete,
    type PaqueteIdioma,
    type CryptoProvider,
} from "../formato";

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

describe("formato de paquete de idioma", () => {
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

    it("extension es .starseed-lang.json", () => {
        expect(extension).toBe(".starseed-lang.json");
    });

    it("LIMITES tiene los valores correctos", () => {
        expect(LIMITES.bytes).toBe(2_000_000);
        expect(LIMITES.entradas).toBe(20_000);
        expect(LIMITES.clave).toBe(500);
        expect(LIMITES.valor).toBe(2_000);
    });

    it("canonico produce JSON con claves ordenadas", () => {
        const desordenado: Omit<PaqueteIdioma, "hash"> = {
            ...paqueteBase,
            entradas: { z: "1", a: "2" },
        };
        const canon = canonico(desordenado);
        const parsed = JSON.parse(canon);
        const claves = Object.keys(parsed);
        expect(claves).toEqual([...claves].sort());
    });

    it("hashDe no cambia al reordenar claves del paquete", async () => {
        const p1 = { ...paqueteBase, entradas: { a: "1", b: "2" } };
        const p2 = { ...paqueteBase, entradas: { b: "2", a: "1" } };
        const h1 = await hashDe(p1);
        const h2 = await hashDe(p2);
        expect(h1).toBe(h2);
    });

    it("hashDe cambia al modificar una entrada", async () => {
        const p1 = { ...paqueteBase, entradas: { hola: "hola" } };
        const p2 = { ...paqueteBase, entradas: { hola: "hello" } };
        const h1 = await hashDe(p1);
        const h2 = await hashDe(p2);
        expect(h1).not.toBe(h2);
    });

    it("construirPaquete pone base=es y version=1", async () => {
        const datos = {
            codigo: "fr-FR",
            nombre: "Francés",
            dir: "ltr" as const,
            autor: { nombre: "Autor" },
            licencia: "MIT",
            entradas: { bonjour: "bonjour" },
        };
        const paquete = await construirPaquete(datos);
        expect(paquete.base).toBe("es");
        expect(paquete.version).toBe(1);
        expect(paquete.formato).toBe("starseed-idioma");
    });

    it("construirPaquete fuerza revisado.estado=automatico por defecto", async () => {
        const datos = {
            codigo: "de-DE",
            nombre: "Alemán",
            dir: "ltr" as const,
            autor: { nombre: "Autor" },
            licencia: "MIT",
            entradas: { hallo: "hallo" },
        };
        const paquete = await construirPaquete(datos);
        expect(paquete.revisado.estado).toBe("automatico");
    });

    it("construirPaquete respeta revisado si viene del OS", async () => {
        const datos = {
            codigo: "it-IT",
            nombre: "Italiano",
            dir: "ltr" as const,
            autor: { nombre: "Autor" },
            licencia: "MIT",
            entradas: { ciao: "ciao" },
            revisado: { estado: "revisado" as const, por: "Alex", fecha: "2026-01-01" },
        };
        const paquete = await construirPaquete(datos, true);
        expect(paquete.revisado.estado).toBe("revisado");
        expect(paquete.revisado.por).toBe("Alex");
    });

    it("nombreDeArchivo usa solo [a-z0-9-]", () => {
        const paquete: PaqueteIdioma = {
            ...paqueteBase,
            hash: "abc123",
            codigo: "ES-ES_Tradicional",
        };
        expect(nombreDeArchivo(paquete)).toBe("es-es-tradicional.starseed-lang.json");
    });

    it("nombreDeArchivo maneja códigos con caracteres especiales", () => {
        const paquete: PaqueteIdioma = {
            ...paqueteBase,
            hash: "abc123",
            codigo: "zh-Hans-CN@collation=traditional",
        };
        expect(nombreDeArchivo(paquete)).toBe("zh-hans-cn-collation-traditional.starseed-lang.json");
    });

    it("hashDe lanza error si crypto no inyectado", async () => {
        inyectarCrypto(null as unknown as CryptoProvider);
        await expect(hashDe(paqueteBase)).rejects.toThrow("crypto.subtle no inyectado");
    });
});