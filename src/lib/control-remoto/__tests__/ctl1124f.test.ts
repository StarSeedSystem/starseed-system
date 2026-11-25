/**
 * CTL1124F · El controlador no reabre solo: «Terminar control» termina de verdad
 * Pruebas de lógica pura para:
 * - terminarToken / terminar / terminarSaliente en RegistroSesiones
 * - terminadoPor en PuertaControl impide reapertura automática de ÓRDENES (no abrir-sesion manual)
 * - funciones puras de límites y opciones de control
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import {
    PuertaControl,
    aceptarPendiente,
    permisoDeFabrica,
    type PermisoControl,
    MOTIVO_TERMINADO,
    esTerminarDeLaPersona,
    finDeLimite,
    duracionDeLimite,
    limiteNormalizado,
    restanteDeSesion,
    filtroPorAmbito,
    type LimiteSesion,
    type FiltroPermisos,
    type AmbitoControl,
} from "../sesion";
import { RegistroSesiones } from "../registro-sesiones";
import {
    opcionesPara,
    opcionInicial,
    finElegido,
    textoRestante,
    topeMinimos,
    type OpcionLimite,
    type ResultadoLimite,
} from "@/components/control-remoto/banda-control";

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

async function crearAparato(): Promise<Aparato> {
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    return { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))!, seq: 0 };
}

async function firmar(a: Aparato, accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    a.seq += 1;
    const reloj = Date.parse("2026-11-24T10:00:00Z");
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: a.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: a.seq,
        nonce: `nonce-ctl1124f-${a.huella.slice(0, 8)}-${a.seq}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, a.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

let reloj: number;
let nativoDice: { ok: boolean; token?: string; motivo?: string };
let paradas: Array<{ motivo: string; token?: string }>;
let abiertas: { nombre: string }[];
let anotadas: string[];
let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: Aparato;
let linux: Aparato;

async function nuevaPuerta(cuentaPropia = CUENTA, nativoPropio: Record<string, unknown> = {}) {
    reloj = Date.parse("2026-11-24T10:00:00Z");
    nativoDice = { ok: true };
    paradas = [];
    abiertas = [];
    anotadas = [];
    permiso = permisoDeFabrica();
    let n = 0;
    puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => cuentaPropia,
        neuronaPropia: () => TABLETA,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => { permiso = p; },
        ejecutar: async (nombre) => {
            anotadas.push(nombre);
            if (nombre === "leer-estado") return { ruta: "/mensajes" };
            return { hecho: true };
        },
        anotar: (l) => anotadas.push(l),
        azarHex: () => (++n).toString(16).padStart(32, "0"),
        nativo: {
            disponible: () => true,
            abrir: async (_de: string, nombre: string) => { abiertas.push({ nombre }); return { ok: true, token: (++n).toString(16).padStart(32, "0") }; },
            orden: async () => nativoDice,
            anotar: () => undefined,
            parar: async (m: string, token?: string) => void paradas.push({ motivo: m, token }),
            ...nativoPropio,
        } as never,
    });
}

async function emparejar(nivel: "ver" | "controlar" = "controlar") {
    await puerta.recibir(await firmar(mac, "presentarse", { spki: mac.spki, nombre: "Mac", neurona: NEURONA_MAC }));
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel };
}

async function abrirSesion(aparato: Aparato = mac): Promise<string> {
    const r = await puerta.recibir(await firmar(aparato, "abrir-sesion"));
    expect(r.ok).toBe(true);
    return (r.resultado as { sesion: string }).sesion;
}

beforeEach(async () => {
    mac = await crearAparato();
    linux = await crearAparato();
    await nuevaPuerta();
});

describe("CTL1124F · terminarToken y terminadoPor impiden reapertura automática de órdenes", () => {
    it("terminarToken añade el controlador a terminadoPor y rechaza nuevas ÓRDENES con parada-nativa:terminado-por-el-dueno", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        expect(puerta.sesionActiva()).not.toBeNull();

        puerta.terminarToken(sesion);
        expect(puerta.sesionActiva()).toBeNull();

        // Las órdenes siguientes (no abrir-sesion) son rechazadas
        const r = await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion }));
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("parada-nativa");
        expect((r.resultado as { detalle: { motivo: string } }).detalle.motivo).toBe(MOTIVO_TERMINADO);
    });

    it("terminar (todas las sesiones) añade todos los controladores a terminadoPor", async () => {
        await emparejar();
        // Presentar linux ANTES de encender el permiso para evitar problemas de orden
        await puerta.recibir(await firmar(linux, "presentarse", { spki: linux.spki, nombre: "Linux", neurona: "aaaa0000-0000-4000-8000-000000000002" }));
        permiso = { ...aceptarPendiente(permiso, linux.huella), encendido: true, nivel: "controlar" };

        const sMac = await abrirSesion(mac);
        // Avanzar reloj ligeramente para evitar rate limit en linux
        reloj += 1000;
        const sLinux = await abrirSesion(linux);
        expect(puerta.sesionesActivas()).toHaveLength(2);

        puerta.terminar();
        expect(puerta.sesionesActivas()).toHaveLength(0);

        // Órdenes de ambos controladores son rechazadas
        const rMac = await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion: sMac }));
        const rLinux = await puerta.recibir(await firmar(linux, "leer-estado", {}, { sesion: sLinux }));
        expect(rMac.motivo).toBe("parada-nativa");
        expect((rMac.resultado as { detalle: { motivo: string } }).detalle.motivo).toBe(MOTIVO_TERMINADO);
        expect(rLinux.motivo).toBe("parada-nativa");
        expect((rLinux.resultado as { detalle: { motivo: string } }).detalle.motivo).toBe(MOTIVO_TERMINADO);
    });

    it("una abrir-sesion manual (persona vuelve a abrir) borra la marca de terminadoPor y crea nueva sesión", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        puerta.terminarToken(sesion);

        // abrir-sesion manual (persona pulsa botón) SÍ funciona y borra la marca
        const nueva = await abrirSesion();
        expect(nueva).not.toBe(sesion);
        expect(await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion: nueva }))).toMatchObject({ ok: true });
    });
});

describe("CTL1124F · RegistroSesiones.terminar corta sesión saliente y notifica", () => {
    it("terminar elimina la sesión, manda pantalla-parar y cerrar-sesion, y avisa a oyentes", async () => {
        let t = 1000;
        const reg = new RegistroSesiones(() => ++t, async () => undefined);
        const oyente = vi.fn();
        reg.suscribir(oyente);

        const enviadas: string[] = [];
        const mandar = vi.fn(async (nombre: string) => {
            enviadas.push(nombre);
            return { tipo: "respuesta" as const, nonce: "", ok: true, motivo: "ok", resultado: { sesion: "tok-saliente-1234", nivel: "controlar" } };
        });

        await reg.abrir("n1", mandar);
        await reg.abrir("n1", mandar); // fuertes = 2
        expect(reg.sesionesSalientes()).toHaveLength(1);

        const ok = await reg.terminar("N1", mandar);
        expect(ok).toBe(true);
        expect(reg.sesionesSalientes()).toEqual([]);
        expect(enviadas).toEqual(["abrir-sesion", "pantalla-parar", "cerrar-sesion"]);
        expect(oyente).toHaveBeenCalled();
    });

    it("terminar en neurona sin sesión devuelve false", async () => {
        let t = 1000;
        const reg = new RegistroSesiones(() => ++t, async () => undefined);
        const mandar = vi.fn(async () => ({ tipo: "respuesta" as const, nonce: "", ok: true, motivo: "ok" }));
        expect(await reg.terminar("n2", mandar)).toBe(false);
    });
});

describe("CTL1124F · esTerminarDeLaPersona detecta motivos de terminación por la persona", () => {
    it("reconoce terminado-por-el-dueno y motivos nativos de la persona", () => {
        expect(esTerminarDeLaPersona("terminado-por-el-dueno")).toBe(true);
        expect(esTerminarDeLaPersona("la-persona-desde-el-indicador")).toBe(true);
        expect(esTerminarDeLaPersona("la-persona-desde-la-notificacion")).toBe(true);
        expect(esTerminarDeLaPersona("la-persona-desde-la-superposicion")).toBe(true);
    });

    it("no reconoce otros motivos como terminación por la persona", () => {
        expect(esTerminarDeLaPersona("caducada")).toBe(false);
        expect(esTerminarDeLaPersona("sin-sesion")).toBe(false);
        expect(esTerminarDeLaPersona("permiso-apagado")).toBe(false);
        expect(esTerminarDeLaPersona("revocado")).toBe(false);
        expect(esTerminarDeLaPersona("a-mano")).toBe(false);
    });
});

describe("CTL1124F · funciones puras de límites de sesión", () => {
    it("finDeLimite devuelve null para sin-limite", () => {
        expect(finDeLimite({ tipo: "sin-limite" }, 1000)).toBeNull();
        expect(finDeLimite(null, 1000)).toBeNull();
        expect(finDeLimite(undefined, 1000)).toBeNull();
    });

    it("finDeLimite calcula fin correcto para minutos y hasta", () => {
        expect(finDeLimite({ tipo: "minutos", minutos: 15 }, 1000)).toBe(1000 + 15 * 60_000);
        const finHasta = finDeLimite({ tipo: "hasta", hora: "14:30" }, Date.parse("2026-11-24T10:00:00Z"));
        expect(finHasta).toBeGreaterThan(Date.parse("2026-11-24T10:00:00Z"));
    });

    it("duracionDeLimite devuelve ms para minutos, null para sin-limite", () => {
        expect(duracionDeLimite({ tipo: "minutos", minutos: 15 }, 0)).toBe(15 * 60_000);
        expect(duracionDeLimite({ tipo: "sin-limite" }, 0)).toBeNull();
    });

    it("limiteNormalizado recorta al máximo del filtro", () => {
        const filtro: FiltroPermisos = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 60 } };
        const ahora = Date.now();
        expect(limiteNormalizado({ tipo: "sin-limite" }, filtro, ahora)).toEqual({ tipo: "minutos", minutos: 60 });
        expect(limiteNormalizado({ tipo: "minutos", minutos: 120 }, filtro, ahora)).toEqual({ tipo: "minutos", minutos: 60 });
        expect(limiteNormalizado({ tipo: "minutos", minutos: 30 }, filtro, ahora)).toEqual({ tipo: "minutos", minutos: 30 });
    });

    it("restanteDeSesion devuelve ms restantes o null", () => {
        const ahora = Date.now();
        expect(restanteDeSesion({ fin: ahora + 60_000 }, ahora)).toBe(60_000);
        expect(restanteDeSesion({ fin: null }, ahora)).toBeNull();
        expect(restanteDeSesion({ fin: undefined }, ahora)).toBeNull();
    });
});

describe("CTL1124F · filtroPorAmbito y opciones de límite", () => {
    it("filtroPorAmbito devuelve filtros correctos por ámbito", () => {
        expect(filtroPorAmbito("propia")).toEqual({ porDefecto: { tipo: "sin-limite" }, maximo: { tipo: "sin-limite" } });
        expect(filtroPorAmbito("otra-cuenta")).toEqual({ porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 60 } });
        expect(filtroPorAmbito("publica")).toEqual({ porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 15 } });
    });

    it("opcionesPara devuelve opciones permitidas según ámbito y tope", () => {
        expect(opcionesPara(true, null)).toEqual(["sin-limite", "15-min", "1-hora", "hasta"]);
        expect(opcionesPara(false, null)).toEqual(["sin-limite", "15-min", "1-hora", "hasta"]);
        expect(opcionesPara(false, 15)).toEqual(["15-min", "hasta"]);
        expect(opcionesPara(false, 60)).toEqual(["15-min", "1-hora", "hasta"]);
    });

    it("opcionInicial devuelve defecto correcto", () => {
        expect(opcionInicial(true, null)).toBe("sin-limite");
        expect(opcionInicial(false, 15)).toBe("15-min");
        expect(opcionInicial(false, null)).toBe("15-min");
    });

    it("finElegido valida y convierte opción a fin absoluto", () => {
        const ahora = Date.parse("2026-11-24T10:00:00Z");
        expect(finElegido("sin-limite", "", ahora, null, true)).toEqual({ ok: true, fin: null });
        expect(finElegido("sin-limite", "", ahora, 15, false)).toEqual({ ok: false, motivo: "El dueño no permite dejar el control sin límite." });
        expect(finElegido("15-min", "", ahora, null, true)).toEqual({ ok: true, fin: ahora + 15 * 60_000 });
        expect(finElegido("1-hora", "", ahora, 15, false)).toEqual({ ok: false, motivo: "El dueño permite como máximo 15 minutos." });
        expect(finElegido("hasta", "14:30", ahora, null, true)).toEqual({ ok: true, fin: Date.parse("2026-11-24T14:30:00Z") });
        expect(finElegido("hasta", "11:30", ahora, 90, false)).toEqual({ ok: true, fin: Date.parse("2026-11-24T11:30:00Z") });
        expect(finElegido("hasta", "invalid", ahora, null, true)).toEqual({ ok: false, motivo: "Escribe la hora como HH:MM." });
    });

    it("textoRestante formatea tiempo restante correctamente", () => {
        const ahora = Date.now();
        expect(textoRestante(null, ahora)).toBeNull();
        expect(textoRestante(undefined, ahora)).toBeNull();
        expect(textoRestante(ahora + 30 * 60_000, ahora)).toBe("Quedan 30 min");
        expect(textoRestante(ahora + 90 * 60_000, ahora)).toMatch(/Hasta las .* · quedan 1 h/);
        expect(textoRestante(ahora, ahora)).toBe("Límite alcanzado");
    });

    it("topeMinimos devuelve tope según datos del dueño y cuenta propia", () => {
        expect(topeMinimos({ cuenta: "misma" }, "misma")).toBeNull();
        expect(topeMinimos({ cuenta: "otra", filtro: { maxMin: 30 } }, "misma")).toBe(30);
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 45 }, "misma")).toBe(45);
        expect(topeMinimos({ publico: true }, "misma")).toBe(15);
        expect(topeMinimos({ visibilidad: "publica" }, "misma")).toBe(15);
        expect(topeMinimos({ visibilidad: "público" }, "misma")).toBe(15);
        expect(topeMinimos({}, "misma")).toBeNull();
    });
});