/**
 * CTL1119A · la sesión de control entre neuronas vive por LATIDOS, no por una hora máxima:
 * la neurona que controla manda uno firmado cada 10 s, cualquier orden (también la pantalla)
 * cuenta como actividad, la sesión solo cae tras 45 s sin latidos y se reabre sola dentro de
 * la misma aceptación. Si al aceptar se eligió un límite, ese límite manda y no se reabre.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import {
    PuertaControl,
    aceptarPendiente,
    filtroPorAmbito,
    finDeLimite,
    limiteNormalizado,
    permisoDeFabrica,
    restanteDeSesion,
    LATIDO_CADA_MS,
    SESION_INACTIVA_MS,
    SESION_MAX_MS,
    type LimiteSesion,
    type PermisoControl,
} from "../sesion";
import { palabrasLimite, palabrasMotivo, palabrasRestante } from "../palabras";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const NEURONA_MAC = "aaaa0000-0000-4000-8000-000000000001";

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

let reloj = Date.parse("2026-11-19T10:00:00Z");
let nonceN = 0;
let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: Aparato;

async function firmar(a: Aparato, accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    a.seq += 1;
    const carga: CargaOrden = {
        aud: AUD_CONTROL,
        v: 1,
        de: a.huella,
        cuenta: CUENTA,
        para: TABLETA,
        nivel: "controlar",
        sesion: null,
        seq: a.seq,
        nonce: `nonce-ctl1119a-${String(++nonceN).padStart(6, "0")}`,
        t: new Date(reloj).toISOString(),
        caduca: new Date(reloj + 60_000).toISOString(),
        accion: { nombre: accion, args },
        ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, a.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

function nuevaPuerta(): void {
    let n = 0;
    puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => CUENTA,
        neuronaPropia: () => TABLETA,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => {
            permiso = p;
        },
        ejecutar: async () => ({ hecho: true }),
        anotar: () => undefined,
        azarHex: () => (++n).toString(16).padStart(32, "0"),
        nativo: {
            disponible: () => true,
            abrir: async () => ({ ok: true, token: "a".repeat(32) }),
            orden: async () => ({ ok: true }),
            anotar: () => undefined,
            parar: async () => undefined,
        } as never,
    });
}

/** La Mac se presenta y el dueño la acepta con el límite y el ámbito que se digan. */
async function emparejar(limite?: LimiteSesion, ambito: "propia" | "otra-cuenta" | "publica" = "propia"): Promise<void> {
    await puerta.recibir(await firmar(mac, "presentarse", { spki: mac.spki, nombre: "Mac", neurona: NEURONA_MAC }));
    permiso = { ...aceptarPendiente(permiso, mac.huella, { ambito, limite, ahora: reloj }), encendido: true, nivel: "controlar" };
}

async function abrirSesion(): Promise<string> {
    const r = await puerta.recibir(await firmar(mac, "abrir-sesion"));
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    return (r.resultado as { sesion: string }).sesion;
}

/** Manda un latido firmado (la lectura que la ventana ya usa) y devuelve la respuesta. */
async function latir(sesion: string) {
    return puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion }));
}

beforeEach(async () => {
    reloj = Date.parse("2026-11-19T10:00:00Z");
    nonceN = 0;
    permiso = permisoDeFabrica();
    mac = await aparato();
    nuevaPuerta();
});

describe("latidos: la sesión no tiene hora máxima", () => {
    it("en una neurona propia y sin límite, vive más allá de la hora que antes la cortaba", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        const vueltas = Math.ceil((SESION_MAX_MS + 10 * 60_000) / LATIDO_CADA_MS);
        for (let i = 0; i < vueltas; i++) {
            reloj += LATIDO_CADA_MS;
            const r = await latir(sesion);
            expect(r.ok, `latido ${i}: ${r.motivo}`).toBe(true);
        }
        expect(puerta.sesionActiva()?.token).toBe(sesion);
        expect(restanteDeSesion({ fin: null }, reloj)).toBeNull();
    });

    it("cae solo tras 45 s sin latidos y se reabre sola dentro de la misma aceptación", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        reloj += SESION_INACTIVA_MS - 1_000;
        expect((await latir(sesion)).ok).toBe(true);
        reloj += SESION_INACTIVA_MS + 1_000;
        expect((await latir(sesion)).motivo).toBe("sesion-caducada");
        const reabierta = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        expect(reabierta).toMatchObject({ ok: true });
        expect(permiso.encendido).toBe(true);
        expect(permiso.controladores).toHaveLength(1);
        expect(permiso.pendientes).toHaveLength(0);
        const nueva = (reabierta.resultado as { sesion: string }).sesion;
        expect((await latir(nueva)).ok).toBe(true);
    });

    it("una orden cualquiera también cuenta como actividad", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        for (let i = 0; i < 4; i++) {
            reloj += SESION_INACTIVA_MS - 5_000;
            expect((await puerta.recibir(await firmar(mac, "leer-aparato", {}, { sesion }))).ok).toBe(true);
        }
        expect(puerta.sesionActiva()?.token).toBe(sesion);
    });
});

