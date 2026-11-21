/**
 * CTL1117A · S1/S3/S5 en la puerta del aparato controlado: abrir otra vez con la sesión viva es la misma sesión (sin
 * estirar su hora máxima); las lecturas de la ventana tienen su propio presupuesto y el techo total se mantiene.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, TOPE_LECTURA_SEGUNDO, TOPE_SEGUNDO, TOPE_TOTAL_SEGUNDO, type PermisoControl } from "../sesion";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
let reloj = Date.parse("2026-11-17T10:00:00Z");
let nonceN = 0;
let seq = 0;
let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: { privada: CryptoKey; spki: string; huella: string };
let tokenNativo = "a".repeat(32);

async function firmar(accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: mac.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seq,
        nonce: `nonce-ctl-${String(++nonceN).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, mac.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

beforeEach(async () => {
    reloj = Date.parse("2026-11-17T10:00:00Z");
    seq = 0;
    tokenNativo = "a".repeat(32);
    permiso = permisoDeFabrica();
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    let n = 0;
    puerta = new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
        ejecutar: async () => ({ hecho: true }), anotar: () => undefined, azarHex: () => (++n).toString(16).padStart(32, "0"),
        // lo nativo reutiliza la sesión viva (mismo token), como `control_neuronas_abrir` tras CTL1117A
        nativo: { disponible: () => true, abrir: async () => ({ ok: true, token: tokenNativo }), orden: async () => ({ ok: true }), anotar: () => undefined, parar: async () => undefined } as never,
    });
    await puerta.recibir(await firmar("presentarse", { spki: mac.spki, nombre: "Mac", neurona: "aaaa0000-0000-4000-8000-000000000001" }));
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel: "controlar" };
});

describe("S1 · abrir otra vez es la misma sesión", () => {
    it("con la sesión viva y el mismo controlador devuelve el mismo token y NO inventa un límite", async () => {
        const a = await puerta.recibir(await firmar("abrir-sesion"));
        expect((a.resultado as { sinLimite?: boolean }).sinLimite).toBe(true);
        for (let i = 0; i < 180; i++) {
            reloj += 10_000; // CTL1119A: un latido cada 10 s mantiene viva la sesión, sin hora máxima
            expect((await puerta.recibir(await firmar("leer-estado", {}, { sesion: tokenNativo }))).ok).toBe(true);
        }
        const b = await puerta.recibir(await firmar("abrir-sesion"));
        expect(b.ok).toBe(true);
        expect((b.resultado as { sesion: string }).sesion).toBe(tokenNativo);
        expect((b.resultado as { caduca?: string }).caduca).toBeUndefined();
        expect((b.resultado as { sinLimite?: boolean }).sinLimite).toBe(true);
    });
});

describe("S5 · presupuestos separados", () => {
    it("las lecturas no gastan las órdenes de app: 5 lecturas y luego las órdenes de app que quedan caben en el mismo segundo", async () => {
        const a = await puerta.recibir(await firmar("abrir-sesion"));
        const sesion = (a.resultado as { sesion: string }).sesion;
        const lect: string[] = [];
        for (let i = 0; i < TOPE_LECTURA_SEGUNDO; i++) lect.push((await puerta.recibir(await firmar("leer-aparato", {}, { sesion }))).motivo);
        expect(lect).toEqual(Array(TOPE_LECTURA_SEGUNDO).fill("ok"));
        const apps: string[] = [];
        for (let i = 0; i < TOPE_SEGUNDO - 2; i++) apps.push((await puerta.recibir(await firmar("colgar", {}, { sesion }))).motivo);
        expect(apps).toEqual(Array(TOPE_SEGUNDO - 2).fill("ok"));
    });

    it("las lecturas tienen su tope propio (5/s) y el techo TOTAL sigue en pie", async () => {
        const a = await puerta.recibir(await firmar("abrir-sesion"));
        const sesion = (a.resultado as { sesion: string }).sesion;
        const m: string[] = [];
        for (let i = 0; i < TOPE_LECTURA_SEGUNDO + 2; i++) m.push((await puerta.recibir(await firmar("leer-aparato", {}, { sesion }))).motivo);
        expect(m.filter((x) => x === "limite")).toHaveLength(2);
        // techo total: 60 de entrada + lecturas + app no pasan de TOPE_TOTAL_SEGUNDO
        reloj += 2000;
        let ok = 0;
        for (let i = 0; i < TOPE_TOTAL_SEGUNDO + 20; i++) {
            const nombre = i % 3 === 0 ? "leer-aparato" : i % 3 === 1 ? "colgar" : "tecla";
            const args = nombre === "tecla" ? { cual: "atras" } : {};
            const r = await puerta.recibir(await firmar(nombre, args, { sesion }));
            if (r.motivo !== "limite") ok++;
        }
        expect(ok).toBeLessThanOrEqual(TOPE_TOTAL_SEGUNDO);
        expect(ok).toBeGreaterThan(TOPE_SEGUNDO);
    });
});
