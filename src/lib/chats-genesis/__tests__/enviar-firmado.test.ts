/**
 * GEN1114E · `enviar` firmado (contrato GEN1114 §3.4, §3.9 y §8.4): qué NO sale a la red, el
 * reintento con la misma entrada firmada y los bytes que llegan a la puerta sin tocar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteChatsGenesis, type FetchLike } from "../puerta-chats";
import type { PuertaA1 } from "@/lib/datos/puerta-a1";
import {
    _reiniciarFirmaAparato,
    actualizarEstadoAparato,
    configurarFirmaAparato,
    crearClaveAparato,
    deB64url,
} from "../firma-aparato";
import { crearIdbFalso, crearMarcaFalsa, crearRespaldo, type Respaldo } from "./idb-falso";
import type { CargaFirmada, EntradaChat } from "../tipos";

const BASE = "https://puerta.prueba";
const CUENTA = "00000000-0000-4000-8000-000000000001";
const OTRA = "00000000-0000-4000-8000-000000000002";
const jwtDe = (sub: string) => `e30.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.firma`;
const AHORA = Date.parse("2026-11-13T10:00:00.000Z");
const subtle = globalThis.crypto.subtle;

const DIRECCION = { id: "genesis", nombre: "GENESIS · StarSeed OS" };
const PUENTE_A = { id: "telegram.ejemplo_a_bot", nombre: "Bot A de ejemplo" };
const hilo: Omit<EntradaChat, "v" | "nonce" | "t"> = { fuente: "direccion", accion: "decir", texto: "Prueba GEN1114 firmada", canales: ["mando"] };
const aHermes: Omit<EntradaChat, "v" | "nonce" | "t"> = { fuente: "puente:hermes-avisos", accion: "texto", texto: "hola Hermes" };

let respaldo: Respaldo;
let marca: ReturnType<typeof crearMarcaFalsa>;
let spki: string;

function respuesta(estado: number, cuerpo: unknown): Response {
    return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
}

function cliente(fetch: FetchLike, extra: Parameters<typeof crearClienteChatsGenesis>[0] = {}) {
    const operar = vi.fn(async () => ({ via: "puerta", datos: {} }));
    const url = vi.fn(async () => BASE);
    const puerta = { modo: () => "auto", configurada: async () => true, operar } as unknown as PuertaA1;
    const c = crearClienteChatsGenesis({ puerta, fetch, url, sesion: async () => jwtDe(CUENTA), ahora: () => AHORA, ...extra });
    return { c, operar, url };
}

async function emparejar(nivel: "texto" | "completo" = "texto") {
    await actualizarEstadoAparato({ estado: "emparejado", nivel });
}

beforeEach(async () => {
    respaldo = crearRespaldo();
    marca = crearMarcaFalsa();
    _reiniciarFirmaAparato();
    configurarFirmaAparato({ indexedDB: crearIdbFalso(respaldo), subtle, marca, ahora: () => AHORA, seguro: true });
    spki = (await crearClaveAparato("iPhone de Alex", CUENTA)).spki;
});
afterEach(() => _reiniciarFirmaAparato());

describe("lo que NUNCA sale a la red", () => {
    it("sin aparato emparejado (sin clave, pendiente o retirado): codigo y ninguna petición", async () => {
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 1 }));
        const { c, url } = cliente(fetch);
        expect(await c.enviar(hilo, DIRECCION)).toMatchObject({ ok: false, estado: 0, codigo: "sin-emparejar" });
        await actualizarEstadoAparato({ estado: "pendiente", solicitud: 3 });
        expect(await c.enviar(hilo, DIRECCION)).toMatchObject({ ok: false, estado: 0, codigo: "sin-emparejar" });
        await actualizarEstadoAparato({ estado: "revocado" });
        expect(await c.enviar(hilo, DIRECCION)).toMatchObject({ ok: false, estado: 0, codigo: "revocado" });
        expect(fetch).not.toHaveBeenCalled();
        expect(url).not.toHaveBeenCalled();
    });

    it("con la clave perdida (IndexedDB vaciado): «clave-perdida», ni red ni clave nueva", async () => {
        await emparejar("completo");
        const vacio = crearRespaldo();
        _reiniciarFirmaAparato();
        configurarFirmaAparato({ indexedDB: crearIdbFalso(vacio), subtle, marca, ahora: () => AHORA, seguro: true });
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 1 }));
        const r = await cliente(fetch).c.enviar(hilo, DIRECCION);
        expect(r).toMatchObject({ ok: false, estado: 0, codigo: "clave-perdida" });
        expect((r as { error: string }).error).toMatch(/Empareja de nuevo/);
        expect(fetch).not.toHaveBeenCalled();
        expect(vacio.bases.get("starseed-genesis-firma")?.almacenes.get("aparato")?.size ?? 0).toBe(0);
    });

    it("sin el chat que se ve: «sin-chat»", async () => {
        await emparejar("completo");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 1 }));
        const { c } = cliente(fetch);
        expect(await c.enviar(hilo)).toMatchObject({ ok: false, estado: 0, codigo: "sin-chat" });
        expect(await c.enviar(hilo, { id: "genesis", nombre: "  " })).toMatchObject({ ok: false, estado: 0, codigo: "sin-chat" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("con otra cuenta en la sesión: «otra-cuenta»", async () => {
        await emparejar("completo");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 1 }));
        const { c, url } = cliente(fetch, { sesion: async () => jwtDe(OTRA) });
        expect(await c.enviar(hilo, DIRECCION)).toMatchObject({ ok: false, estado: 0, codigo: "otra-cuenta", error: "Este aparato se emparejó con otra cuenta" });
        expect(fetch).not.toHaveBeenCalled();
        expect(url).not.toHaveBeenCalled();
    });

    it("algo `alto` desde un aparato «texto»: «nivel»; lo `bajo` sí sale", async () => {
        await emparejar("texto");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 7 }));
        const { c } = cliente(fetch);
        const r = await c.enviar(aHermes, PUENTE_A);
        expect(r).toMatchObject({ ok: false, estado: 0, codigo: "nivel" });
        expect(await c.enviar({ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "aprobar", args: ["T1"] } }, PUENTE_A)).toMatchObject({ codigo: "nivel" });
        expect(await c.enviar({ ...hilo, modelo: "director-presidente/auto" }, DIRECCION)).toMatchObject({ codigo: "nivel" });
        expect(fetch).not.toHaveBeenCalled();
        expect(await c.enviar({ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "estado", args: [] } }, PUENTE_A)).toEqual({ ok: true, id: 7 });
        expect(await c.enviar(hilo, DIRECCION)).toEqual({ ok: true, id: 7 });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("fuera de una acción de la persona: «sin-gesto» y ni siquiera se firma", async () => {
        await emparejar("completo");
        const sign = vi.spyOn(subtle, "sign");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 1 }));
        const { c } = cliente(fetch, { gesto: () => false });
        expect(await c.enviar(hilo, DIRECCION)).toMatchObject({ ok: false, estado: 0, codigo: "sin-gesto" });
        expect(sign).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
        sign.mockRestore();
    });
});

describe("lo que sale: bytes firmados una vez, y nunca por la cola", () => {
    it("la puerta recibe {v:2, carga, firma, aparato}; la carga son los bytes firmados, con el chat y el nombre que se vieron", async () => {
        await emparejar("completo");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 9 }));
        const { c, operar } = cliente(fetch);
        expect(await c.enviar(aHermes, PUENTE_A)).toEqual({ ok: true, id: 9 });
        expect(operar).not.toHaveBeenCalled();
        const cuerpo = JSON.parse(String(fetch.mock.calls[0][1]!.body)) as { v: number; carga: string; firma: string; aparato: string };
        const bytes = deB64url(cuerpo.carga);
        const carga = JSON.parse(new TextDecoder().decode(bytes)) as CargaFirmada;
        expect(carga).toMatchObject({ cuenta: CUENTA, destino: "mac", chat: PUENTE_A.id, chatNombre: PUENTE_A.nombre, entrada: { v: 1, ...aHermes } });
        expect(Date.parse(carga.caduca) - Date.parse(carga.t)).toBe(1800_000);
        const publica = await subtle.importKey("spki", deB64url(spki), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
        expect(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publica, deB64url(cuerpo.firma), bytes)).toBe(true);
        expect(cuerpo.aparato).toBe(carga.aparato);
    });

    it("un reintento tras un fallo de red reenvía LA MISMA entrada firmada (mismo seq y nonce); tras una respuesta, una nueva", async () => {
        await emparejar("completo");
        const cuerpos: string[] = [];
        let n = 0;
        const fetch = vi.fn<FetchLike>(async (_u, init) => {
            cuerpos.push(String(init!.body));
            n++;
            if (n === 1) throw new TypeError("Failed to fetch");
            return respuesta(201, { id: n });
        });
        const { c } = cliente(fetch);
        expect((await c.enviar(aHermes, PUENTE_A)).ok).toBe(false);
        expect(await c.enviar(aHermes, PUENTE_A)).toEqual({ ok: true, id: 2 });
        expect(cuerpos[1]).toBe(cuerpos[0]);
        expect(await c.enviar(aHermes, PUENTE_A)).toEqual({ ok: true, id: 3 });
        expect(cuerpos[2]).not.toBe(cuerpos[0]);
        const seq = (s: string) => (JSON.parse(new TextDecoder().decode(deB64url(JSON.parse(s).carga))) as CargaFirmada).seq;
        expect([seq(cuerpos[0]), seq(cuerpos[1]), seq(cuerpos[2])]).toEqual([1, 1, 2]);
    });

    it("«olvidar este aparato»: `revocarme` sale aunque no se pase chat (va al de la dirección) y es bajo", async () => {
        await emparejar("texto");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 5 }));
        const { c } = cliente(fetch);
        expect(await c.enviar({ fuente: "direccion", accion: "revocarme" })).toEqual({ ok: true, id: 5 });
        const carga = JSON.parse(new TextDecoder().decode(deB64url(JSON.parse(String(fetch.mock.calls[0][1]!.body)).carga))) as CargaFirmada;
        expect(carga).toMatchObject({ chat: "genesis", destino: "mac", entrada: { fuente: "direccion", accion: "revocarme" } });
        expect(await c.enviar({ fuente: "direccion", accion: "revocar-aparato" })).toMatchObject({ ok: false, estado: 400 });
        expect(await c.enviar({ fuente: "puente:hermes-avisos", accion: "revocarme" })).toMatchObject({ ok: false, estado: 400 });
        expect(await c.enviar({ ...hilo, huella: "a".repeat(64) }, DIRECCION)).toMatchObject({ ok: false, estado: 400 });
        expect(await c.enviar({ fuente: "direccion", accion: "revocar-aparato", huella: "b".repeat(64) })).toEqual({ ok: true, id: 5 });
    });

    it("el largo del texto se cuenta en puntos de código (como Python): 8.000 emojis caben y firman; 8.001, no", async () => {
        await emparejar("completo");
        const fetch = vi.fn<FetchLike>(async () => respuesta(201, { id: 4 }));
        const { c } = cliente(fetch);
        expect(await c.enviar({ ...hilo, texto: "🌱".repeat(8000) }, DIRECCION)).toEqual({ ok: true, id: 4 });
        expect(deB64url(JSON.parse(String(fetch.mock.calls[0][1]!.body)).carga).length).toBeLessThanOrEqual(32 * 1024);
        expect(await c.enviar({ ...hilo, texto: "🌱".repeat(8001) }, DIRECCION)).toMatchObject({ ok: false, estado: 400 });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("traduce los códigos nuevos de la puerta", async () => {
        await emparejar("completo");
        for (const [codigo, texto] of [
            ["sin-firma", "Este aparato no está emparejado para escribir"],
            ["destino-cerrado", "Escribir a Peticiones llega cuando el A1 tenga la versión nueva"],
            ["firma-cuenta", "La firma es de otra cuenta que la de tu sesión: no se envió nada"],
        ] as const) {
            const { c } = cliente(async () => respuesta(codigo === "sin-firma" ? 400 : 403, { error: "x", codigo }));
            expect(await c.enviar(hilo, DIRECCION)).toMatchObject({ ok: false, codigo, error: texto });
        }
    });
});
