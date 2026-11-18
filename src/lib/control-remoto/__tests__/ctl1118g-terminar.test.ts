/**
 * CTL1118G · «Terminar» solo corta la sesión; «Quitar permiso» la corta y apaga el permiso; el nombre de quien controla viaja firmado.
 * Decisión de Alex (18-11): «que solo corte la sesion, con la opcion de quitar permiso directamente».
 */
import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { claveParadaNativa, MOTIVOS_TERMINALES, palabrasMotivo } from "../palabras";
import { definicion } from "../niveles";
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
let paradas: string[];
let abiertas: { nombre: string }[];
let anotadas: string[];

async function firmar(accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: mac.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seq,
        nonce: `nonce-ctl1118g-${String(++n).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, mac.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

beforeEach(async () => {
    reloj = Date.parse("2026-11-18T10:00:00Z");
    n = 0;
    seq = 0;
    nativoDice = { ok: true };
    paradas = [];
    abiertas = [];
    anotadas = [];
    permiso = permisoDeFabrica();
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    puerta = new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
        ejecutar: async () => ({ hecho: true }), anotar: (l) => void anotadas.push(l), azarHex: () => "b".repeat(32),
        nativo: {
            disponible: () => true,
            abrir: async (_de: string, nombre: string) => { abiertas.push({ nombre }); return { ok: true, token: TOKEN }; },
            orden: async () => nativoDice, anotar: () => undefined, parar: async (m: string) => void paradas.push(m),
        } as never,
    });
    await puerta.recibir(await firmar("presentarse", { spki: mac.spki, nombre: "MacIntel", neurona: "aaaa0000-0000-4000-8000-000000000001" }));
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel: "controlar" };
});

async function abrir(args: Record<string, unknown> = {}): Promise<string> {
    const a = await puerta.recibir(await firmar("abrir-sesion", args));
    expect(a, anotadas.join("\n")).toMatchObject({ ok: true });
    return (a.resultado as { sesion: string }).sesion;
}

describe("CTL1118G · «Terminar» solo corta la sesión", () => {
    it("el permiso sigue encendido y el controlador sigue aceptado; lo nativo recibe el motivo `terminado-por-el-dueno`", async () => {
        await abrir();
        puerta.terminar();
        expect(puerta.sesionActiva()).toBeNull();
        expect(permiso.encendido).toBe(true);
        expect(permiso.controladores.map((c) => c.huella)).toEqual([mac.huella]);
        expect(paradas).toEqual(["terminado-por-el-dueno"]);
    });

    it("quien manda recibe `parada-nativa` con `detalle.motivo=terminado-por-el-dueno` (terminal), no «permiso-apagado» ni «sesion-caducada»", async () => {
        const sesion = await abrir();
        puerta.terminar();
        const r = await puerta.recibir(await firmar("leer-estado", {}, { sesion }));
        expect(r).toMatchObject({ ok: false, motivo: "parada-nativa", resultado: { detalle: { motivo: "terminado-por-el-dueno" } } });
        expect(claveParadaNativa(r.motivo, r.resultado)).toBe("terminado-por-el-dueno");
        expect(MOTIVOS_TERMINALES.has(r.motivo)).toBe(true);
        expect(MOTIVOS_TERMINALES.has("terminado-por-el-dueno")).toBe(true);
        expect(palabrasMotivo("terminado-por-el-dueno")).toMatch(/terminó la sesión/);
        expect(palabrasMotivo("terminado-por-el-dueno")).not.toMatch(/quitó el permiso/);
    });

    it("lo dice las veces que haga falta, hasta que una persona vuelve a abrir (una `abrir-sesion` buena borra la marca)", async () => {
        const sesion = await abrir();
        puerta.terminar();
        for (let i = 0; i < 3; i++) expect(await puerta.recibir(await firmar("leer-estado", {}, { sesion }))).toMatchObject({ ok: false, motivo: "parada-nativa" });
        const otra = await abrir();
        expect(await puerta.recibir(await firmar("leer-estado", {}, { sesion: otra }))).toMatchObject({ ok: true });
    });

    it("«Terminar» desde lo nativo (indicador, notificación, superposición) hace lo mismo: la sesión se corta y no reabre sola", async () => {
        for (const m of ["la-persona-desde-el-indicador", "la-persona-desde-la-notificacion", "la-persona-desde-la-superposicion"]) {
            const sesion = await abrir();
            puerta.paradaNativa(m);
            expect(permiso.encendido).toBe(true);
            expect(await puerta.recibir(await firmar("leer-estado", {}, { sesion }))).toMatchObject({ ok: false, motivo: "parada-nativa", resultado: { detalle: { motivo: "terminado-por-el-dueno" } } });
            reloj += 20_000; // el tope de órdenes por minuto no es lo que se prueba aquí
            await abrir(); // una persona vuelve a abrir
            puerta.terminar();
            reloj += 20_000;
        }
    });

    it("una parada que no es de la persona (caducidad) NO deja marca: sigue siendo «sesion-caducada» y se reabre como siempre", async () => {
        const sesion = await abrir();
        puerta.paradaNativa("caducada");
        expect(await puerta.recibir(await firmar("leer-estado", {}, { sesion }))).toMatchObject({ ok: false, motivo: "sesion-caducada" });
    });

    it("«Terminar» sin sesión no inventa nada", () => {
        expect(() => puerta.terminar()).not.toThrow();
        expect(permiso.encendido).toBe(true);
    });
});

describe("CTL1118G · «Quitar permiso» apaga el permiso de este aparato", () => {
    it("cierra la sesión, apaga el permiso y quien manda recibe «permiso-apagado»", async () => {
        const sesion = await abrir();
        puerta.quitarPermiso();
        expect(puerta.sesionActiva()).toBeNull();
        expect(permiso.encendido).toBe(false);
        expect(paradas).toEqual(["revocado"]);
        expect(await puerta.recibir(await firmar("leer-estado", {}, { sesion }))).toMatchObject({ ok: false, motivo: "permiso-apagado" });
    });
});

describe("CTL1118G · el nombre de quien controla viaja firmado", () => {
    it("«abrir-sesion» admite `nombre` y `color` (y nada más)", () => {
        const v = definicion("abrir-sesion")!.validar;
        expect(v({})).toEqual({});
        expect(v({ nombre: "MaggaBook" })).toEqual({ nombre: "MaggaBook" });
        expect(v({ color: "#112233", nombre: "MaggaBook" })).toEqual({ color: "#112233", nombre: "MaggaBook" });
        expect(v({ nombre: "" })).toBeNull();
        expect(v({ nombre: "a\nb" })).toBeNull();
        expect(v({ nombre: 3 })).toBeNull();
        expect(v({ otro: "x" })).toBeNull();
    });

    it("el aceptado con el nombre viejo («MacIntel») se pone al día con una orden FIRMADA suya, sin aceptarlo otra vez", async () => {
        expect(permiso.controladores[0].nombre).toBe("MacIntel");
        const sesion = await abrir({ nombre: "MaggaBook" });
        expect(abiertas.at(-1)?.nombre).toBe("MaggaBook"); // el indicador nativo ya recibe el nombre bueno
        expect(puerta.sesionActiva()?.nombre).toBe("MaggaBook");
        expect(permiso.controladores.map((c) => c.nombre)).toEqual(["MaggaBook"]);
        expect(permiso.controladores).toHaveLength(1);
        expect(permiso.encendido).toBe(true);
        expect(sesion).toBe(TOKEN);
    });

    it("sin nombre firmado (controlador viejo) se queda el que ya había; un nombre largo se guarda entero hasta 60 caracteres", async () => {
        await abrir();
        expect(puerta.sesionActiva()?.nombre).toBe("MacIntel");
        puerta.terminar();
        const largo = "Neurona con un nombre bastante largo de verdad 123456789012345678901234567890";
        await abrir({ nombre: largo });
        expect(permiso.controladores[0].nombre).toBe([...largo].slice(0, 60).join(""));
    });

    it("una orden SIN firma válida nunca cambia el nombre", async () => {
        const buena = await firmar("abrir-sesion", { nombre: "Intruso" });
        const mala = { ...buena, firma: `${buena.firma.slice(0, 20)}${buena.firma[20] === "A" ? "B" : "A"}${buena.firma.slice(21)}` };
        const r = await puerta.recibir(mala);
        expect(r.ok).toBe(false);
        expect(permiso.controladores[0].nombre).toBe("MacIntel");
    });
});
