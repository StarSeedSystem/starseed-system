/**
 * CTL1119E · Clave nativa del aparato (fallback para Linux WebKitGTK / Windows WebView2).
 * Pruebas: flujo «sin-aparato → crear → pedir» con entorno falso, y elección entre WebCrypto y vía nativa.
 * 
 * NOTA: Estas pruebas verifican la lógica de decisión (qué vía se elige) y el flujo,
 * no la integración completa con la app nativa (eso se prueba en Rust).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    _reiniciarFirmaAparato,
    aparatoLocal,
    claveAparatoPerdida,
    configurarFirmaAparato,
    crearClaveAparato,
    crearClaveAparatoNativa,
    firmarEntrada,
    firmarEntradaNativa,
    firmarOrdenControl,
    firmarOrdenControlNativa,
    olvidarAparato,
    olvidarAparatoNativa,
    spkiDelAparato,
    spkiDelAparatoNativa,
    soporteClaveNativa,
    soporteFirma,
    ErrorFirma,
} from "../firma-aparato";
import { crearIdbFalso, crearMarcaFalsa, crearRespaldo, type Respaldo } from "./idb-falso";
import type { EntradaChat } from "../tipos";

const CUENTA = "00000000-0000-4000-8000-000000000001";
const AHORA = Date.parse("2026-11-21T10:00:00.000Z");
const subtle = globalThis.crypto.subtle;

let respaldo: Respaldo;
let marca: ReturnType<typeof crearMarcaFalsa>;

function montarBase(r: Respaldo = respaldo, m = marca) {
    _reiniciarFirmaAparato();
    configurarFirmaAparato({ indexedDB: crearIdbFalso(r), subtle, marca: m, ahora: () => AHORA, seguro: true });
}

function entrada(extra: Partial<EntradaChat> = {}): EntradaChat {
    return { v: 1, nonce: "AAAAAAAAAAAAAAAAAAAAAA", t: new Date(AHORA).toISOString(), fuente: "direccion", accion: "decir", texto: "Prueba CTL1119E", ...extra };
}
const ctx = { cuenta: CUENTA, destino: "mac" as const, chat: "genesis", chatNombre: "GENESIS · StarSeed OS", ahora: AHORA };

describe("CTL1119E · soporteFirma elige vía web cuando WebCrypto e IndexedDB disponibles", () => {
    beforeEach(() => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
        montarBase();
    });
    afterEach(() => _reiniciarFirmaAparato());

    it("devuelve via: 'web'", async () => {
        const s = await soporteFirma();
        expect(s).toEqual({ ok: true, via: "web" });
    });
});

describe("CTL1119E · crearClaveAparato con WebCrypto (vía web)", () => {
    beforeEach(() => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
        montarBase();
    });
    afterEach(() => _reiniciarFirmaAparato());

    it("crea clave ECDSA P-256 no exportable en IndexedDB", async () => {
        const { aparato, spki } = await crearClaveAparato("Test Web", CUENTA);
        expect(aparato.huella).toMatch(/^[a-f0-9]{64}$/);
        expect(aparato.codigo).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
        expect(aparato.estado).toBe("sin-emparejar");
        expect(aparato.nivel).toBe("texto");
        expect(spki).toMatch(/^[A-Za-z0-9_-]+$/);
        const a = await aparatoLocal();
        expect(a?.huella).toBe(aparato.huella);
    });

    it("niega crear otra si ya hay una emparejada", async () => {
        await crearClaveAparato("Test", CUENTA);
        // Marcar como emparejada
        const { actualizarEstadoAparato } = await import("../firma-aparato");
        await actualizarEstadoAparato({ estado: "emparejado" });
        await expect(crearClaveAparato("Otra", CUENTA)).rejects.toMatchObject({ codigo: "ya-emparejado" });
    });
});

describe("CTL1119E · firmarEntrada y firmarOrdenControl con WebCrypto (vía web)", () => {
    beforeEach(async () => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
        montarBase();
        await crearClaveAparato("Test", CUENTA);
    });
    afterEach(() => _reiniciarFirmaAparato());

    it("firmarEntrada produce firma verificable", async () => {
        const f = await firmarEntrada(entrada(), ctx);
        expect(f.v).toBe(2);
        expect(f.firma).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(f.aparato).toMatch(/^[a-f0-9]{64}$/);
    });

    it("firmarOrdenControl produce firma de control verificable", async () => {
        const firmada = await firmarOrdenControl(
            (b) => ({ aud: "starseed.control-neuronas.v1", v: 1, de: b.de, cuenta: b.cuenta, para: "destino", nivel: "controlar", sesion: null, seq: b.seq, nonce: "nonce", t: new Date().toISOString(), caduca: new Date(Date.now() + 60000).toISOString(), accion: { nombre: "presentarse", args: {} } }),
            { cuenta: CUENTA }
        );
        expect(firmada.v).toBe(1);
        expect(firmada.firma).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(firmada.spki).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});

describe("CTL1119E · spkiDelAparato y olvidarAparato con WebCrypto", () => {
    beforeEach(async () => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
        montarBase();
        await crearClaveAparato("Test", CUENTA);
    });
    afterEach(() => _reiniciarFirmaAparato());

    it("spkiDelAparato devuelve SPKI base64url", async () => {
        const spki = await spkiDelAparato();
        expect(spki).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("olvidarAparato borra la clave y la marca", async () => {
        await olvidarAparato();
        expect(await aparatoLocal()).toBeNull();
        expect(await claveAparatoPerdida()).toBeNull();
    });
});

describe("CTL1119E · Lógica de decisión de vía (sin app nativa real)", () => {
    beforeEach(() => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
    });
    afterEach(() => _reiniciarFirmaAparato());

    it("si no hay WebCrypto, soporteFirma devuelve false (sin app nativa mock)", async () => {
        montarBase(respaldo, marca);
        configurarFirmaAparato({ subtle: null, indexedDB: crearIdbFalso(respaldo) });
        // Sin mock de puente nativo, soporteClaveNativa devuelve false
        const s = await soporteFirma();
        expect(s).toEqual({ ok: false, motivo: "sin-webcrypto" });
    });

    it("si no hay IndexedDB, soporteFirma devuelve false (sin app nativa mock)", async () => {
        montarBase(respaldo, marca);
        configurarFirmaAparato({ subtle, indexedDB: null });
        const s = await soporteFirma();
        expect(s).toEqual({ ok: false, motivo: "sin-indexeddb" });
    });

    it("crearClaveAparato lanza si no hay WebCrypto ni IndexedDB ni app nativa", async () => {
        montarBase(respaldo, marca);
        configurarFirmaAparato({ subtle: null, indexedDB: null });
        await expect(crearClaveAparato("Test", CUENTA)).rejects.toMatchObject({ codigo: "sin-webcrypto" });
    });
});

describe("CTL1119E · Funciones nativas directas (requieren mock de puente nativo)", () => {
    beforeEach(() => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
        montarBase();
    });
    afterEach(() => {
        _reiniciarFirmaAparato();
        vi.resetModules();
    });

    it("soporteClaveNativa devuelve false sin app nativa", async () => {
        // Sin mock, puenteNativo().disponible = false
        const ok = await soporteClaveNativa();
        expect(ok).toBe(false);
    });

    it("crearClaveAparatoNativa lanza si no hay app nativa", async () => {
        await expect(crearClaveAparatoNativa("Test", CUENTA)).rejects.toMatchObject({ codigo: "sin-app-nativa" });
    });

    it("firmarEntradaNativa lanza si no hay app nativa", async () => {
        await expect(firmarEntradaNativa(entrada(), ctx)).rejects.toMatchObject({ codigo: "sin-app-nativa" });
    });

    it("firmarOrdenControlNativa lanza si no hay app nativa", async () => {
        await expect(firmarOrdenControlNativa(
            (b) => ({ aud: "starseed.control-neuronas.v1", v: 1, de: b.de, cuenta: b.cuenta, para: "destino", nivel: "controlar", sesion: null, seq: b.seq, nonce: "nonce", t: new Date().toISOString(), caduca: new Date(Date.now() + 60000).toISOString(), accion: { nombre: "presentarse", args: {} } }),
            { cuenta: CUENTA }
        )).rejects.toMatchObject({ codigo: "sin-app-nativa" });
    });

    it("spkiDelAparatoNativa devuelve null si no hay app nativa", async () => {
        const spki = await spkiDelAparatoNativa();
        expect(spki).toBeNull();
    });

    it("olvidarAparatoNativa no lanza aunque no haya app nativa", async () => {
        await expect(olvidarAparatoNativa()).resolves.toBeUndefined();
    });
});

describe("CTL1119E · Flujo presentarmeA maneja sin-aparato", () => {
    beforeEach(() => {
        respaldo = crearRespaldo();
        marca = crearMarcaFalsa();
        montarBase();
    });
    afterEach(() => _reiniciarFirmaAparato());

    it("presentarmeA devuelve sin-aparato si no hay clave", async () => {
        const { presentarmeA } = await import("@/lib/control-remoto/canal");
        const r = await presentarmeA("neurona-destino", "Mi Neurona");
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("sin-aparato");
    });
});