describe("límite de tiempo elegido al aceptar", () => {
    it("un límite de 15 min corta la sesión y no deja reabrirla sola, aunque el permiso siga encendido", async () => {
        await emparejar({ tipo: "minutos", minutos: 15 });
        const sesion = await abrirSesion();
        for (let i = 0; i < 89; i++) {
            reloj += LATIDO_CADA_MS;
            expect((await latir(sesion)).ok).toBe(true);
        }
        reloj += LATIDO_CADA_MS + 1_000;
        expect((await latir(sesion)).motivo).toBe("limite-cumplido");
        expect(await puerta.recibir(await firmar(mac, "abrir-sesion"))).toMatchObject({ ok: false, motivo: "limite-cumplido" });
        expect(permiso.encendido).toBe(true);
        expect(permiso.controladores).toHaveLength(1);
    });

    it("al abrir con límite se dice cuándo termina; sin límite no se inventa una hora", async () => {
        await emparejar({ tipo: "minutos", minutos: 15 });
        const conLimite = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        const caduca = Date.parse((conLimite.resultado as { caduca: string }).caduca);
        expect(caduca - reloj).toBe(15 * 60_000);
        expect(restanteDeSesion(puerta.sesionActiva()!, reloj)).toBe(15 * 60_000);
        puerta.terminar();
        permiso = {
            ...permiso,
            controladores: permiso.controladores.map((c) => ({ ...c, limite: { tipo: "sin-limite" as const }, aceptadoEn: new Date(reloj).toISOString() })),
        };
        const sinLimite = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        expect((sinLimite.resultado as { caduca?: string }).caduca).toBeUndefined();
        expect((sinLimite.resultado as { sinLimite?: boolean }).sinLimite).toBe(true);
    });
});

describe("límites por tipo de neurona", () => {
    const ahora = Date.parse("2026-11-19T10:00:00Z");

    it("propia: sin límite por defecto y sin techo", () => {
        const f = filtroPorAmbito("propia");
        expect(f.porDefecto).toEqual({ tipo: "sin-limite" });
        expect(f.maximo).toEqual({ tipo: "sin-limite" });
        expect(limiteNormalizado(null, f, ahora)).toEqual({ tipo: "sin-limite" });
        expect(limiteNormalizado({ tipo: "minutos", minutos: 600 }, f, ahora)).toEqual({ tipo: "minutos", minutos: 600 });
    });

    it("otra cuenta: 15 min por defecto y 1 h como máximo", () => {
        const f = filtroPorAmbito("otra-cuenta");
        expect(limiteNormalizado(undefined, f, ahora)).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteNormalizado({ tipo: "minutos", minutos: 120 }, f, ahora)).toEqual({ tipo: "minutos", minutos: 60 });
    });

    it("pública: el máximo del filtro público nunca se supera", () => {
        const f = filtroPorAmbito("publica");
        expect(limiteNormalizado(undefined, f, ahora)).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteNormalizado({ tipo: "sin-limite" }, f, ahora)).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteNormalizado({ tipo: "minutos", minutos: 60 }, f, ahora)).toEqual({ tipo: "minutos", minutos: 15 });
    });

    it("el filtro del dueño manda sobre los valores por defecto de su ámbito", () => {
        const f = filtroPorAmbito("publica", { porDefecto: { tipo: "minutos", minutos: 5 }, maximo: { tipo: "minutos", minutos: 30 } });
        expect(limiteNormalizado(undefined, f, ahora)).toEqual({ tipo: "minutos", minutos: 5 });
        expect(limiteNormalizado({ tipo: "minutos", minutos: 120 }, f, ahora)).toEqual({ tipo: "minutos", minutos: 30 });
    });

    it("«hasta las HH:MM» se resuelve a la próxima vez que sea esa hora y se recorta al máximo", () => {
        const base = new Date(2026, 10, 19, 10, 0, 0, 0).getTime();
        expect(finDeLimite({ tipo: "hasta", hora: "11:30" }, base)).toBe(new Date(2026, 10, 19, 11, 30, 0, 0).getTime());
        expect(finDeLimite({ tipo: "hasta", hora: "09:00" }, base)).toBe(new Date(2026, 10, 20, 9, 0, 0, 0).getTime());
        expect(limiteNormalizado({ tipo: "hasta", hora: "18:00" }, filtroPorAmbito("otra-cuenta"), base)).toEqual({ tipo: "minutos", minutos: 60 });
    });
});

describe("palabras del límite y de los latidos", () => {
    it("la caducidad ya no habla de 2 minutos ni de 1 hora: habla de los latidos", () => {
        const t = palabrasMotivo("sesion-caducada") ?? "";
        expect(t).toMatch(/latido/i);
        expect(t).not.toMatch(/2 minutos|1 hora/);
    });

    it("«limite-cumplido» dice que se cumplió el tiempo y que hace falta que la persona vuelva a aceptar", () => {
        const t = palabrasMotivo("limite-cumplido") ?? "";
        expect(t).toMatch(/tiempo/i);
        expect(t).toMatch(/aceptar/i);
    });

    it("las opciones y el tiempo restante se dicen en español llano", () => {
        expect(palabrasLimite({ tipo: "sin-limite" })).toBe("Sin límite de tiempo");
        expect(palabrasLimite({ tipo: "minutos", minutos: 15 })).toBe("15 minutos");
        expect(palabrasLimite({ tipo: "minutos", minutos: 60 })).toBe("1 hora");
        expect(palabrasLimite({ tipo: "hasta", hora: "21:30" })).toBe("Hasta las 21:30");
        expect(palabrasRestante(90_000)).toBe("Quedan 2 min");
        expect(palabrasRestante(3_600_000)).toBe("Queda 1 h");
        expect(palabrasRestante(null)).toBeUndefined();
    });

    it("el punto de color sabe cuánto queda y no inventa nada si no hay límite", () => {
        expect(restanteDeSesion({ fin: 1_000 }, 400)).toBe(600);
        expect(restanteDeSesion({ fin: null }, 400)).toBeNull();
        expect(restanteDeSesion({ fin: 100 }, 400)).toBe(0);
    });
});
