/**
 * Control entre mis neuronas · el canal en la app (ORD1114P · contrato control-remoto-entre-neuronas
 * §2.1, §2.2 y §2.4; fase 1, solo órdenes dirigidas a la app).
 *
 * Lado controlado: `iniciarCanalControl()` escucha `transporte-universal` en el canal «control-neuronas»,
 * pasa cada orden por la puerta (`sesion.ts`) y contesta por el mismo canal. Lado que manda:
 * `mandarOrden` firma con la clave de este aparato (GEN1114) y espera la respuesta por su nonce. Un
 * aparato con una build sin este canal no tiene oyente: la orden se queda sin respuesta («sin-respuesta»)
 * y nada más cambia en él.
 *
 * Lo que este archivo NO hace (y dice el informe): no sella el cuerpo extremo a extremo (`CanalSellado`)
 * ni pone el indicador, la parada y el registro encadenado en Rust/Kotlin: eso es trabajo nativo.
 */

import { CANAL_CONTROL, AUD_CONTROL, VIDA_ORDEN_MS, esRespuesta, leerOrden, type RespuestaOrden } from "./orden";
import { PuertaControl, sanearPermiso, type PermisoControl } from "./sesion";
import type { Args, Nivel } from "./niveles";

export const CLAVE_PERMISO = "starseed.control-neuronas.v1";
export const ESPERA_RESPUESTA_MS = 15_000;
export const EVENTO_CAMBIO = "starseed:control-neuronas-cambio";

// ── permiso guardado en ESTE aparato ─────────────────────────────────────────────────────────

export function leerPermisoLocal(): PermisoControl {
    try {
        const t = typeof window !== "undefined" ? window.localStorage.getItem(CLAVE_PERMISO) : null;
        return sanearPermiso(t ? JSON.parse(t) : null);
    } catch {
        return sanearPermiso(null);
    }
}

export function guardarPermisoLocal(p: PermisoControl): void {
    try {
        window.localStorage.setItem(CLAVE_PERMISO, JSON.stringify(p));
    } catch {
        /* sin almacenamiento: el permiso sigue apagado al recargar, que es lo seguro */
    }
    avisarCambio();
}

function avisarCambio(): void {
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
    } catch {
        /* sin ventana */
    }
}

