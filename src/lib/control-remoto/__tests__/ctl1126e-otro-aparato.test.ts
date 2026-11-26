/**
 * CTL1126E · control entre aparatos de la misma neurona
 * Cuando una neurona tiene múltiples aparatos y se solicita control a uno específico,
 * el resto rechaza con «otro-aparato».
 */
import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl, MOTIVO_OTRO_APARATO, noReabreSola } from "../sesion";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const NEURONA_MAC = "aaaa0000-0000-4000-8000-000000000001";
// El aparato que recibe la orden (es el "thisDeviceId" de la neurona)
const APARATO_RECEPTOR = "11111111-1111-4000-8000-000000000001";
// Otro aparato de la misma neurona (el que NO debería recibir la orden)
const APARATO_OTRO = "22222222-2222-4000-8000-000000000002";

interface Aparato {
    privada: CryptoKey;
    spki: string;
    huella: string;
    seq: number;
}

async function aparato(): Promise<Aparato> {
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    return { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))!, seq: 0 };
}

let reloj = Date.parse("2026-11-14T20:00:00Z");
let nonceN = 0;

async function firmar(a: Aparato, accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}, firmante?: Aparato) {
    a.seq += 1;
    const carga: CargaOrden = {
        aud: AUD_CONTROL,
        v: 1,
        de: a.huella,
        cuenta: CUENTA,
        para: NEURONA_MAC,
        nivel: "controlar",
        sesion: null,
        seq: a.seq,
        nonce: `nonce-de-prueba-${String(++nonceN).padStart(6, "0")}`,
        t: new Date(reloj).toISOString(),
        caduca: new Date(reloj + 60_000).toISOString(),
        accion: { nombre: accion, args },
        ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, (firmante ?? a).privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

let permiso: PermisoControl;
let lineas: string[];
let ejecutadas: string[];
let puerta: PuertaControl;
let controlador: Aparato;

async function nuevaPuerta() {
    lineas = [];
    ejecutadas = [];
    puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => CUENTA,
        neuronaPropia: () => NEURONA_MAC,
        huellaAparatoPropia: () => APARATO_RECEPTOR,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => { permiso = p; },
        ejecutar: async (nombre) => {
            ejecutadas.push(nombre);
            if (nombre === "leer-estado") return { ruta: "/mensajes" };
            return { hecho: true };
        },
        anotar: (l) => lineas.push(l),
        azarHex: () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        nativo: {
            disponible: () => true,
            abrir: async () => ({ ok: true, token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
            orden: async () => ({ ok: true }),
            anotar: () => undefined,
            parar: async () => undefined,
        } as never,
    });
}

describe("CTL1126E · control entre aparatos de la misma neurona", () => {
    beforeEach(async () => {
        reloj = Date.parse("2026-11-14T20:00:00Z");
        permiso = permisoDeFabrica();
        controlador = await aparato();
        await nuevaPuerta();
    });

    it("CTL1126E · rechaza presentarse a otro aparato de la misma neurona con motivo 'otro-aparato'", async () => {
        const r = await puerta.recibir(await firmar(controlador, "presentarse", {
            spki: controlador.spki,
            nombre: "Mac Controlador",
            neurona: NEURONA_MAC,
            aparato: APARATO_OTRO,
        }));
        expect(r.motivo).toBe("otro-aparato");
    });

    it("CTL1126E · acepta presentarse sin especificar aparato", async () => {
        const r = await puerta.recibir(await firmar(controlador, "presentarse", {
            spki: controlador.spki,
            nombre: "Mac Controlador",
            neurona: NEURONA_MAC,
        }));
        expect(r.motivo).toBe("pendiente");
    });

    it("CTL1126E · acepta presentarse al aparato correcto", async () => {
        const r = await puerta.recibir(await firmar(controlador, "presentarse", {
            spki: controlador.spki,
            nombre: "Mac Controlador",
            neurona: NEURONA_MAC,
            aparato: APARATO_RECEPTOR,
        }));
        expect(r.motivo).toBe("pendiente");
    });

    it("CTL1126E · rechaza abrir-sesion a otro aparato con motivo 'otro-aparato'", async () => {
        const r1 = await puerta.recibir(await firmar(controlador, "presentarse", {
            spki: controlador.spki,
            nombre: "Mac Controlador",
            neurona: NEURONA_MAC,
        }));
        expect(r1.motivo).toBe("pendiente");
        permiso = { ...aceptarPendiente(permiso, controlador.huella), encendido: true, nivel: "controlar" };

        // El aparato está en los args, no en la carga directamente
        const r2 = await puerta.recibir(await firmar(controlador, "abrir-sesion", {
            aparato: APARATO_OTRO,
        }, {
            sesion: null,
            nivel: "controlar",
        }));
        expect(r2.motivo).toBe("otro-aparato");
    });

    it("CTL1126E · acepta abrir-sesion al aparato correcto", async () => {
        const r1 = await puerta.recibir(await firmar(controlador, "presentarse", {
            spki: controlador.spki,
            nombre: "Mac Controlador",
            neurona: NEURONA_MAC,
        }));
        permiso = { ...aceptarPendiente(permiso, controlador.huella), encendido: true, nivel: "controlar" };

        const r2 = await puerta.recibir(await firmar(controlador, "abrir-sesion", {
            aparato: APARATO_RECEPTOR,
        }, {
            sesion: null,
            nivel: "controlar",
        }));
        expect(r2.ok).toBe(true);
    });

    it("CTL1126E · el motivo 'otro-aparato' no reabre la sesión sola", () => {
        const motivo = "otro-aparato";
        expect(motivo).toBe(MOTIVO_OTRO_APARATO);
        expect(noReabreSola(motivo)).toBe(true);
    });
});