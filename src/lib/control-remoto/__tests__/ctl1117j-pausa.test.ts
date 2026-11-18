/**
 * CTL1117J · S1: una pausa local NO es una parada.
 * La puerta del aparato controlado sigue con su sesión cuando lo nativo contesta «pausa-local»; solo una parada real la cierra.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import type { RespuestaNativa } from "../nativo";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const TOKEN = "a".repeat(32);

let reloj: number;
let n: number;
let seq: number;
let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: { privada: CryptoKey; spki: string; huella: string };
let nativoDice: RespuestaNativa;
let ejecutadas: string[];
let paradas: string[];
let anotadas: string[];

async function firmar(accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: mac.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seq,
        nonce: `nonce-ctl1117j-${String(++n).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, mac.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}
const gesto = (sesion: string) => firmar("gesto", { dedos: [{ id: 0, puntos: [[0.5, 0.5, 0]] }], sigue: false }, { sesion });

beforeEach(async () => {
    reloj = Date.parse("2026-11-18T01:00:00Z");
    n = 0;
    seq = 0;
    nativoDice = { ok: true };
    ejecutadas = [];
    paradas = [];
    anotadas = [];
    permiso = permisoDeFabrica();
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    puerta = new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
        ejecutar: async (nombre) => { ejecutadas.push(nombre); return { hecho: true }; }, anotar: (l) => void anotadas.push(l), azarHex: () => "b".repeat(32),
        nativo: { disponible: () => true, abrir: async () => ({ ok: true, token: TOKEN }), orden: async () => nativoDice, anotar: () => undefined, parar: async (m: string) => void paradas.push(m) } as never,
    });
    await puerta.recibir(await firmar("presentarse", { spki: mac.spki, nombre: "Mac", neurona: "aaaa0000-0000-4000-8000-000000000001" }));
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel: "controlar" };
});

async function abrir(): Promise<string> {
    const a = await puerta.recibir(await firmar("abrir-sesion"));
    expect(a, anotadas.join("\n")).toMatchObject({ ok: true });
    return (a.resultado as { sesion: string }).sesion;
}

describe("CTL1117J · S1 · la pausa local no cierra la sesión", () => {
    it("una pausa en mitad de un flujo de gestos: se contesta «pausa-local», la sesión y su token siguen, y al reanudar vuelve a cumplir", async () => {
        const sesion = await abrir();
        for (let i = 0; i < 3; i++) expect((await puerta.recibir(await gesto(sesion))).ok).toBe(true);
        nativoDice = { ok: false, motivo: "pausa-local" };
        for (let i = 0; i < 4; i++) {
            const r = await puerta.recibir(await gesto(sesion));
            expect(r).toMatchObject({ ok: false, motivo: "pausa-local" });
        }
        expect(puerta.sesionActiva()?.token).toBe(TOKEN);
        expect(paradas).toEqual([]); // nada se paró en lo nativo desde aquí
        expect(anotadas.some((l) => l.includes("cerrar-sesion"))).toBe(false);
        reloj += 3_000;
        nativoDice = { ok: true };
        const r = await puerta.recibir(await gesto(sesion));
        expect(r.ok).toBe(true);
        expect(puerta.sesionActiva()?.token).toBe(TOKEN);
        expect(ejecutadas.filter((x) => x === "gesto")).toHaveLength(4); // solo las 3 + 1: lo rechazado en pausa no se ejecutó
    });

    it("una orden de solo lectura durante la pausa tampoco cierra la sesión (se contesta «pausa-local» y la lectura se cumple al reanudar)", async () => {
        const sesion = await abrir();
        nativoDice = { ok: false, motivo: "pausa-local" };
        const r = await puerta.recibir(await firmar("leer-aparato", {}, { sesion }));
        expect(r).toMatchObject({ ok: false, motivo: "pausa-local" });
        expect(ejecutadas).not.toContain("leer-aparato");
        expect(puerta.sesionActiva()).not.toBeNull();
        nativoDice = { ok: true };
        const r2 = await puerta.recibir(await firmar("leer-aparato", {}, { sesion }));
        expect(r2.ok).toBe(true);
    });

    it("la pausa mantiene viva la sesión aunque dure: sigue contando como actividad y no caduca por inactividad en 2 min", async () => {
        const sesion = await abrir();
        nativoDice = { ok: false, motivo: "pausa-local" };
        for (let i = 0; i < 4; i++) {
            reloj += 60_000;
            await puerta.recibir(await firmar("leer-estado", {}, { sesion }));
        }
        expect(puerta.sesionActiva()?.token).toBe(TOKEN);
    });

    it("una parada real de lo nativo SÍ cierra: «parada-nativa» y la orden siguiente es «sesion-caducada»", async () => {
        const sesion = await abrir();
        nativoDice = { ok: false, motivo: "parada-nativa", detalle: { motivo: "caducada" } };
        const r = await puerta.recibir(await gesto(sesion));
        expect(r).toMatchObject({ ok: false, motivo: "parada-nativa" });
        expect(puerta.sesionActiva()).toBeNull();
        nativoDice = { ok: true };
        expect((await puerta.recibir(await gesto(sesion))).motivo).toBe("sesion-caducada");
    });

    it("«sin-indicador-nativo» sigue cerrando", async () => {
        const sesion = await abrir();
        nativoDice = { ok: false, motivo: "sin-indicador-nativo" };
        expect((await puerta.recibir(await gesto(sesion))).motivo).toBe("sin-indicador-nativo");
        expect(puerta.sesionActiva()).toBeNull();
    });

    it("«Terminar» (paradaNativa desde el evento de Rust) sigue cerrando aunque haya habido una pausa antes", async () => {
        const sesion = await abrir();
        nativoDice = { ok: false, motivo: "pausa-local" };
        await puerta.recibir(await gesto(sesion));
        puerta.paradaNativa("la-persona-desde-la-notificacion");
        expect(puerta.sesionActiva()).toBeNull();
    });
});
