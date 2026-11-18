/**
 * CTL1118A · la cadena entera, sin fakes en el medio: el controlador real (`PantallaDestino` con su registro de sesiones)
 * firma y manda cada orden a la puerta real del aparato controlado (`PuertaControl`) por un canal en memoria. Tras una
 * `abrir-sesion` que sale bien, el controlador DEBE pedir la pantalla (`pantalla-iniciar`).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden, type RespuestaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { PantallaDestino, type DepsDestino } from "../pantalla-destino";
import { RegistroSesiones } from "../registro-sesiones";
import type { FuentePedida } from "../fuente-pantalla";
import type { Args } from "../niveles";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const NEURONA_MAC = "aaaa0000-0000-4000-8000-000000000001";

let reloj = Date.parse("2026-11-18T08:24:38Z");
let n = 0;
let permiso: PermisoControl;
let lineas: string[];
let ejecutadas: { nombre: string; args: Args }[];

async function montar(fuente?: FuentePedida) {
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    const huella = (await huellaDeSpki(subtle, spki))!;
    lineas = [];
    ejecutadas = [];
    permiso = permisoDeFabrica();
    const puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => CUENTA,
        neuronaPropia: () => TABLETA,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => {
            permiso = p;
        },
        ejecutar: async (nombre, args) => {
            ejecutadas.push({ nombre, args: args as Args });
            if (nombre === "pantalla-iniciar") return { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
            if (nombre === "leer-estado") return { ruta: "/mensajes" };
            return { hecho: true };
        },
        anotar: (l) => lineas.push(l),
        azarHex: () => (++n).toString(16).padStart(32, "0"),
        nativo: {
            disponible: () => true,
            abrir: async () => ({ ok: true, token: (++n).toString(16).padStart(32, "0") }),
            orden: async () => ({ ok: true }),
            anotar: () => undefined,
            parar: async () => undefined,
        } as never,
    });
    // La Mac se presenta y el dueño la acepta y enciende el permiso.
    let seq = 0;
    const firmar = async (accion: string, args: Args, nivel: string, sesion: string | null) => {
        const carga: CargaOrden = {
            aud: AUD_CONTROL, v: 1, de: huella, cuenta: CUENTA, para: TABLETA, nivel: nivel as CargaOrden["nivel"], sesion, seq: ++seq,
            nonce: `nonce-de-prueba-${String(++n).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(),
            accion: { nombre: accion, args },
        };
        const bytes = new TextEncoder().encode(JSON.stringify(carga));
        const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, bytes));
        return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
    };
    const pres = await puerta.recibir(await firmar("presentarse", { spki, nombre: "Mac", neurona: NEURONA_MAC }, "ver", null));
    expect(pres.motivo).toBe("pendiente");
    permiso = { ...aceptarPendiente(permiso, huella), encendido: true, nivel: "controlar" };

    const deps: DepsDestino = {
        registro: new RegistroSesiones(() => reloj),
        mandar: async (nombre, args, o): Promise<RespuestaOrden> => puerta.recibir(await firmar(nombre, args, o.nivel, o.sesion ?? null)),
        firmar: async () => null,
        iceServers: async () => [],
        crearPeer: () => {
            throw new Error("sin peer");
        },
        flujoDe: () => null,
        ahora: () => reloj,
    };
    return { destino: new PantallaDestino(TABLETA, deps, fuente), deps };
}

beforeEach(() => {
    reloj = Date.parse("2026-11-18T08:24:38Z");
});

describe("CTL1118A · tras abrir la sesión, el controlador pide la pantalla", () => {
    it("abrir-sesion ok → pantalla-iniciar llega a la puerta del aparato controlado", async () => {
        const { destino } = await montar();
        await destino.iniciar();
        const nombres = ejecutadas.map((e) => e.nombre);
        expect(lineas.some((l) => /^orden abrir-sesion .* resultado=ok/.test(l))).toBe(true);
        expect(nombres).toContain("pantalla-iniciar");
        expect(lineas.some((l) => /^orden pantalla-iniciar .* resultado=ok/.test(l))).toBe(true);
    });
});
