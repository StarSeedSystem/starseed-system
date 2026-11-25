/**
 * CTL1124F · «Terminar control» termina de verdad: comprobar si te aceptaron es una LECTURA sin sesión y,
 * tras una parada terminal, nada reabre la sesión sola hasta que una persona vuelva a pedir el control.
 */
import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import {
    PuertaControl,
    esLecturaSinSesion,
    noReabreSola,
    permisoDeFabrica,
    type PermisoControl,
} from "../sesion";
import { puedeAbrirSesion } from "../auto-enlace";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const OBJETIVO = "cccc0001-0000-4000-8000-000000000001";
const AHORA = Date.parse("2026-11-24T22:41:30Z");

async function crearControlador(id: string) {
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    const huella = (await huellaDeSpki(subtle, spki))!;
    let seq = 0;
    const firmar = async (accion: string, o: Partial<CargaOrden> = {}) => {
        const carga: CargaOrden = {
            aud: AUD_CONTROL,
            v: 1,
            de: huella,
            cuenta: CUENTA,
            para: OBJETIVO,
            nivel: "ver",
            sesion: null,
            seq: ++seq,
            nonce: `nonce-${id}-${seq}-${Math.random().toString(36).slice(2)}`,
            t: new Date(AHORA).toISOString(),
            caduca: new Date(AHORA + 60_000).toISOString(),
            accion: { nombre: accion, args: {} },
            ...o,
        };
        const bytes = new TextEncoder().encode(JSON.stringify(carga));
        const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, bytes));
        return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
    };
    return { huella, spki, firmar };
}

function crearPuerta(controladores: PermisoControl["controladores"]) {
    let permiso: PermisoControl = { ...permisoDeFabrica(), encendido: true, nivel: "controlar", controladores };
    const ejecutadas: string[] = [];
    const puerta = new PuertaControl({
        subtle,
        ahora: () => AHORA,
        cuentaPropia: () => CUENTA,
        neuronaPropia: () => OBJETIVO,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => void (permiso = p),
        ejecutar: async (nombre) => {
            ejecutadas.push(nombre);
            return { visto: true };
        },
        anotar: () => undefined,
        azarHex: () => "d".repeat(32),
        nativo: {
            disponible: () => true,
            abrir: async () => ({ ok: true, token: "e".repeat(32) }),
            orden: async () => ({ ok: true }),
            anotar: () => undefined,
            parar: async () => undefined,
        } as never,
    });
    return { puerta, ejecutadas, permiso: () => permiso };
}

describe("CTL1124F · reglas puras", () => {
    it("solo «leer-estado» se atiende sin sesión", () => {
        expect(esLecturaSinSesion("leer-estado")).toBe(true);
        for (const otra of ["abrir-sesion", "cerrar-sesion", "leer-aparato", "llamar", "gesto"]) {
            expect(esLecturaSinSesion(otra)).toBe(false);
        }
    });

    it("las paradas terminales no se reabren solas", () => {
        for (const motivo of ["parada-nativa", "terminado-por-el-dueno", "limite-cumplido", "permiso-apagado", "no-autorizado", "otro-destino"]) {
            expect(noReabreSola(motivo)).toBe(true);
        }
        for (const motivo of ["sin-sesion", "sesion-caducada", "repetida", "limite", "ok"]) {
            expect(noReabreSola(motivo)).toBe(false);
        }
    });

    it("solo una pulsación de la persona reabre tras una parada terminal", () => {
        expect(puedeAbrirSesion("persona", true)).toBe(true);
        expect(puedeAbrirSesion("persona", false)).toBe(true);
        expect(puedeAbrirSesion("automatico", false)).toBe(true);
        expect(puedeAbrirSesion("automatico", true)).toBe(false);
    });
});

describe("CTL1124F · comprobar si te aceptaron no abre sesión", () => {
    it("un controlador aceptado lee sin sesión y no queda ninguna sesión abierta", async () => {
        const mac = await crearControlador("mac");
        const { puerta, ejecutadas } = crearPuerta([{ huella: mac.huella, spki: mac.spki, cuenta: CUENTA, nombre: "MaggaBook", neurona: "aaaa0000-0000-4000-8000-000000000001", desde: new Date(AHORA).toISOString() }]);

        const r = await puerta.recibir(await mac.firmar("leer-estado"));
        expect(r).toMatchObject({ ok: true, motivo: "ok" });
        expect(ejecutadas).toEqual(["leer-estado"]);
        expect(puerta.sesionesActivas()).toHaveLength(0);
    });

    it("tras «Terminar» la lectura sigue diciendo que te aceptó, pero no revive la sesión", async () => {
        const mac = await crearControlador("mac");
        const { puerta } = crearPuerta([{ huella: mac.huella, spki: mac.spki, cuenta: CUENTA, nombre: "MaggaBook", neurona: "aaaa0000-0000-4000-8000-000000000001", desde: new Date(AHORA).toISOString() }]);

        expect((await puerta.recibir(await mac.firmar("abrir-sesion"))).ok).toBe(true);
        expect(puerta.sesionesActivas()).toHaveLength(1);
        puerta.terminar();
        expect(puerta.sesionesActivas()).toHaveLength(0);

        const lectura = await puerta.recibir(await mac.firmar("leer-estado"));
        expect(lectura).toMatchObject({ ok: true, motivo: "ok" });
        expect(puerta.sesionesActivas()).toHaveLength(0);
    });

    it("sin estar aceptado, la lectura sin sesión se rechaza igual", async () => {
        const mac = await crearControlador("mac");
        const linux = await crearControlador("linux");
        const { puerta } = crearPuerta([{ huella: mac.huella, spki: mac.spki, cuenta: CUENTA, nombre: "MaggaBook", neurona: "aaaa0000-0000-4000-8000-000000000001", desde: new Date(AHORA).toISOString() }]);

        const r = await puerta.recibir(await linux.firmar("leer-estado"));
        expect(r).toMatchObject({ ok: false, motivo: "no-autorizado" });
        expect(puerta.sesionesActivas()).toHaveLength(0);
    });
});
