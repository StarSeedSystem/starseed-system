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
 * ORD1114Q: el cuerpo viaja SELLADO de punta a punta (`sellado.ts`, la capa de `CanalSellado`): la orden
 * dentro de un sobre v:3 para la pública de cifrado de la neurona destino y la respuesta con la clave de un
 * solo uso que trajo la orden. Sin clave del destino no se manda nada (nunca en claro). `enviarMensaje` elige
 * el mejor enlace vivo (P2P directo primero); el relé solo ve cuerpos sellados. La sesión, el indicador, la
 * parada y el registro encadenado son del lado nativo (`nativo.ts`).
 */

import { CANAL_CONTROL, AUD_CONTROL, VIDA_ORDEN_MS, esRespuesta, leerOrden, type RespuestaOrden } from "./orden";
import { PuertaControl, sanearPermiso, type PermisoControl } from "./sesion";
import type { Args, Nivel } from "./niveles";
import { abrirRespuesta, esRespuestaSellada, sellarOrden, sellarRespuesta } from "./sellado"; // ORD1114Q
import { alPararNativo, puenteNativoControl } from "./nativo"; // ORD1114Q
import { RegistroSesiones, registroGlobal, type MandarSesion } from "./registro-sesiones"; // CTL1117A

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
    // ORD1114T: al ENCENDERLO, el lado nativo pide lo suyo (Android: diálogo nativo y permisos del sistema).
    let antes = false;
    try {
        antes = (JSON.parse(window.localStorage.getItem(CLAVE_PERMISO) ?? "null") as { encendido?: boolean } | null)?.encendido === true;
    } catch {
        /* sin almacenamiento */
    }
    if (p.encendido && !antes) void import("./nativo").then((m) => m.prepararIndicadorNativo());
    // ORD1114V: al APAGARLO, el interruptor nativo se apaga al instante (sin diálogo); encenderlo solo lo pide.
    if (!p.encendido && antes) void import("./nativo").then((m) => m.apagarInterruptorNativo());
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
let quitarParada: (() => void) | null = null; // ORD1114Q
let quitarVigia: (() => void) | null = null; // ORD1114Q
/** nonce → (clave de respuesta, quién la espera). Solo se acepta la respuesta sellada con esa clave. */
const esperando = new Map<string, { kr: Uint8Array; resolver: (r: RespuestaOrden) => void }>();

/** La puerta de este aparato (para la banda: sesión activa y revocar). */
export function puertaControl(): PuertaControl | null {
    return puerta;
}

