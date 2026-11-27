import { describe, expect, it } from "vitest";
import {
    codificarTarjeta,
    decodificarTarjeta,
    verificarTarjeta,
    type TarjetaNeurona,
    type OfertaNeurona,
    type TransporteNeurona,
    VERSION_TARJETA,
    VALIDEZ_SEGUNDOS,
    MAX_TARJETA_BYTES,
} from "@/lib/nfc/tarjeta";

async function crearTarjetaFirmada(base?: Partial<TarjetaNeurona>): Promise<TarjetaNeurona> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error("WebCrypto no disponible");
    const keyPair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const pubRaw = new Uint8Array(await subtle.exportKey("raw", keyPair.publicKey));
    const privKey = keyPair.privateKey;

    const nonce = new Uint8Array(16);
    for (let i = 0; i < 16; i++) nonce[i] = Math.floor(Math.random() * 256);

    const t: TarjetaNeurona = {
        v: VERSION_TARJETA,
        neuronaId: "neurona-abc123",
        identidad: { tipo: "hash", valor: "acct:abc123def456" },
        claveEfimera: pubRaw,
        firma: new Uint8Array(64),
        nonce,
        timestamp: Date.now(),
        ofertas: [
            { tipo: "capacidad", nombre: "archivos", habilitada: true },
            { tipo: "capa", nombre: "conciencia", habilitada: true },
            { tipo: "almacenamiento", nombre: "local", habilitada: true, bytes: 1024 * 1024 * 100 },
            { tipo: "senal", nombre: "ble", habilitada: true },
            { tipo: "internet", nombre: "malla", habilitada: false },
        ],
        transportes: [
            { tipo: "ble", direccion: "aa:bb:cc:dd:ee:ff" },
            { tipo: "wifi-direct", direccion: "192.168.1.100:5000" },
            { tipo: "malla", direccion: "mesh://neurona-abc123" },
        ],
        ...base,
    };

    const datos = datosParaFirmaTest(t);
    const firma = new Uint8Array(await subtle.sign("Ed25519", privKey, datos));
    t.firma = firma;
    return t;
}

function datosParaFirmaTest(t: TarjetaNeurona): Uint8Array {
    const partes: Uint8Array[] = [];
    partes.push(new Uint8Array([t.v]));
    partes.push(new TextEncoder().encode(t.neuronaId));
    if (t.identidad.tipo !== "nada") {
        partes.push(new TextEncoder().encode(t.identidad.valor));
    }
    partes.push(t.claveEfimera);
    partes.push(t.nonce);
    const ts = new Uint8Array(8);
    new DataView(ts.buffer).setBigUint64(0, BigInt(t.timestamp), true);
    partes.push(ts);
    for (const o of t.ofertas) {
        partes.push(new TextEncoder().encode(`${o.tipo}:${o.nombre}:${o.habilitada}:${o.bytes ?? 0}`));
    }
    for (const tr of t.transportes) {
        partes.push(new TextEncoder().encode(`${tr.tipo}:${tr.direccion}`));
    }
    let total = 0;
    for (const p of partes) total += p.length;
    const resultado = new Uint8Array(total);
    let offset = 0;
    for (const p of partes) {
        resultado.set(p, offset);
        offset += p.length;
    }
    return resultado;
}

function tarjetaValidaBase(): TarjetaNeurona {
    return {
        v: VERSION_TARJETA,
        neuronaId: "neurona-abc123",
        identidad: { tipo: "hash", valor: "acct:abc123def456" },
        claveEfimera: new Uint8Array(32).fill(1),
        firma: new Uint8Array(64).fill(2),
        nonce: new Uint8Array(16).fill(3),
        timestamp: Date.now(),
        ofertas: [
            { tipo: "capacidad", nombre: "archivos", habilitada: true },
            { tipo: "capa", nombre: "conciencia", habilitada: true },
            { tipo: "almacenamiento", nombre: "local", habilitada: true, bytes: 1024 * 1024 * 100 },
            { tipo: "senal", nombre: "ble", habilitada: true },
            { tipo: "internet", nombre: "malla", habilitada: false },
        ],
        transportes: [
            { tipo: "ble", direccion: "aa:bb:cc:dd:ee:ff" },
            { tipo: "wifi-direct", direccion: "192.168.1.100:5000" },
            { tipo: "malla", direccion: "mesh://neurona-abc123" },
        ],
    };
}

