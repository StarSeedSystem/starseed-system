import { describe, expect, it, beforeAll } from "vitest";
import {
    codificarTarjeta,
    decodificarTarjeta,
    verificarTarjeta,
    crearTarjetaNeurona,
    generarClaveEfimera,
    type TarjetaNeurona,
    type OfertaNeurona,
    type TransporteNeurona,
} from "@/lib/nfc/tarjeta";
import { ed25519 } from "@noble/curves/ed25519";

const CLAVE_PRIVADA_PRUEBA = ed25519.utils.randomPrivateKey();
const CLAVE_PUBLICA_PRUEBA = ed25519.getPublicKey(CLAVE_PRIVADA_PRUEBA);
const { privada: CLAVE_EFIMERA_PRIVADA, publica: CLAVE_EFIMERA_PUBLICA } = generarClaveEfimera();

const OFERTAS_PRUEBA: OfertaNeurona[] = [
    { tipo: "capacidad", valor: "almacenamiento", datos: { gb: 100 } },
    { tipo: "capa", valor: "conciencia", datos: { id: "capa-1" } },
    { tipo: "senal", valor: "internet", datos: { tipo: "mesh" } },
];

const TRANSPORTES_PRUEBA: TransporteNeurona[] = [
    { tipo: "ble", direccion: "aa:bb:cc:dd:ee:ff" },
    { tipo: "wifi-direct", direccion: "192.168.1.100" },
    { tipo: "malla", direccion: "mesh-node-1" },
];

describe("tarjeta.ts · codificar/decodificar", () => {
    it("codifica y decodifica una tarjeta válida round-trip", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-abc123",
            identidadCuenta: { tipo: "hash", valor: "hash-cuenta-xyz" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16).fill(5),
            timestamp: Date.now(),
            ofertas: OFERTAS_PRUEBA,
            transportes: TRANSPORTES_PRUEBA,
        }, CLAVE_PRIVADA_PRUEBA);

        const bytes = codificarTarjeta(tarjeta);
        expect(bytes.length).toBeLessThanOrEqual(1024);

        const decodificada = decodificarTarjeta(bytes);
        expect(decodificada.version).toBe(1);
        expect(decodificada.neuronaId).toBe("neurona-abc123");
        expect(decodificada.identidadCuenta).toEqual({ tipo: "hash", valor: "hash-cuenta-xyz" });
        expect(decodificada.claveEfimeraPublica).toEqual(CLAVE_EFIMERA_PUBLICA);
        expect(decodificada.ofertas).toEqual(OFERTAS_PRUEBA);
        expect(decodificada.transportes).toEqual(TRANSPORTES_PRUEBA);
    });

    it("rechaza bytes que no son NDEF válido", () => {
        expect(() => decodificarTarjeta(new Uint8Array([0x00, 0x01, 0x02]))).toThrow(/NDEF/);
    });

    it("rechaza tarjeta con versión desconocida", () => {
        const tarjetaInvalida = {
            version: 999,
            neuronaId: "x",
            identidadCuenta: { tipo: "nada" as const },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            firma: new Uint8Array(64),
            nonce: new Uint8Array(16),
            timestamp: Date.now(),
            ofertas: [],
            transportes: [],
        };
        const bytes = codificarTarjeta(tarjetaInvalida as any);
        expect(() => decodificarTarjeta(bytes)).toThrow(/Versión/);
    });
});