function azarHex(n = 16): string {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function nonce(): string {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cuentaCache: string | null = null;
async function refrescarCuenta(): Promise<string | null> {
    try {
        const { uidActual } = await import("@/lib/consumo/usuario");
        cuentaCache = await uidActual();
    } catch {
        /* sin sesión: la puerta rechaza «otra-cuenta» */
    }
    return cuentaCache;
}

async function neuronaPropia(): Promise<string> {
    const { thisDeviceId } = await import("@/lib/neurons/neurons");
    return thisDeviceId();
}

function anotar(linea: string): void {
    void import("@/lib/llamadas/voz-datos/diagnostico")
        .then((m) => m.anotarLlamada("banco", null, linea))
        .catch(() => undefined);
    try {
        console.info(`[control-neuronas] ${linea}`);
    } catch {
        /* nada */
    }
}

// ── lado controlado ──────────────────────────────────────────────────────────────────────────

let puerta: PuertaControl | null = null;
let quitarOyente: (() => void) | null = null;
const esperando = new Map<string, (r: RespuestaOrden) => void>();

/** La puerta de este aparato (para la banda: sesión activa y revocar). */
export function puertaControl(): PuertaControl | null {
    return puerta;
}

/** Arranca el canal en este aparato (idempotente). Con el permiso apagado, la puerta lo rechaza todo. */
export async function iniciarCanalControl(): Promise<void> {
    if (puerta || typeof window === "undefined" || !globalThis.crypto?.subtle) return;
    await refrescarCuenta();
    const yo = await neuronaPropia();
    puerta = new PuertaControl({
        subtle: crypto.subtle,
        ahora: () => Date.now(),
        cuentaPropia: () => cuentaCache,
        neuronaPropia: () => yo,
        leerPermiso: leerPermisoLocal,
        guardarPermiso: guardarPermisoLocal,
        ejecutar: async (nombre, args) => {
            const { ejecutarEnApp } = await import("./ejecutores");
            return ejecutarEnApp(nombre, args, { cuentaPropia: cuentaCache });
        },
        anotar,
        azarHex: () => azarHex(16),
        alCambiar: avisarCambio,
    });
    const t = await import("@/lib/malla/transporte-universal");
    quitarOyente = t.alRecibirMensaje(CANAL_CONTROL, (m) => {
        const cuerpo = m.cuerpo;
        if (esRespuesta(cuerpo)) {
            esperando.get(cuerpo.nonce)?.(cuerpo);
            esperando.delete(cuerpo.nonce);
            return;
        }
        void (async () => {
            const o = leerOrden(cuerpo);
            const r = await puerta!.recibir(cuerpo);
            if (!o) return; // sin forma no se sabe a quién contestar
            // Se contesta a la neurona fijada por el dueño (o a la que se presenta): nunca a quien diga el sobre.
            const p = leerPermisoLocal();
            const ctl = [...p.controladores, ...p.pendientes].find((x) => x.huella === o.carga.de);
            const a = o.carga.accion.args;
            const destino = ctl?.neurona ?? (o.carga.accion.nombre === "presentarse" && typeof a.neurona === "string" ? a.neurona : null);
            if (!destino) return;
            await t.enviarMensaje({ neuronDeviceId: destino }, CANAL_CONTROL, r).catch(() => undefined);
        })();
    });
}

export function pararCanalControl(): void {
    quitarOyente?.();
    quitarOyente = null;
    puerta = null;
}

// ── lado que manda ───────────────────────────────────────────────────────────────────────────

export interface OpcionesOrden {
    nivel?: Nivel;
    sesion?: string | null;
    esperaMs?: number;
}

/** Firma y manda una orden a otra neurona de la cuenta; devuelve su respuesta. Nunca lanza. */
export async function mandarOrden(para: string, nombre: string, args: Args = {}, o: OpcionesOrden = {}): Promise<RespuestaOrden> {
    const n = nonce();
    try {
        if (!puerta) await iniciarCanalControl(); // necesitamos el oyente para recibir la respuesta
        const cuenta = cuentaCache ?? (await refrescarCuenta());
        if (!cuenta) return { tipo: "respuesta", nonce: n, ok: false, motivo: "sin-cuenta" };
        const { firmarOrdenControl } = await import("@/lib/chats-genesis/firma-aparato");
        const ahora = Date.now();
        const firmada = await firmarOrdenControl(
            (b) => ({
                aud: AUD_CONTROL,
                v: 1,
                de: b.de,
                cuenta: b.cuenta,
                para,
                nivel: o.nivel ?? "controlar",
                sesion: o.sesion ?? null,
                seq: b.seq,
                nonce: n,
                t: new Date(ahora).toISOString(),
                caduca: new Date(ahora + VIDA_ORDEN_MS).toISOString(),
                accion: { nombre, args },
            }),
            { cuenta },
        );
        const sobre = { v: 1 as const, carga: firmada.carga, firma: firmada.firma };
        const respuesta = new Promise<RespuestaOrden>((resolver) => {
            esperando.set(n, resolver);
            setTimeout(() => {
                if (esperando.delete(n)) resolver({ tipo: "respuesta", nonce: n, ok: false, motivo: "sin-respuesta" });
            }, o.esperaMs ?? ESPERA_RESPUESTA_MS);
        });
        const t = await import("@/lib/malla/transporte-universal");
        const env = await t.enviarMensaje({ neuronDeviceId: para }, CANAL_CONTROL, sobre);
        if (!env.ok) {
            esperando.delete(n);
            return { tipo: "respuesta", nonce: n, ok: false, motivo: "sin-enlace" };
        }
        return await respuesta;
    } catch (e) {
        esperando.delete(n);
        const codigo = (e as { codigo?: string })?.codigo;
        return { tipo: "respuesta", nonce: n, ok: false, motivo: typeof codigo === "string" ? codigo : "fallo" };
    }
}

/** Pide al otro aparato que su dueño acepte este (queda «pendiente» allí; no concede nada). */
export async function presentarmeA(para: string, nombre: string): Promise<RespuestaOrden> {
    const { spkiDelAparato } = await import("@/lib/chats-genesis/firma-aparato");
    const spki = await spkiDelAparato();
    if (!spki) return { tipo: "respuesta", nonce: "", ok: false, motivo: "sin-aparato" };
    return mandarOrden(para, "presentarse", { spki, nombre, neurona: await neuronaPropia() });
}

/** Una sesión hacia otra neurona: la abre si hace falta y la reabre una vez si caducó. */
export class SesionHacia {
    private token: string | null = null;
    constructor(
        readonly para: string,
        private readonly mandar: typeof mandarOrden = mandarOrden,
    ) {}

    async abrir(): Promise<RespuestaOrden> {
        const r = await this.mandar(this.para, "abrir-sesion", {}, { nivel: "controlar" });
        this.token = r.ok ? ((r.resultado as { sesion?: string } | undefined)?.sesion ?? null) : null;
        return r;
    }

    async orden(nombre: string, args: Args = {}): Promise<RespuestaOrden> {
        if (!this.token) {
            const a = await this.abrir();
            if (!a.ok) return a;
        }
        let r = await this.mandar(this.para, nombre, args, { sesion: this.token });
        if (!r.ok && (r.motivo === "sin-sesion" || r.motivo === "sesion-caducada")) {
            const a = await this.abrir();
            if (!a.ok) return a;
            r = await this.mandar(this.para, nombre, args, { sesion: this.token });
        }
        return r;
    }

    async cerrar(): Promise<void> {
        if (this.token) await this.mandar(this.para, "cerrar-sesion", {}, { sesion: this.token, nivel: "ver" });
        this.token = null;
    }
}