/** Arranca el canal en este aparato (idempotente). Con el permiso apagado, la puerta lo rechaza todo. */
export async function iniciarCanalControl(): Promise<void> {
    if (puerta || typeof window === "undefined" || !globalThis.crypto?.subtle) return;
    await refrescarCuenta();
    const yo = await neuronaPropia();
    const nativo = await puenteNativoControl(); // ORD1114Q
    const { decryptEnvelopeFor } = await import("@/ai/astraura/mesh/recipient-crypto");
    puerta = new PuertaControl({
        subtle: crypto.subtle,
        ahora: () => Date.now(),
        cuentaPropia: () => cuentaCache,
        neuronaPropia: () => yo,
        leerPermiso: leerPermisoLocal,
        guardarPermiso: guardarPermisoLocal,
        ejecutar: async (nombre, args, _carga, sobre, sesion) => {
            const { ejecutarEnApp } = await import("./ejecutores");
            return ejecutarEnApp(nombre, args, { cuentaPropia: cuentaCache, sobre, sesion });
        },
        anotar,
        azarHex: () => azarHex(16),
        alCambiar: () => {
            avisarCambio();
            void import("./pantalla-origen").then((m) => m.revisarOrigen()).catch(() => undefined); // PAN1115J: sesión cerrada → la pantalla para
        },
        nativo,
        abrirSobre: decryptEnvelopeFor,
    });
    void import("./pantalla-origen").then((m) => m.registrarPuerta(puerta)).catch(() => undefined); // PAN1115J
    // ORD1114Q: la parada de Rust (indicador, caducidad) cierra también la sesión de la página.
    quitarParada = await alPararNativo((motivo) => puerta?.paradaNativa(motivo));
    // ORD1114Q: si la persona contesta o cuelga a mano durante una sesión, se para y quien manda lo sabe.
    if (nativo.disponible()) {
        const { vigilarLlamadas } = await import("@/lib/banco-llamadas/a-mano");
        quitarVigia = vigilarLlamadas((que) => {
            if (puerta?.sesionActiva()) puerta.intervencionLocal(que);
        });
    }
    const t = await import("@/lib/malla/transporte-universal");
    quitarOyente = t.alRecibirMensaje(CANAL_CONTROL, (m) => {
        const cuerpo = m.cuerpo;
        if (esRespuestaSellada(cuerpo)) {
            const e = esperando.get(cuerpo.n);
            if (!e) return;
            void abrirRespuesta(cuerpo, e.kr, cuerpo.n).then((r) => {
                if (!r) return; // manipulada o de otra clave: se ignora (la espera acaba en «sin-respuesta»)
                esperando.delete(cuerpo.n);
                e.resolver(r);
            });
            return;
        }
        if (esRespuesta(cuerpo)) return; // ORD1114Q: una respuesta en claro ya no vale (la pudo escribir un relé)
        void (async () => {
            const { respuesta: r, kr, orden } = await puerta!.recibirSellado(cuerpo);
            const o = leerOrden(orden);
            if (!o || !kr) return; // en claro, sello roto o sin forma: no se contesta (ya quedó en el registro)
            // Se contesta a la neurona fijada por el dueño (o a la que se presenta): nunca a quien diga el sobre.
            const p = leerPermisoLocal();
            const ctl = [...p.controladores, ...p.pendientes].find((x) => x.huella === o.carga.de);
            const a = o.carga.accion.args;
            const destino = ctl?.neurona ?? (o.carga.accion.nombre === "presentarse" && typeof a.neurona === "string" ? a.neurona : null);
            if (!destino) return;
            const sellada = await sellarRespuesta(r, kr);
            if (sellada) await t.enviarMensaje({ neuronDeviceId: destino }, CANAL_CONTROL, sellada).catch(() => undefined);
        })();
    });
}

export function pararCanalControl(): void {
    quitarOyente?.();
    quitarOyente = null;
    quitarParada?.();
    quitarParada = null;
    quitarVigia?.();
    quitarVigia = null;
    puerta = null;
    void import("./pantalla-origen").then((m) => m.registrarPuerta(null)).catch(() => undefined); // PAN1115J
}

// ── lado que manda ───────────────────────────────────────────────────────────────────────────

export interface OpcionesOrden {
    nivel?: Nivel;
    sesion?: string | null;
    esperaMs?: number;
}

/** (PAN1115J) Firma una orden con la clave de este aparato y devuelve el sobre `{ v, carga, firma }` (sin sellar ni mandar). */
export async function firmarSobre(cuenta: string, para: string, nombre: string, args: Args, o: OpcionesOrden, n: string): Promise<{ v: 1; carga: string; firma: string }> {
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
    return { v: 1 as const, carga: firmada.carga, firma: firmada.firma };
}

/** (PAN1115J) Nonce nuevo para una orden. */
export function nonceNuevo(): string {
    return nonce();
}

/** (PAN1115J) Firma una orden para mandarla por un canal de datos ya cifrado (la conexión de vídeo). Nunca lanza: null si no se pudo. */
export async function firmarParaCanalDirecto(para: string, nombre: string, args: Args, o: OpcionesOrden): Promise<{ sobre: { v: 1; carga: string; firma: string }; nonce: string } | null> {
    try {
        const cuenta = cuentaCache ?? (await refrescarCuenta());
        if (!cuenta) return null;
        const n = nonce();
        return { sobre: await firmarSobre(cuenta, para, nombre, args, o, n), nonce: n };
    } catch {
        return null;
    }
}