describe("tarjeta.ts · estructura y tipos", () => {
    it("exporta constantes esperadas", () => {
        expect(VERSION_TARJETA).toBe(1);
        expect(VALIDEZ_SEGUNDOS).toBe(30);
        expect(MAX_TARJETA_BYTES).toBe(1024);
    });

    it("acepta una tarjeta base válida", () => {
        const t = tarjetaValidaBase();
        expect(t.v).toBe(1);
        expect(t.neuronaId).toBe("neurona-abc123");
        expect(t.identidad.tipo).toBe("hash");
        expect(t.claveEfimera.length).toBe(32);
        expect(t.firma.length).toBe(64);
        expect(t.nonce.length).toBe(16);
        expect(t.ofertas.length).toBe(5);
        expect(t.transportes.length).toBe(3);
    });
});

describe("codificarTarjeta / decodificarTarjeta · roundtrip", () => {
    it("codifica y decodifica una tarjeta válida sin perder datos", () => {
        const original = tarjetaValidaBase();
        const bytes = codificarTarjeta(original);
        expect(bytes.length).toBeLessThanOrEqual(MAX_TARJETA_BYTES);
        const decodificada = decodificarTarjeta(bytes);
        expect(decodificada).not.toBeNull();
        expect(decodificada!.v).toBe(original.v);
        expect(decodificada!.neuronaId).toBe(original.neuronaId);
        expect(decodificada!.identidad).toEqual(original.identidad);
        expect(Array.from(decodificada!.claveEfimera)).toEqual(Array.from(original.claveEfimera));
        expect(Array.from(decodificada!.firma)).toEqual(Array.from(original.firma));
        expect(Array.from(decodificada!.nonce)).toEqual(Array.from(original.nonce));
        expect(decodificada!.timestamp).toBe(original.timestamp);
        expect(decodificada!.ofertas).toEqual(original.ofertas);
        expect(decodificada!.transportes).toEqual(original.transportes);
    });

    it("rechaza bytes vacíos", () => {
        expect(decodificarTarjeta(new Uint8Array(0))).toBeNull();
    });

    it("rechaza bytes que no son una tarjeta válida", () => {
        const basura = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
        expect(decodificarTarjeta(basura)).toBeNull();
    });

    it("rechaza tarjeta con versión desconocida", () => {
        const t = tarjetaValidaBase();
        t.v = 99;
        const bytes = codificarTarjeta(t);
        expect(decodificarTarjeta(bytes)).toBeNull();
    });

    it("rechaza tarjeta que supera MAX_TARJETA_BYTES", () => {
        const t = tarjetaValidaBase();
        t.ofertas = Array.from({ length: 50 }, (_, i) => ({
            tipo: "capacidad" as const,
            nombre: `cap-${i}`,
            habilitada: true,
        }));
        const bytes = codificarTarjeta(t);
        if (bytes.length > MAX_TARJETA_BYTES) {
            expect(decodificarTarjeta(bytes)).toBeNull();
        }
    });
});

