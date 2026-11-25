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
import { PuertaControl, sanearPermiso, LATIDO_CADA_MS, type PermisoControl } from "./sesion";
import type { Args, Nivel } from "./niveles";
import { abrirRespuesta, esRespuestaSellada, sellarOrden, sellarRespuesta } from "./sellado"; // ORD1114Q
import { alPararNativo, puenteNativoControl, capacidadesNativas, type CapacidadesNativas } from "./nativo"; // ORD1114Q
import { RegistroSesiones, registroGlobal, type MandarSesion, type SesionSaliente } from "./registro-sesiones"; // CTL1117A
import { MOTIVOS_TERMINALES } from "./palabras"; // CTL1124F
import { puenteNativo } from "@/lib/nativa/puente"; // CTL1119F

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
/**
 * CTL1118B: la cuenta de ESTE aparato se relee en cada orden (entra o sale). `uidActual` va con caché y sigue los cambios de
 * sesión, así que no cuesta red. Antes se leía una sola vez al arrancar el canal: un aparato que abría la app y LUEGO iniciaba
 * sesión (un nodo recién instalado) contestaba «otra-cuenta» a todo hasta reiniciar la app, y tras cambiar de cuenta seguía con la vieja.
 */
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

async function avisadorDePeticiones(): Promise<(p: import("./aviso-peticion").PeticionControl) => "si" | "ya"> {
    const [{ crearAvisador }, { SALIDAS_REALES, resolverLocal }] = await Promise.all([import("./aviso-peticion"), import("./aviso-peticion-salidas")]);
    return crearAvisador({ ahora: () => Date.now(), anotar, salidas: SALIDAS_REALES, resolver: resolverLocal });
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
        // CTL1117J · S3: la petición verificada de otra neurona se avisa a la persona (ventana, sistema y centro de notificaciones).
        avisarPeticion: await avisadorDePeticiones(),
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
            await refrescarCuenta(); // CTL1118B: la cuenta de ahora, no la del arranque
            if (!puerta) return;
            const { respuesta: r, kr, orden } = await puerta.recibirSellado(cuerpo);
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

/**
 * CTL1117I: «presentarse» y «abrir-sesion» llevan DENTRO de lo firmado el color público de esta neurona (`args.color`, `#rrggbb`
 * en minúsculas): así el aparato controlado dibuja el punto y los toques con el color de quien controla sin fiarse de nadie más.
 * Todas las rutas (canal, registro de sesiones, ventana, banco) pasan por aquí. Sin color guardado va el de su id. Si ya trae
 * uno propio (otra parte lo fijó) se respeta. Nunca lanza.
 */
async function conColorPropio(nombre: string, args: Args): Promise<Args> {
    if (nombre !== "presentarse" && nombre !== "abrir-sesion") return args;
    let salida = args;
    if (typeof salida.color !== "string") {
        try {
            const { colorPublicoPropio } = await import("@/lib/neurons/color-publico-ajuste");
            salida = { ...salida, color: colorPublicoPropio() };
        } catch {
            /* sin color: el aparato usa el de su id */
        }
    }
    // CTL1118G: el NOMBRE de esta neurona (el que la persona le puso) va dentro de lo firmado, en «presentarse» y en «abrir-sesion»:
    // el aparato controlado enseña el nombre entero y quien ya estaba aceptado con el nombre viejo lo pone al día sin aceptar de nuevo.
    if (typeof salida.nombre !== "string" || salida.nombre.trim() === "" || nombre === "presentarse") {
        try {
            const { nombreNeuronaPropia } = await import("./nombre-propio");
            const n = nombreNeuronaPropia();
            if (n) salida = { ...salida, nombre: n };
        } catch {
            /* sin nombre: «presentarse» lleva el que se le pasó y «abrir-sesion» va sin él */
        }
    }
    return salida;
}

/** (PAN1115J) Firma una orden con la clave de este aparato y devuelve el sobre `{ v, carga, firma }` (sin sellar ni mandar). */
export async function firmarSobre(cuenta: string, para: string, nombre: string, args: Args, o: OpcionesOrden, n: string): Promise<{ v: 1; carga: string; firma: string }> {
    args = await conColorPropio(nombre, args);
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
        const cuenta = await refrescarCuenta(); // CTL1118B
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
        const cuenta = await refrescarCuenta(); // CTL1118B
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

/** CTL1119E: Crea la clave del aparato (web o nativa) y pide control a la neurona destino.
 * Si el motivo es "sin-aparato", crea la clave automáticamente y reintenta presentarse.
 * Devuelve la respuesta final y un flag indicando si se creó la clave. */
export async function crearClaveYPedirControl(
    para: string,
    nombre: string,
    nombreAparato: string,
    cuenta: string
): Promise<{ respuesta: RespuestaOrden; claveCreada: boolean }> {
    const { crearClaveAparato, spkiDelAparato } = await import("@/lib/chats-genesis/firma-aparato");
    
    // Crear la clave (web o nativa según soporte)
    await crearClaveAparato(nombreAparato, cuenta);
    
    // Obtener el SPKI de la clave recién creada
    const spki = await spkiDelAparato();
    if (!spki) {
        return { respuesta: { tipo: "respuesta", nonce: "", ok: false, motivo: "sin-aparato" }, claveCreada: true };
    }
    
    // Reintentar presentarse
    const r = await mandarOrden(para, "presentarse", { spki, nombre, neurona: await neuronaPropia() });
    registroGlobal.liberar(para);
    return { respuesta: r, claveCreada: true };
}

/** CTL1124B · Sesiones salientes vivas hacia otras neuronas y su cierre directo sin revocar permisos. */
export type { SesionSaliente } from "./registro-sesiones";

export function sesionesSalientesActivas(): readonly SesionSaliente[] {
    return registroGlobal.sesionesSalientes();
}

export function suscribirSesionesSalientes(cb: () => void): () => void {
    return registroGlobal.suscribir(cb);
}

/** DIR1125B: las sesiones «hacia» vivas en esta página (las del banco): al terminar el control hay que parar también su latido. */
const sesionesHacia = new Set<SesionHacia>();

export async function terminarControlHacia(neurona: string): Promise<boolean> {
    const objetivo = neurona.trim().toLowerCase();
    if (!objetivo) return false;
    // DIR1125B: sin esto el latido de 10 s veía «sin-sesion» y la reabría sola a los pocos segundos (medido: 3–4 s).
    for (const s of sesionesHacia) if (s.para.toLowerCase() === objetivo) s.detener();
    const carril = registroGlobal.carrilDe(objetivo);
    const mandarEnCarril: MandarSesion = (nombre, args, o) => {
        const sig = carril.cola.then(
            () => mandarOrden(objetivo, nombre, args, o),
            () => mandarOrden(objetivo, nombre, args, o),
        );
        carril.cola = sig.catch(() => undefined);
        return sig;
    };
    return registroGlobal.terminar(objetivo, mandarEnCarril);
}

/**
 * Una sesión hacia otra neurona: la abre si hace falta y la reabre una vez si caducó.
 * CTL1117A · S1/S2/S4: comparte la sesión con la ventana de control (`registroGlobal`): no manda una segunda
 * `abrir-sesion` si ya hay una viva o en vuelo, y su `cerrar` solo cierra si nadie más la usa.
 */
export class SesionHacia {
    private token: string | null = null;
    /** CTL1119A: el latido firmado que mantiene viva la sesión aceptada (cada 10 s). */
    private latido: ReturnType<typeof setInterval> | null = null;
    /** CTL1119A: un cierre en curso no debe resucitar la sesión si un latido estaba en vuelo. */
    private cerrando = false;
    constructor(
        readonly para: string,
        private readonly mandar: typeof mandarOrden = mandarOrden,
        private readonly registro: RegistroSesiones = registroGlobal,
    ) {
        sesionesHacia.add(this);
    }

    private porAqui: MandarSesion = (nombre, args, o) => this.mandar(this.para, nombre, args, o);

    async abrir(forzar = false): Promise<RespuestaOrden> {
        const r = await this.registro.abrir(this.para, this.porAqui, { nivel: "controlar", debil: true, auto: true, forzar });
        const token = r.ok ? ((r.resultado as { sesion?: string } | undefined)?.sesion ?? null) : null;
        if (this.cerrando) {
            // CTL1119A: el cierre llegó mientras se abría; no se resucita la sesión, se suelta lo recién tomado.
            if (token) void this.registro.soltar(this.para, token, this.porAqui, false);
            return r;
        }
        this.token = token;
        if (this.token) this.arrancarLatido();
        else this.pararLatido();
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

    /**
     * CTL1119A: un latido firmado cada 10 s. Si la sesión ya no existe (45 s sin latidos), se reabre sola: la
     * aceptación sigue siendo la misma mientras el permiso siga encendido. Si el límite se cumplió, se para.
     */
    async latir(): Promise<boolean> {
        const t = this.token;
        if (!t || this.cerrando) return false;
        try {
            const r = await this.mandar(this.para, "leer-estado", {}, { nivel: "ver", sesion: t });
            if (this.cerrando || this.token !== t) return false; // CTL1119A: cerraron mientras el latido iba en vuelo
            if (r.ok) {
                this.registro.usada(this.para);
                return true;
            }
            if (r.motivo === "sin-sesion" || r.motivo === "sesion-caducada") {
                if (this.cerrando) return false;
                this.registro.olvidar(this.para, t);
                return (await this.abrir(true)).ok;
            }
            // CTL1124F: un motivo terminal (lo terminó la persona, quitaron la aceptación, se apagó el permiso…) no se
            // reintenta solo: el latido se para y la sesión no se resucita hasta que una persona vuelva a pedir control.
            if (r.motivo === "limite-cumplido" || MOTIVOS_TERMINALES.has(r.motivo)) this.pararLatido();
        } catch {
            /* un latido que falla no rompe nada: el siguiente lo reintenta */
        }
        return false;
    }

    private arrancarLatido(): void {
        if (this.latido !== null || typeof setInterval !== "function") return;
        this.latido = setInterval(() => void this.latir(), LATIDO_CADA_MS);
        (this.latido as unknown as { unref?: () => void }).unref?.();
    }

    private pararLatido(): void {
        if (this.latido === null) return;
        clearInterval(this.latido);
        this.latido = null;
    }

    /** DIR1125B: la persona terminó el control hacia esta neurona. Se suelta el token y el latido SIN mandar nada (la cierra quien llamó). */
    detener(): void {
        this.token = null;
        this.pararLatido();
    }

    /**
     * CTL1124F: mirar si la otra neurona nos tiene aceptados con una orden de LECTURA que no abre sesión (`leer-aceptado`).
     * Antes se abría una sesión y se cerraba (y el otro aparato llegaba a enseñar «X controla este aparato»); ahora no
     * hay sesión que abrir ni que cerrar, ni latido que pueda resucitarla. Si ya había una sesión tomada aquí, se deja igual.
     */
    async sondear(): Promise<RespuestaOrden> {
        return this.mandar(this.para, "leer-aceptado", {}, { nivel: "ver" });
    }

    async cerrar(): Promise<void> {
        this.cerrando = true;
        const t = this.token;
        this.token = null;
        this.pararLatido();
        try {
            if (t) await this.registro.soltar(this.para, t, this.porAqui, false);
        } finally {
            this.cerrando = false;
        }
    }
}

// ── origen estable: migración de puerto y clave del aparato (CTL1119F) ────────────────────────

export interface EstadoOrigenLocal {
    principal: number | null;
    ultimo_puerto: number | null;
    puertos_usados: number[];
    cambios: number;
    ultimo_rescate: string | null;
}

/** Llama al comando Tauri `origen_local_estado` para leer el estado del origen local. */
export async function leerEstadoOrigen(): Promise<EstadoOrigenLocal | null> {
    try {
        const p = puenteNativo();
        if (!p.disponible) return null;
        const r = await p.llamar("origen_local_estado");
        if (r.ok && r.valor) return r.valor as EstadoOrigenLocal;
    } catch {
        /* no disponible */
    }
    return null;
}

/** Registra un cambio de origen en el formato requerido: `origen cambio de=<de> a=<a> causa=<causa> migrado=<si|no>`. */
export function registrarCambioOrigen(de: number, a: number, causa: string, migrado: boolean): void {
    const linea = `origen cambio de=${de} a=${a} causa=${causa} migrado=${migrado ? "si" : "no"}`;
    anotar(linea);
}

/** Comprueba si la clave del aparato existe en el origen actual. */
export async function claveAparatoExiste(): Promise<boolean> {
    try {
        const { claveAparatoPerdida } = await import("@/lib/chats-genesis/firma-aparato");
        const perdida = await claveAparatoPerdida();
        return perdida === null;
    } catch {
        return false;
    }
}

/**
 * Inicia la migración de datos del origen anterior al actual.
 * Usa los comandos Tauri del rescate (`rescate_origen_exportar`, `rescate_origen_estado`, `rescate_origen_datos`, `rescate_origen_confirmar`).
 * Devuelve un resumen de lo migrado y lo que falló.
 */
export async function migrarDatosOrigen(
    origenAnterior: number,
    origenActual: number,
    avisar: (mensaje: string) => void
): Promise<{ migrado: string[]; fallido: string[]; resumen: string }> {
    const p = puenteNativo();
    if (!p.disponible) {
        return { migrado: [], fallido: ["sin-puente-nativo"], resumen: "Puente nativo no disponible" };
    }

    const migrado: string[] = [];
    const fallido: string[] = [];

    try {
        avisar(`Buscando datos en el puerto ${origenAnterior}…`);
        const exportar = await p.llamar("rescate_origen_exportar", { puerto: origenAnterior });
        if (!exportar.ok) {
            fallido.push(`exportar-${origenAnterior}`);
        } else {
            avisar(`Trayendo datos al puerto ${origenActual}…`);
            const importar = await p.llamar("rescate_origen_confirmar", { origen: origenActual, desde: origenAnterior });
            if (importar.ok) {
                migrado.push(`puerto-${origenAnterior}`);
            } else {
                fallido.push(`importar-${origenAnterior}`);
            }
        }
    } catch (e) {
        fallido.push(`excepcion-${origenAnterior}:${e instanceof Error ? e.message : String(e)}`);
    }

    const resumen = migrado.length
        ? `traído de ${migrado.join(", ")}`
        : `no se pudieron traer los datos de ${fallido.join(", ")}`;

    return { migrado, fallido, resumen };
}

/**
 * Crea una nueva clave del aparato (llama a `crearClaveAparato` de firma-aparato).
 * Para usar cuando la migración falló y la persona quiere recrear la clave.
 */
export async function recrearClaveAparato(nombre: string, cuenta: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const { crearClaveAparato } = await import("@/lib/chats-genesis/firma-aparato");
        await crearClaveAparato(nombre, cuenta);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Comprueba si WebRTC es utilizable en ESTE aparato (el que controla).
 * En Linux verifica también GStreamer (nice, webrtcbin) vía `capacidadesNativas`.
 * Devuelve `true` si hay WebRTC usable, `false` si falta (y deja la causa en `faltaWebRtc`).
 */
export async function comprobarWebRtcUtilizable(
    capsPrevias?: Awaited<ReturnType<typeof capacidadesNativas>> | null,
): Promise<{ usable: boolean; faltaWebRtc?: string; detalle?: string }> {
    const hayPeer = typeof RTCPeerConnection === "function";
    if (!hayPeer) {
        return { usable: false, faltaWebRtc: "webrtc-linux", detalle: "RTCPeerConnection no existe en este navegador" };
    }

    try {
        const caps = capsPrevias === undefined ? await capacidadesNativas() : capsPrevias;
        if (caps && caps.falta.includes("webrtc-linux")) {
            const detalle = caps.falta.filter((f) => f.startsWith("webrtc")).join(", ") || "faltan elementos de GStreamer";
            return { usable: false, faltaWebRtc: "webrtc-linux", detalle };
        }
    } catch {
        /* si falla la comprobación nativa, asumimos que WebRTC del navegador basta */
    }

    return { usable: true };
}

/**
 * Decide la vía de pantalla según capacidades de ambos lados.
 * - Si el controlador tiene WebRTC usable → "webrtc"
 * - Si no → "malla" (pantalla-cuadro)
 * Devuelve la vía elegida y la razón.
 */
export async function decidirViaPantalla(
    capsControlador: Awaited<ReturnType<typeof capacidadesNativas>> | null,
    capsControlado: unknown
): Promise<{ via: "webrtc" | "malla"; razon: string }> {
    if (capsControlado && typeof capsControlado === "object" && (capsControlado as { webrtc?: unknown }).webrtc === false) {
        return { via: "malla", razon: "Pantalla por cuadros: el aparato controlado no tiene WebRTC" };
    }
    const { usable, faltaWebRtc, detalle } = await comprobarWebRtcUtilizable(capsControlador);
    if (usable) {
        return { via: "webrtc", razon: "WebRTC disponible en el controlador" };
    }
    const causa = faltaWebRtc === "webrtc-linux" ? `Linux sin WebRTC (${detalle})` : "WebRTC no disponible";
    return { via: "malla", razon: `Pantalla por cuadros: ${causa}` };
}
