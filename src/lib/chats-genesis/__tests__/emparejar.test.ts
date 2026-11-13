/**
 * GEN1114E · la mitad del aparato al emparejar (contrato GEN1114 §3.3 y §8.1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultarEmparejamiento, crearClienteAparatos, pedirEmparejar, plataformaActual, type ClienteAparatos } from "../emparejar";
import { _reiniciarFirmaAparato, actualizarEstadoAparato, aparatoLocal, configurarFirmaAparato, crearClaveAparato } from "../firma-aparato";
import { crearIdbFalso, crearMarcaFalsa, crearRespaldo } from "./idb-falso";
import type { FetchLike } from "../puerta-chats";
import type { PuertaA1 } from "@/lib/datos/puerta-a1";

const CUENTA = "00000000-0000-4000-8000-000000000001";
const AHORA = Date.parse("2026-11-13T14:02:00.000Z");
const puerta = { modo: () => "auto", configurada: async () => true, operar: vi.fn() } as unknown as PuertaA1;
const respuesta = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado });

beforeEach(() => {
    _reiniciarFirmaAparato();
    configurarFirmaAparato({ indexedDB: crearIdbFalso(crearRespaldo()), subtle: globalThis.crypto.subtle, marca: crearMarcaFalsa(), ahora: () => AHORA, seguro: true });
});
afterEach(() => _reiniciarFirmaAparato());

function cliente(fetch: FetchLike) {
    return crearClienteAparatos({ puerta, fetch, url: async () => "https://puerta.prueba", sesion: async () => "jwt" });
}

describe("crearClienteAparatos", () => {
    it("solicitar: POST directo una vez, sin cola, con sesión; devuelve número y caducidad", async () => {
        const { spki } = await crearClaveAparato("iPhone de Alex", CUENTA);
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { solicitud: 12, caduca: "2026-11-13T14:17:00.000Z", huella: "x" }));
        const r = await cliente(fetch).solicitar({ spki, nombre: "iPhone de Alex", plataforma: "navegador" });
        expect(r).toEqual({ ok: true, solicitud: 12, caduca: "2026-11-13T14:17:00.000Z" });
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://puerta.prueba/v1/genesis/aparatos/solicitud");
        expect(init).toMatchObject({ method: "POST", credentials: "omit" });
        expect(JSON.parse(String(init!.body))).toEqual({ spki, nombre: "iPhone de Alex", plataforma: "navegador" });
        expect(puerta.operar).not.toHaveBeenCalled();
    });

    it("solicitar: forma mala sin red; 429 solicitud-limite con su texto; caída sin reintentar", async () => {
        const fetch = vi.fn<FetchLike>(async () => respuesta(429, { error: "x", codigo: "solicitud-limite" }));
        const c = cliente(fetch);
        expect(await c.solicitar({ spki: "no válida!", nombre: "x", plataforma: "navegador" })).toMatchObject({ ok: false, estado: 400 });
        expect(await c.solicitar({ spki: "AAAA", nombre: "", plataforma: "navegador" })).toMatchObject({ ok: false, estado: 400 });
        expect(await c.solicitar({ spki: "A".repeat(300), nombre: "x", plataforma: "navegador" })).toMatchObject({ ok: false, estado: 400 });
        expect(await c.solicitar({ spki: "AAAA", nombre: "x", plataforma: "tostadora" as "navegador" })).toMatchObject({ ok: false, estado: 400 });
        expect(fetch).not.toHaveBeenCalled();
        const r = await c.solicitar({ spki: "AAAA", nombre: "x", plataforma: "app-nativa" });
        expect(r).toMatchObject({ ok: false, estado: 429, codigo: "solicitud-limite" });
        expect((r as { error: string }).error).toMatch(/3 solicitudes/);
        const caida = vi.fn<FetchLike>(async () => { throw new TypeError("Failed to fetch"); });
        expect(await cliente(caida).solicitar({ spki: "AAAA", nombre: "x", plataforma: "navegador" })).toMatchObject({ ok: false, estado: 0 });
        expect(caida).toHaveBeenCalledTimes(1);
    });

    it("estado: solo una huella válida; lo que no entiende → null", async () => {
        const fetch = vi.fn<FetchLike>(async () => respuesta(200, { estado: "emparejado", t: "2026-11-13T14:05:00.000Z", nivel: "completo" }));
        const c = cliente(fetch);
        expect(await c.estado("x")).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
        expect(await c.estado("a".repeat(64))).toEqual({ estado: "emparejado", t: "2026-11-13T14:05:00.000Z", nivel: "completo" });
        expect(fetch.mock.calls[0][0]).toBe(`https://puerta.prueba/v1/genesis/aparatos/estado?huella=${"a".repeat(64)}`);
        const raro = cliente(async () => respuesta(200, { estado: "inventado" }));
        expect(await raro.estado("a".repeat(64))).toBeNull();
    });
});

function clienteFalso(estado: { estado: string; t: string | null; nivel?: "texto" | "completo" } | null = null): ClienteAparatos & { solicitar: ReturnType<typeof vi.fn> } {
    return {
        solicitar: vi.fn(async () => ({ ok: true as const, solicitud: 3, caduca: "2026-11-13T14:17:00.000Z" })),
        estado: vi.fn(async () => estado),
    };
}

describe("pedirEmparejar y consultarEmparejamiento", () => {
    it("crea la clave, pide y queda pendiente; repetirlo reutiliza la misma clave", async () => {
        const c = clienteFalso();
        const r = await pedirEmparejar(c, { nombre: "iPhone de Alex", cuenta: CUENTA, plataforma: "navegador", ahora: AHORA });
        expect(r.ok).toBe(true);
        const a = (r as { aparato: { huella: string; estado: string; solicitud?: number; desde?: string } }).aparato;
        expect(a).toMatchObject({ estado: "pendiente", solicitud: 3, desde: "2026-11-13T14:02:00.000Z" });
        const r2 = await pedirEmparejar(c, { nombre: "iPhone de Alex", cuenta: CUENTA, plataforma: "navegador" });
        expect((r2 as { aparato: { huella: string } }).aparato.huella).toBe(a.huella);
        expect(c.solicitar.mock.calls[0][0].spki).toBe(c.solicitar.mock.calls[1][0].spki);
    });

    it("con un aparato ya emparejado no hace nada", async () => {
        await crearClaveAparato("Mac", CUENTA);
        await actualizarEstadoAparato({ estado: "emparejado" });
        const c = clienteFalso();
        expect(await pedirEmparejar(c, { nombre: "x", cuenta: CUENTA })).toMatchObject({ ok: false, codigo: "ya-emparejado" });
        expect(c.solicitar).not.toHaveBeenCalled();
    });

    it("emparejado según la puerta: nivel texto por defecto, completo solo si lo dice", async () => {
        await pedirEmparejar(clienteFalso(), { nombre: "x", cuenta: CUENTA, plataforma: "navegador" });
        expect(await consultarEmparejamiento(clienteFalso({ estado: "emparejado", t: "2026-11-13T14:05:00.000Z" }))).toMatchObject({ estado: "emparejado", nivel: "texto", desde: "2026-11-13T14:05:00.000Z" });
        expect(await consultarEmparejamiento(clienteFalso({ estado: "emparejado", t: null, nivel: "completo" }))).toMatchObject({ estado: "emparejado", nivel: "completo" });
        // «desconocido» (la puerta olvidó la solicitud) no baja un aparato emparejado.
        expect(await consultarEmparejamiento(clienteFalso({ estado: "desconocido", t: null }))).toMatchObject({ estado: "emparejado" });
        // Retirado: deja de ser completo.
        expect(await consultarEmparejamiento(clienteFalso({ estado: "revocado", t: "2026-11-13T15:00:00.000Z" }))).toMatchObject({ estado: "revocado", nivel: "texto" });
    });

    it("caducada o rechazada con la solicitud pendiente → sin emparejar, la misma clave", async () => {
        await pedirEmparejar(clienteFalso(), { nombre: "x", cuenta: CUENTA, plataforma: "navegador" });
        const huella = (await aparatoLocal())!.huella;
        expect(await consultarEmparejamiento(clienteFalso({ estado: "caducada", t: null }))).toMatchObject({ estado: "sin-emparejar", huella });
        expect(await consultarEmparejamiento(clienteFalso(null))).toMatchObject({ estado: "sin-emparejar" });
        expect(plataformaActual()).toBe("navegador");
    });
});