describe("verificarTarjeta · firma, caducidad, nonce", () => {
    it("rechaza tarjeta con firma inválida", async () => {
        const t = await crearTarjetaFirmada();
        t.firma = new Uint8Array(64).fill(0);
        const bytes = codificarTarjeta(t);
        const res = await verificarTarjeta(bytes, new Set());
        expect(res.ok).toBe(false);
        expect(res.motivo).toBe("firma");
    });

    it("rechaza tarjeta caducada (> 30s)", async () => {
        const t = await crearTarjetaFirmada({ timestamp: Date.now() - 60_000 });
        const bytes = codificarTarjeta(t);
        const res = await verificarTarjeta(bytes, new Set());
        expect(res.ok).toBe(false);
        expect(res.motivo).toBe("caducada");
    });

    it("rechaza tarjeta del futuro (> 30s)", async () => {
        const t = await crearTarjetaFirmada({ timestamp: Date.now() + 60_000 });
        const bytes = codificarTarjeta(t);
        const res = await verificarTarjeta(bytes, new Set());
        expect(res.ok).toBe(false);
        expect(res.motivo).toBe("caducada");
    });

    it("rechaza nonce repetido", async () => {
        const t = await crearTarjetaFirmada();
        const bytes = codificarTarjeta(t);
        const noncesVistos = new Set<string>();
        noncesVistos.add(Array.from(t.nonce).join(","));
        const res = await verificarTarjeta(bytes, noncesVistos);
        expect(res.ok).toBe(false);
        expect(res.motivo).toBe("nonce_repetido");
    });

    it("acepta tarjeta válida con nonce nuevo", async () => {
        const t = await crearTarjetaFirmada();
        const bytes = codificarTarjeta(t);
        const res = await verificarTarjeta(bytes, new Set());
        expect(res.ok).toBe(true);
        expect(res.tarjeta).not.toBeNull();
        expect(res.tarjeta!.neuronaId).toBe(t.neuronaId);
    });

    it("rechaza bytes que no decodifican a tarjeta", async () => {
        const basura = new Uint8Array([1, 2, 3, 4]);
        const res = await verificarTarjeta(basura, new Set());
        expect(res.ok).toBe(false);
        expect(res.motivo).toBe("formato");
    });
});

describe("identidad según privacidad", () => {
    it("permite tipo 'hash'", () => {
        const t = tarjetaValidaBase();
        t.identidad = { tipo: "hash", valor: "acct:abc123" };
        expect(() => codificarTarjeta(t)).not.toThrow();
    });

    it("permite tipo 'alias'", () => {
        const t = tarjetaValidaBase();
        t.identidad = { tipo: "alias", valor: "maggasukha" };
        expect(() => codificarTarjeta(t)).not.toThrow();
    });

    it("permite tipo 'nada'", () => {
        const t = tarjetaValidaBase();
        t.identidad = { tipo: "nada" };
        expect(() => codificarTarjeta(t)).not.toThrow();
    });

    it("roundtrip conserva el tipo de identidad", () => {
        for (const identidad of [
            { tipo: "hash" as const, valor: "acct:abc123" },
            { tipo: "alias" as const, valor: "maggasukha" },
            { tipo: "nada" as const },
        ]) {
            const t = tarjetaValidaBase();
            t.identidad = identidad;
            const bytes = codificarTarjeta(t);
            const d = decodificarTarjeta(bytes);
            expect(d!.identidad).toEqual(identidad);
        }
    });
});

describe("ofertas y transportes", () => {
    it("acepta todos los tipos de oferta definidos", () => {
        const t = tarjetaValidaBase();
        t.ofertas = [
            { tipo: "capacidad", nombre: "archivos", habilitada: true },
            { tipo: "capa", nombre: "conciencia", habilitada: true },
            { tipo: "almacenamiento", nombre: "local", habilitada: true, bytes: 1000 },
            { tipo: "senal", nombre: "ble", habilitada: true },
            { tipo: "internet", nombre: "malla", habilitada: false },
        ];
        const bytes = codificarTarjeta(t);
        const d = decodificarTarjeta(bytes);
        expect(d!.ofertas).toEqual(t.ofertas);
    });

    it("acepta todos los tipos de transporte definidos", () => {
        const t = tarjetaValidaBase();
        t.transportes = [
            { tipo: "ble", direccion: "aa:bb:cc:dd:ee:ff" },
            { tipo: "wifi-direct", direccion: "192.168.1.100:5000" },
            { tipo: "malla", direccion: "mesh://neurona-abc123" },
        ];
        const bytes = codificarTarjeta(t);
        const d = decodificarTarjeta(bytes);
        expect(d!.transportes).toEqual(t.transportes);
    });
});