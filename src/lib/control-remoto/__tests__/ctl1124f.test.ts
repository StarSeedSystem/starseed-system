/**
 * CTL1124F · una sesión solo se abre cuando una persona la pide: «Terminar control» termina de verdad y
 * comprobar si la otra neurona te aceptó es una LECTURA que no abre sesión ni deja latido.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden, type RespuestaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { SesionHacia, marcarTerminadaPorLaPersona, olvidarTerminadaPorLaPersona } from "../canal";
import { RegistroSesiones } from "../registro-sesiones";

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
let abiertasNativas: string[];
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

function montarPuerta() {
    return new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
        ejecutar: async () => ({ hecho: true }), anotar: (l) => void anotadas.push(l), azarHex: () => "b".repeat(32),
        nativo: {
            disponible: () => true,
            abrir: async (_de: string, nombre: string) => { abiertasNativas.push(nombre); return { ok: true, token: TOKEN }; },
            orden: async () => ({ ok: true }), anotar: () => undefined, parar: async () => undefined,
        } as never,
    });
}

const respuesta = (ok: boolean, motivo: string): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok, motivo });

beforeEach(async () => {
    reloj = Date.parse("2026-11-24T22:41:00Z");
    n = 0;
    seq = 0;
    abiertasNativas = [];
    anotadas = [];
    permiso = permisoDeFabrica();
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    puerta = montarPuerta();
    await puerta.recibir(await firmar("presentarse", { spki: mac.spki, nombre: "MacIntel", neurona: "aaaa0000-0000-4000-8000-000000000001" }));
});

function aceptar(extra: Parameters<typeof aceptarPendiente>[2] = {}) {
    permiso = { ...aceptarPendiente(permiso, mac.huella, extra), encendido: true, nivel: "controlar" };
}

describe("CTL1124F · consultar la aceptación es una lectura sin sesión", () => {
    it("con el aparato aceptado devuelve `ok` y NO abre sesión (ni pide token al lado nativo)", async () => {
        aceptar();
        const r = await puerta.recibir(await firmar("consultar-aceptacion", {}, { nivel: "ver" }));
        expect(r).toMatchObject({ ok: true, motivo: "ok" });
        expect(r.resultado).toMatchObject({ aceptada: true });
        expect(abiertasNativas).toEqual([]);
        expect(puerta.sesionActiva()).toBeNull();
    });

    it("sin aceptar (solo presentado) dice que no, sin abrir nada y sin efecto: la persona sigue decidiendo", async () => {
        const r = await puerta.recibir(await firmar("consultar-aceptacion", {}, { nivel: "ver" }));
        expect(r).toMatchObject({ ok: false, motivo: "no-autorizado" });
        expect(permiso.controladores).toEqual([]);
        expect(abiertasNativas).toEqual([]);
    });

    it("con el permiso apagado lo dice tal cual; aceptado no es lo mismo que operable", async () => {
        aceptar();
        permiso = { ...permiso, encendido: false };
        const r = await puerta.recibir(await firmar("consultar-aceptacion", {}, { nivel: "ver" }));
        expect(r).toMatchObject({ ok: false, motivo: "permiso-apagado" });
        expect(abiertasNativas).toEqual([]);
    });

    it("con el límite elegido ya cumplido devuelve «limite-cumplido» y tampoco abre", async () => {
        aceptar({ limite: { tipo: "minutos", minutos: 1 }, ahora: reloj });
        reloj += 2 * 60_000;
        const r = await puerta.recibir(await firmar("consultar-aceptacion", {}, { nivel: "ver" }));
        expect(r).toMatchObject({ ok: false, motivo: "limite-cumplido" });
        expect(abiertasNativas).toEqual([]);
    });

    it("la misma lectura repetida (mismo seq y nonce) se rechaza: antirrepetición intacta", async () => {
        aceptar();
        const sobre = await firmar("consultar-aceptacion", {}, { nivel: "ver" });
        expect((await puerta.recibir(sobre)).ok).toBe(true);
        expect(await puerta.recibir(sobre)).toMatchObject({ ok: false, motivo: "repetida" });
    });
});

describe("CTL1124F · tras «Terminar» no se reabre nada solo", () => {
    it("después de terminar, la lectura sigue diciendo «aceptada» pero no reaparece ninguna sesión", async () => {
        aceptar();
        const sesion = await puerta.recibir(await firmar("abrir-sesion"));
        expect(sesion).toMatchObject({ ok: true });
        puerta.terminar();
        const r = await puerta.recibir(await firmar("consultar-aceptacion", {}, { nivel: "ver" }));
        expect(r).toMatchObject({ ok: true });
        expect(puerta.sesionActiva()).toBeNull();
        expect(abiertasNativas).toEqual(["MacIntel"]);
    });

    it("sondear manda SOLO la lectura: ni `abrir-sesion` ni `cerrar-sesion` (no deja rastro)", async () => {
        const NEURONA = "22222222-2222-4222-8222-222222222222";
        const vistas: string[] = [];
        const mandar = (async (_p: string, nombre: string) => {
            vistas.push(nombre);
            return respuesta(true, "ok");
        }) as unknown as ConstructorParameters<typeof SesionHacia>[1];
        const s = new SesionHacia(NEURONA, mandar, new RegistroSesiones());
        expect((await s.sondear()).ok).toBe(true);
        expect(vistas).toEqual(["consultar-aceptacion"]);
    });

    it("una sesión marcada como terminada por la persona no se reabre ni al forzar ni con el latido", async () => {
        const NEURONA = "33333333-3333-4333-8333-333333333333";
        const vistas: string[] = [];
        const mandar = (async (_p: string, nombre: string) => {
            vistas.push(nombre);
            return respuesta(true, "ok");
        }) as unknown as ConstructorParameters<typeof SesionHacia>[1];
        marcarTerminadaPorLaPersona(NEURONA);
        const s = new SesionHacia(NEURONA, mandar, new RegistroSesiones());
        expect(await s.abrir(true)).toMatchObject({ ok: false, motivo: "terminado-por-el-dueno" });
        expect(await s.latir()).toBe(false);
        expect(vistas).toEqual([]);
        // Otra pulsación de una persona lo desbloquea.
        olvidarTerminadaPorLaPersona(NEURONA);
        expect((await s.abrir()).ok).toBe(true);
        expect(vistas).toEqual(["abrir-sesion"]);
    });
});