/** Firma y manda una orden a otra neurona de la cuenta; devuelve su respuesta. Nunca lanza. */
export async function mandarOrden(para: string, nombre: string, args: Args = {}, o: OpcionesOrden = {}): Promise<RespuestaOrden> {
    const n = nonce();
    try {
        if (!puerta) await iniciarCanalControl(); // necesitamos el oyente para recibir la respuesta
        const cuenta = cuentaCache ?? (await refrescarCuenta());
        if (!cuenta) return { tipo: "respuesta", nonce: n, ok: false, motivo: "sin-cuenta" };
        const sobre = await firmarSobre(cuenta, para, nombre, args, o, n);
        // ORD1114Q: sellada para la pública de cifrado del destino; sin ella no sale nada (nunca en claro).
        const [{ destinatariosReales }, { encryptEnvelopeFor }] = await Promise.all([import("@/lib/malla/archivo-seguro-real"), import("@/ai/astraura/mesh/recipient-crypto")]);
        const pub = (await destinatariosReales([para]))[0]?.pub ?? null;
        const sellado = await sellarOrden(sobre, pub, encryptEnvelopeFor);
        if (!sellado) return { tipo: "respuesta", nonce: n, ok: false, motivo: "sin-clave-cifrado" };
        const respuesta = new Promise<RespuestaOrden>((resolver) => {
            esperando.set(n, { kr: sellado.kr, resolver });
            setTimeout(() => {
                if (esperando.delete(n)) resolver({ tipo: "respuesta", nonce: n, ok: false, motivo: "sin-respuesta" });
            }, o.esperaMs ?? ESPERA_RESPUESTA_MS);
        });
        const t = await import("@/lib/malla/transporte-universal");
        const env = await (await import("./medio-estado")).enviarOrdenPorMedio(t, para, CANAL_CONTROL, sellado.mensaje); // CTL1117B: por el medio elegido
        if (!env.ok) {
            esperando.delete(n);
            return { tipo: "respuesta", nonce: n, ok: false, motivo: env.motivo === "medio-no-disponible" ? "medio-no-disponible" : "sin-enlace" };
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
    const r = await mandarOrden(para, "presentarse", { spki, nombre, neurona: await neuronaPropia() });
    registroGlobal.liberar(para); // CTL1117A · S3: tras presentarse, un «no-autorizado» anterior ya no frena el reintento
    return r;
}

/**
 * Una sesión hacia otra neurona: la abre si hace falta y la reabre una vez si caducó.
 * CTL1117A · S1/S2/S4: comparte la sesión con la ventana de control (`registroGlobal`): no manda una segunda
 * `abrir-sesion` si ya hay una viva o en vuelo, y su `cerrar` solo cierra si nadie más la usa.
 */
export class SesionHacia {
    private token: string | null = null;
    constructor(
        readonly para: string,
        private readonly mandar: typeof mandarOrden = mandarOrden,
        private readonly registro: RegistroSesiones = registroGlobal,
    ) {}

    private porAqui: MandarSesion = (nombre, args, o) => this.mandar(this.para, nombre, args, o);

    async abrir(forzar = false): Promise<RespuestaOrden> {
        const r = await this.registro.abrir(this.para, this.porAqui, { nivel: "controlar", debil: true, auto: true, forzar });
        this.token = r.ok ? ((r.resultado as { sesion?: string } | undefined)?.sesion ?? null) : null;
        return r;
    }

    async orden(nombre: string, args: Args = {}): Promise<RespuestaOrden> {
        if (!this.token) {
            const a = await this.abrir();
            if (!a.ok) return a;
        }
        let r = await this.mandar(this.para, nombre, args, { sesion: this.token });
        if (r.ok) this.registro.usada(this.para);
        if (!r.ok && (r.motivo === "sin-sesion" || r.motivo === "sesion-caducada")) {
            this.registro.olvidar(this.para, this.token);
            const a = await this.abrir(true);
            if (!a.ok) return a;
            r = await this.mandar(this.para, nombre, args, { sesion: this.token });
        }
        return r;
    }

    async cerrar(): Promise<void> {
        const t = this.token;
        this.token = null;
        if (t) await this.registro.soltar(this.para, t, this.porAqui, false);
    }
}