describe("tarjeta.ts · verificarTarjeta", () => {
    it("acepta una tarjeta firmada correctamente y vigente", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-abc123",
            identidadCuenta: { tipo: "hash", valor: "hash-cuenta-xyz" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16).fill(5),
            timestamp: Date.now(),
            ofertas: OFERTAS_PRUEBA,
            transportes: TRANSPORTES_PRUEBA,
        }, CLAVE_PRIVADA_PRUEBA);

        const resultado = verificarTarjeta(tarjeta, CLAVE_PUBLICA_PRUEBA, new Set());
        expect(resultado.ok).toBe(true);
    });

    it("rechaza tarjeta con firma inválida", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-abc123",
            identidadCuenta: { tipo: "hash", valor: "hash-cuenta-xyz" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16).fill(5),
            timestamp: Date.now(),
            ofertas: OFERTAS_PRUEBA,
            transportes: TRANSPORTES_PRUEBA,
        }, CLAVE_PRIVADA_PRUEBA);

        const clavePublicaIncorrecta = ed25519.utils.randomPrivateKey();
        const resultado = verificarTarjeta(tarjeta, ed25519.getPublicKey(clavePublicaIncorrecta), new Set());
        expect(resultado.ok).toBe(false);
        expect(resultado.error).toMatch(/Firma/);
    });

    it("rechaza tarjeta caducada (>30s)", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-abc123",
            identidadCuenta: { tipo: "hash", valor: "hash-cuenta-xyz" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16).fill(5),
            timestamp: Date.now() - 60_000,
            ofertas: OFERTAS_PRUEBA,
            transportes: TRANSPORTES_PRUEBA,
        }, CLAVE_PRIVADA_PRUEBA);

        const resultado = verificarTarjeta(tarjeta, CLAVE_PUBLICA_PRUEBA, new Set());
        expect(resultado.ok).toBe(false);
        expect(resultado.error).toMatch(/caducad|expir/);
    });

    it("rechaza nonce repetido", () => {
        const nonce = new Uint8Array(16).fill(7);
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-abc123",
            identidadCuenta: { tipo: "hash", valor: "hash-cuenta-xyz" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce,
            timestamp: Date.now(),
            ofertas: OFERTAS_PRUEBA,
            transportes: TRANSPORTES_PRUEBA,
        }, CLAVE_PRIVADA_PRUEBA);

        const noncesVistos = new Set<string>();
        noncesVistos.add(Buffer.from(nonce).toString("hex"));

        const resultado = verificarTarjeta(tarjeta, CLAVE_PUBLICA_PRUEBA, noncesVistos);
        expect(resultado.ok).toBe(false);
        expect(resultado.error).toMatch(/nonce|repet/);
    });

    it("registra nonce nuevo tras verificación exitosa", () => {
        const nonce = new Uint8Array(16).fill(8);
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-abc123",
            identidadCuenta: { tipo: "hash", valor: "hash-cuenta-xyz" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce,
            timestamp: Date.now(),
            ofertas: OFERTAS_PRUEBA,
            transportes: TRANSPORTES_PRUEBA,
        }, CLAVE_PRIVADA_PRUEBA);

        const noncesVistos = new Set<string>();
        const resultado = verificarTarjeta(tarjeta, CLAVE_PUBLICA_PRUEBA, noncesVistos);
        expect(resultado.ok).toBe(true);
        expect(noncesVistos.has(Buffer.from(nonce).toString("hex"))).toBe(true);
    });
});

describe("tarjeta.ts · identidad de cuenta según privacidad", () => {
    it("permite tipo 'hash'", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-1",
            identidadCuenta: { tipo: "hash", valor: "abc123" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16),
            timestamp: Date.now(),
            ofertas: [],
            transportes: [],
        }, CLAVE_PRIVADA_PRUEBA);
        expect(tarjeta.identidadCuenta.tipo).toBe("hash");
    });

    it("permite tipo 'alias'", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-1",
            identidadCuenta: { tipo: "alias", valor: "mi-alias" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16),
            timestamp: Date.now(),
            ofertas: [],
            transportes: [],
        }, CLAVE_PRIVADA_PRUEBA);
        expect(tarjeta.identidadCuenta.tipo).toBe("alias");
    });

    it("permite tipo 'nada'", () => {
        const tarjeta = crearTarjetaNeurona({
            version: 1,
            neuronaId: "neurona-1",
            identidadCuenta: { tipo: "nada" },
            claveEfimeraPublica: CLAVE_EFIMERA_PUBLICA,
            nonce: new Uint8Array(16),
            timestamp: Date.now(),
            ofertas: [],
            transportes: [],
        }, CLAVE_PRIVADA_PRUEBA);
        expect(tarjeta.identidadCuenta.tipo).toBe("nada");
    });
});