/**
 * CTL1124F · Cuando el dueño termina el control, la sesión no se reabre sola.
 * El otro aparato no puede reabrir una sesión que fue terminada por el dueño
 * hasta que alguien pulse «Pedir controlarla desde aquí» o «Reabrir».
 * 
 * Este test verifica el comportamiento específico de CTL1124F:
 * - abrir-sesion CON sesión anterior (latido automático) → RECHAZA con parada-nativa
 * - abrir-sesion SIN sesión (Reabrir manual) → PERMITE nueva sesión
 */
import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl, MOTIVO_TERMINADO } from "../sesion";
import { claveParadaNativa, MOTIVOS_TERMINALES, palabrasMotivo } from "../palabras";
import type { RespuestaNativa } from "../nativo";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const NEURONA_MAC = "aaaa0000-0000-4000-8000-000000000001";

let reloj: number;
let n: number;
let seq: number;
let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: { privada: CryptoKey; spki: string; huella: string };
let nativoDice: RespuestaNativa;
let paradas: string[];
let anotadas: string[];

async function firmar(accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: mac.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seq,
        nonce: `nonce-ctl1124f-${String(++n).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, mac.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

beforeEach(async () => {
    reloj = Date.parse("2026-11-24T10:00:00Z");
    n = 0;
    seq = 0;
    nativoDice = { ok: true };
    paradas = [];
    anotadas = [];
    permiso = permisoDeFabrica();
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    let tokenCounter = 0;
    puerta = new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
        ejecutar: async () => ({ hecho: true }), anotar: (l) => void anotadas.push(l), azarHex: () => "b".repeat(32),
        nativo: {
            disponible: () => true,
            abrir: async (_de: string, nombre: string) => ({ ok: true, token: (++tokenCounter).toString(16).padStart(32, "0") }),
            orden: async () => nativoDice, anotar: () => undefined, parar: async (m: string) => void paradas.push(m),
        } as never,
    });
    await puerta.recibir(await firmar("presentarse", { spki: mac.spki, nombre: "MacIntel", neurona: NEURONA_MAC }));
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel: "controlar" };
});

async function abrir(args: Record<string, unknown> = {}): Promise<string> {
    const a = await puerta.recibir(await firmar("abrir-sesion", args));
    expect(a.ok, anotadas.join("\n")).toBe(true);
    return (a.resultado as { sesion: string }).sesion;
}

describe("CTL1124F · Terminar control no deja que la sesión se reabra sola", () => {
    it("abrir-sesion CON sesión anterior (latido automático) se rechaza con parada-nativa", async () => {
        const sesion = await abrir();
        puerta.terminar();

        // Intento de reapertura automática: abrir-sesion CON la sesión anterior
        const r = await puerta.recibir(await firmar("abrir-sesion", {}, { sesion }));
        expect(r).toMatchObject({
            ok: false,
            motivo: "parada-nativa",
            resultado: { detalle: { motivo: "terminado-por-el-dueno" } },
        });

        const clave = claveParadaNativa(r.motivo, r.resultado);
        expect(clave).toBe("terminado-por-el-dueno");
        expect(MOTIVOS_TERMINALES.has(clave)).toBe(true);
        expect(puerta.sesionActiva()).toBeNull();
    });

    it("abrir-sesion SIN sesión (Reabrir manual) crea una nueva sesión", async () => {
        const sesion1 = await abrir();
        puerta.terminar();

        // Reabrir manual: abrir-sesion SIN sesión
        const r = await puerta.recibir(await firmar("abrir-sesion"));
        expect(r.ok).toBe(true);
        const sesion2 = (r.resultado as { sesion: string }).sesion;
        expect(sesion2).not.toBe(sesion1);
        expect(puerta.sesionActiva()?.token).toBe(sesion2);
    });

    it("leer-estado con sesión anterior devuelve parada-nativa (no sesion-caducada)", async () => {
        const sesion = await abrir();
        puerta.terminar();

        const r = await puerta.recibir(await firmar("leer-estado", {}, { sesion }));
        expect(r).toMatchObject({ ok: false, motivo: "parada-nativa" });
        expect(claveParadaNativa(r.motivo, r.resultado)).toBe("terminado-por-el-dueno");
    });

    it("paradaNativa con caducidad NO deja marca terminado-por-el-dueno", async () => {
        const sesion = await abrir();
        puerta.paradaNativa("caducada");

        const r = await puerta.recibir(await firmar("leer-estado", {}, { sesion }));
        expect(r).toMatchObject({ ok: false, motivo: "sesion-caducada" });
        expect(paradas).toEqual([]);
    });

    it("el texto de terminado-por-el-dueno no menciona «quitó el permiso»", async () => {
        const texto = palabrasMotivo("terminado-por-el-dueno");
        expect(texto).toMatch(/terminó la sesión/);
        expect(texto).not.toMatch(/quitó el permiso/);
    });
});