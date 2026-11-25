/**
 * Control entre mis neuronas · la PUERTA del aparato controlado (ORD1114P · contrato
 * `control-remoto-entre-neuronas.md` §1, §2.1, §2.3 y §2.4; fase 1).
 *
 * Quien decide es el lado controlado, nunca quien firma (§1 A). Una orden solo surte efecto si, en
 * ESTE aparato y por este orden:
 *   1. tiene la forma exacta (`leerOrden`) — si no, «forma»;
 *   2. el dueño encendió aquí «Control entre mis neuronas» (apagado de fábrica) — si no, «permiso-apagado»;
 *   3. es de la MISMA cuenta — si no, «otra-cuenta»;
 *   4. la manda un aparato que el dueño aceptó AQUÍ (clave pública fijada) — si no, «no-autorizado»;
 *   5. la firma ECDSA vale con esa clave fijada — si no, «firma»;
 *   6. va dirigida a esta neurona — si no, «otro-destino»;
 *   7. su hora está a ±5 min y no ha caducado (vida ≤ 2 min) — si no, «caducada»;
 *   8. su `seq` es mayor que el último visto de ese aparato y su nonce es nuevo — si no, «repetida»;
 *   9. no pasa del tope (5 por segundo, 60 por minuto por aparato) — si no, «limite»;
 *  10. la acción está en la lista cerrada — si no, «accion-desconocida» (nunca se adivina);
 *  11. sus argumentos son los tipados — si no, «argumentos»;
 *  12. su nivel no pasa del concedido ni del de la sesión — si no, «nivel»;
 *  13. hay sesión abierta por ESE aparato, viva (latidos cada 10 s; cae a los 45 s sin ellos) — si no, «sin-sesion»/«sesion-caducada».
 *      CTL1119A: sin límite elegido al aceptar no hay hora máxima; si se eligió uno, al cumplirse es «limite-cumplido» y no se reabre sola.
 * Cada orden, aceptada o no, deja una línea `orden <acción> de=<8> nivel=<n> resultado=<…>`.
 * Revocar (un toque) cierra la sesión y APAGA el permiso: lo siguiente es «permiso-apagado».
 *
 * ORD1114Q (§1 D y H, §2.2, §2.4):
 *  · Lo que llega por el canal se abre con `recibirSellado`: un cuerpo en claro («sin-sellar») o un sello
 *    roto («sellado-roto») se rechazan sin ejecutar nada.
 *  · La sesión es la del lado NATIVO (`nativo.ts`): sin indicador nativo posible, «sin-indicador-nativo»;
 *    abrir pide a Rust el token (Rust pone el indicador); antes de ejecutar CADA orden Rust da el visto
 *    bueno y la anota; si Rust ya paró (indicador, caducidad), «parada-nativa» y la sesión se cierra aquí.
 *  · Si la persona contesta o cuelga a mano durante una sesión (`intervencionLocal`), la sesión se para
 *    en Rust y la orden siguiente recibe «a-mano» (el banco de llamadas para su serie y lo dice).
 *
 * Pura salvo lo inyectado (reloj, WebCrypto, almacén, ejecutor, registro, azar). Nunca lanza hacia fuera.
 */

import { leerOrden, verificarFirma, huellaDeSpki, DESFASE_MAX_MS, VIDA_ORDEN_MS, type CargaOrden, type RespuestaOrden } from "./orden";
import { capacidadesDeNivel, definicion, nivelMinimo, rangoNivel, NIVELES_CONCEDIBLES_FASE1, type Args, type Nivel } from "./niveles";
import type { PuenteNativoControl } from "./nativo"; // ORD1114Q
import { abrirOrden, type AbrirSobre } from "./sellado"; // ORD1114Q
import type { PeticionControl } from "./aviso-peticion"; // CTL1117J

/** CTL1119A: la hora máxima histórica (1 h) se conserva como referencia; ya no se aplica sola: sin límite no hay techo. */
export const SESION_MAX_MS = 60 * 60_000;
/** CTL1119A: la neurona que controla manda un latido firmado cada 10 s. */
export const LATIDO_CADA_MS = 10_000;
/** CTL1119A: la sesión solo cae si faltan latidos 45 s (o si se cumplió el límite elegido al aceptar). */
export const SIN_LATIDOS_MS = 45_000;
/** Se conserva el nombre anterior: es el plazo sin latidos que caduca una sesión. */
export const SESION_INACTIVA_MS = SIN_LATIDOS_MS;
export const TOPE_SEGUNDO = 5;
export const TOPE_MINUTO = 60;
/** (PAN1115J) Órdenes de entrada (toque, tecla…): hasta 60 por segundo, sin tope por minuto (§2.4). */
export const TOPE_ENTRADA_SEGUNDO = 60;
/** CTL1117A · S5: las lecturas de la ventana (`leer-estado`, `leer-aparato`) tienen su cuenta y no gastan las 5/s de las órdenes de app. */
export const TOPE_LECTURA_SEGUNDO = 5;
/** CTL1117A · S5: el techo de TODO junto (entrada + lecturas + órdenes de app) por segundo y por controlador. */
export const TOPE_TOTAL_SEGUNDO = 70;
const ACCIONES_LECTURA = new Set(["leer-estado", "leer-aparato"]);
export const MAX_CONTROLADORES = 4;
export const MAX_PENDIENTES = 5;

/** CTL1119A: de quién es la neurona que se va a aceptar (decide el filtro de límites por defecto). */
export type AmbitoControl = "propia" | "otra-cuenta" | "publica";

/** CTL1119A: el límite de tiempo que la persona elige al aceptar el control. */
export type LimiteSesion = { tipo: "sin-limite" } | { tipo: "minutos"; minutos: number } | { tipo: "hasta"; hora: string };

/** CTL1119A: el filtro del dueño (privado/público): qué se propone y hasta dónde se puede elegir. */
export interface FiltroPermisos {
    porDefecto: LimiteSesion;
    maximo: LimiteSesion;
}

/** En las neuronas de la cuenta no hay techo; en las ajenas y públicas manda el filtro del dueño. */
export const FILTRO_PROPIA: FiltroPermisos = { porDefecto: { tipo: "sin-limite" }, maximo: { tipo: "sin-limite" } };
export const FILTRO_OTRA_CUENTA: FiltroPermisos = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 60 } };
export const FILTRO_PUBLICA: FiltroPermisos = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 15 } };

/** El filtro de un ámbito, con lo que el dueño haya configurado por encima (si lo hay). */
export function filtroPorAmbito(ambito: AmbitoControl, delDueno?: Partial<FiltroPermisos> | null): FiltroPermisos {
    const base = ambito === "propia" ? FILTRO_PROPIA : ambito === "publica" ? FILTRO_PUBLICA : FILTRO_OTRA_CUENTA;
    return { porDefecto: delDueno?.porDefecto ?? base.porDefecto, maximo: delDueno?.maximo ?? base.maximo };
}

function horaDeHasta(hora: string, desde: number): number {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
    if (!m) return desde;
    const d = new Date(desde);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() <= desde) d.setDate(d.getDate() + 1);
    return d.getTime();
}

/** Cuánto dura un límite desde un instante; null si no tiene límite. */
export function duracionDeLimite(limite: LimiteSesion, desde: number): number | null {
    if (limite.tipo === "sin-limite") return null;
    if (limite.tipo === "minutos") return Math.max(0, Math.round(limite.minutos * 60_000));
    return Math.max(0, horaDeHasta(limite.hora, desde) - desde);
}

/** El fin absoluto de un límite desde que se aceptó; null si no hay límite. */
export function finDeLimite(limite: LimiteSesion | null | undefined, aceptadoEn: number): number | null {
    if (!limite || limite.tipo === "sin-limite") return null;
    if (limite.tipo === "minutos") return aceptadoEn + Math.max(0, Math.round(limite.minutos * 60_000));
    return horaDeHasta(limite.hora, aceptadoEn);
}

/** Recorta lo elegido al máximo del filtro: nunca se supera lo que el dueño permite. */
export function limiteNormalizado(elegido: LimiteSesion | null | undefined, filtro: FiltroPermisos, ahora: number): LimiteSesion {
    const limite = elegido ?? filtro.porDefecto;
    const maxMs = duracionDeLimite(filtro.maximo, ahora);
    if (maxMs === null) return limite;
    const ms = duracionDeLimite(limite, ahora);
    if (ms === null || ms > maxMs) {
        if (filtro.maximo.tipo === "hasta") return filtro.maximo;
        return { tipo: "minutos", minutos: Math.max(1, Math.floor(maxMs / 60_000)) };
    }
    return limite;
}

/** Lo que queda de una sesión con límite (ms); null si no hay límite. */
export function restanteDeSesion(s: { fin?: number | null }, ahora: number): number | null {
    return s.fin === null || s.fin === undefined ? null : Math.max(0, s.fin - ahora);
}

export interface Controlador {
    huella: string;
    spki: string;
    cuenta: string;
    nombre: string;
    neurona: string;
    desde: string;
    /** CTL1117H: color público que declaró al presentarse (#rrggbb); si falta, el de su id (`colorPorDefecto`). */
    color?: string;
    /** CTL1119A: límite de tiempo elegido por la persona al aceptar; sin él no hay tope de duración. */
    limite?: LimiteSesion;
    /** CTL1119A: cuándo se aceptó (ISO); desde ahí cuenta el límite. */
    aceptadoEn?: string;
}

/** Lo que el dueño decidió en ESTE aparato. Se guarda; las sesiones no (viven en memoria). */
export interface PermisoControl {
    encendido: boolean;
    nivel: Nivel;
    controladores: Controlador[];
    pendientes: Controlador[];
}

export function permisoDeFabrica(): PermisoControl {
    return { encendido: false, nivel: "controlar", controladores: [], pendientes: [] };
}

export interface SesionActiva {
    token: string;
    de: string;
    nombre: string;
    nivel: Nivel;
    inicio: number;
    ultima: number;
    /** CTL1117I: color público que el controlador firmó al abrir (`#rrggbb`) o, si no, el que declaró al presentarse. */
    color?: string;
    /** CTL1119A: cuándo termina el límite elegido (ms epoch) o null si la sesión no tiene límite. */
    fin?: number | null;
}

export interface DepsPuerta {
    subtle: SubtleCrypto;
    ahora: () => number;
    cuentaPropia: () => string | null;
    neuronaPropia: () => string;
    leerPermiso: () => PermisoControl;
    guardarPermiso: (p: PermisoControl) => void;
    /** Ejecuta una acción YA validada. Devuelve el resultado o lanza con un motivo corto. */
    ejecutar: (nombre: string, args: Args, carga: CargaOrden, sobre?: unknown, sesion?: { token: string; nivel: Nivel }) => Promise<unknown>;
    anotar: (linea: string) => void;
    /** 16 bytes de azar en hex (el token de la sesión). */
    azarHex: () => string;
    /** Avisa a la interfaz (banda) de que cambió la sesión o el permiso. */
    alCambiar?: () => void;
    /** (ORD1114Q) El lado nativo: sesión, indicador, parada y registro encadenado. */
    nativo: PuenteNativoControl;
    /** (ORD1114Q) Cómo abrir un sobre v:3 con la privada de cifrado de ESTA neurona. */
    abrirSobre?: AbrirSobre;
    /**
     * CTL1117J · S3: avisa a la persona de ESTE aparato de una petición YA verificada (misma cuenta, firma válida, para esta neurona,
     * en hora). Devuelve «si» (se avisó), «ya» (se avisó hace poco: tope) o nada. Nunca enciende ni acepta nada.
     */
    avisarPeticion?: (p: PeticionControl) => "si" | "ya" | void;
}

const MAX_NONCES = 2000;
/** Máximo de neuronas de la cuenta que pueden operar/ver esta neurona simultáneamente. */
export const MAX_SESIONES_ACTIVAS = 8;
/** Ventana deslizante de `seq` para tolerar reordenamiento entre canal de datos y canal de control sin permitir repeticiones. */
export const VENTANA_SEQ = 64;

/** CTL1118G: el motivo que recibe quien manda cuando la persona de este aparato termina la sesión. */
export const MOTIVO_TERMINADO = "terminado-por-el-dueno";

/** CTL1118G: los motivos nativos de «Terminar» (indicador, notificación, superposición, web) que SOLO cortan la sesión. */
export function esTerminarDeLaPersona(motivo: string): boolean {
    return motivo === MOTIVO_TERMINADO || motivo === "la-persona-desde-el-indicador" || motivo === "la-persona-desde-la-notificacion" || motivo === "la-persona-desde-la-superposicion";
}

/** CTL1118G: el nombre de la neurona que manda, limpio (sin controles, 60 letras como `presentarse`); `null` si no sirve. */
export function nombreLimpio(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const n = [...v.replace(/[\u0000-\u001f\u007f]/g, "")].slice(0, 60).join("").trim();
    return n ? n : null;
}

export class PuertaControl {
    private sesiones = new Map<string, SesionActiva>();
    private seqVentana = new Map<string, { max: number; vistos: Set<number> }>();
    private nonces: string[] = [];
    private noncesSet = new Set<string>();
    private marcas = new Map<string, number[]>();
    private marcasEntrada = new Map<string, number[]>(); // PAN1115J
    private marcasLectura = new Map<string, number[]>(); // CTL1117A · S5
    private marcasTotal = new Map<string, number[]>(); // CTL1117A · S5
    /** (ORD1114Q) Una persona contestó o colgó a mano: la orden siguiente lo sabe («a-mano»). */
    private aMano: string | null = null;
    /**
     * CTL1118G: controladores a los que la persona de ESTE aparato les terminó la sesión («Terminar»). Mientras la marca siga, sus órdenes
     * contestan `parada-nativa` con `detalle.motivo=terminado-por-el-dueno` (terminal: su ventana no reabre sola). Una `abrir-sesion` buena
     * (una persona pulsó «Reabrir») la borra. Solo en memoria.
     */
    private terminadoPor = new Set<string>();
    /** CTL1119A: por qué cayó la última sesión (latidos o límite cumplido), para decírselo a quien manda. */
    private caducadaPor: "latidos" | "limite" | null = null;

    constructor(private readonly d: DepsPuerta) {}

    private servidas = 0;
    /** CTL1117C · FALLO 1: órdenes cumplidas (solo un contador, para la línea `control-fondo`). */
    ordenesServidas(): number {
        return this.servidas;
    }

    sesionActiva(): SesionActiva | null {
        this.caducarSesion();
        return this.sesiones.values().next().value ?? null;
    }

    sesionesActivas(): SesionActiva[] {
        this.caducarSesion();
        return [...this.sesiones.values()];
    }

    sesionPorToken(token: string): SesionActiva | null {
        this.caducarSesion();
        return this.sesiones.get(token) ?? null;
    }

    /**
     * CTL1118G · «Terminar»: cierra todas las sesiones activas. El permiso sigue encendido y los controladores siguen aceptados.
     * Quien manda recibe `terminado-por-el-dueno` y no reabre solo.
     */
    terminar(motivo = MOTIVO_TERMINADO): void {
        const cerradas = [...this.sesiones.values()];
        const s = cerradas[0] ?? null;
        this.sesiones.clear();
        this.caducadaPor = null;
        for (const x of cerradas) this.terminadoPor.add(x.de);
        void this.d.nativo.parar(motivo).catch(() => undefined);
        this.d.anotar(`orden terminar de=${s ? s.de.slice(0, 8) : "-"} nivel=- resultado=${motivo}`);
        this.d.alCambiar?.();
    }

    /**
     * CTL1124B · «Terminar sesión» de UN controlador concreto sin cortar otras sesiones activas ni quitar el permiso.
     */
    terminarToken(token: string, motivo = MOTIVO_TERMINADO): boolean {
        const s = this.sesiones.get(token);
        if (!s) return false;
        this.sesiones.delete(token);
        if (this.sesiones.size === 0) this.caducadaPor = null;
        this.terminadoPor.add(s.de);
        void this.d.nativo.parar(motivo, token).catch(() => undefined);
        this.d.anotar(`orden terminar de=${s.de.slice(0, 8)} nivel=${s.nivel} resultado=${motivo}`);
        this.d.alCambiar?.();
        return true;
    }

    /** CTL1118G · «Quitar permiso»: cierra la sesión Y apaga el permiso en este aparato (un toque). */
    quitarPermiso(): void {
        this.revocar("revocado");
    }

    /** Cierra todas las sesiones activas y apaga el permiso en este aparato. */
    revocar(motivo = "revocado"): void {
        const s = this.sesiones.values().next().value ?? null;
        this.sesiones.clear();
        this.caducadaPor = null;
        this.terminadoPor.clear();
        void this.d.nativo.parar(motivo).catch(() => undefined); // ORD1114Q
        const p = this.d.leerPermiso();
        this.d.guardarPermiso({ ...p, encendido: false });
        this.d.anotar(`orden revocar de=${s ? s.de.slice(0, 8) : "-"} nivel=- resultado=${motivo}`);
        this.d.alCambiar?.();
    }

    /** (ORD1114Q) Rust paró la sesión (indicador, caducidad): aquí también se cierran. */
    paradaNativa(motivo: string): void {
        const cerradas = [...this.sesiones.values()];
        if (cerradas.length === 0) return;
        this.sesiones.clear();
        this.caducadaPor = null;
        const limpia = /^[a-z-]{1,40}$/.test(motivo) ? motivo : "parada";
        for (const s of cerradas) {
            if (esTerminarDeLaPersona(motivo)) this.terminadoPor.add(s.de); // CTL1118G: «Terminar» desde el indicador, la notificación o la superposición
            this.d.anotar(`orden cerrar-sesion de=${s.de.slice(0, 8)} nivel=${s.nivel} resultado=parada-nativa:${limpia}`);
        }
        this.d.alCambiar?.();
    }

    /** (ORD1114Q) La persona contestó/colgó a mano en ESTE aparato: se paran las sesiones y se avisa a quien manda. */
    intervencionLocal(que: string): void {
        const cerradas = [...this.sesiones.values()];
        this.aMano = /^[a-z-]{1,24}$/.test(que) ? que : "a-mano";
        if (cerradas.length > 0) {
            this.sesiones.clear();
            this.caducadaPor = null;
            void this.d.nativo.parar("a-mano").catch(() => undefined);
            for (const s of cerradas) {
                this.d.anotar(`orden cerrar-sesion de=${s.de.slice(0, 8)} nivel=${s.nivel} resultado=a-mano:${this.aMano}`);
            }
            this.d.alCambiar?.();
        }
    }

    private caducarSesion(): void {
        if (this.sesiones.size === 0) return;
        const t = this.d.ahora();
        let cambio = false;
        for (const [token, s] of [...this.sesiones.entries()]) {
            const porLimite = s.fin !== null && s.fin !== undefined && t > s.fin;
            const porLatidos = t - s.ultima > SESION_INACTIVA_MS;
            if (porLimite || porLatidos) {
                this.sesiones.delete(token);
                this.caducadaPor = porLimite ? "limite" : "latidos";
                this.d.anotar(`orden cerrar-sesion de=${s.de.slice(0, 8)} nivel=${s.nivel} resultado=${porLimite ? "limite-cumplido" : "caducada"}`);
                cambio = true;
            }
        }
        if (cambio) this.d.alCambiar?.();
    }

    private aceptarSeqYNonce(de: string, seq: number, nonce: string): boolean {
        if (this.noncesSet.has(nonce) || !Number.isInteger(seq) || seq <= 0) return false;
        let v = this.seqVentana.get(de);
        if (!v) {
            v = { max: seq, vistos: new Set([seq]) };
            this.seqVentana.set(de, v);
            return true;
        }
        if (seq > v.max) {
            v.max = seq;
            v.vistos.add(seq);
            const piso = v.max - VENTANA_SEQ;
            for (const n of v.vistos) if (n <= piso) v.vistos.delete(n);
            return true;
        }
        if (seq > v.max - VENTANA_SEQ && !v.vistos.has(seq)) {
            v.vistos.add(seq);
            return true;
        }
        return false;
    }

    private respuesta(nonce: string, ok: boolean, motivo: string, nombre: string, de: string, nivel: string, resultado?: unknown, detalle?: Record<string, string>): RespuestaOrden {
        const marca = nombre && /^[a-z-]{1,24}$/.test(nombre) ? nombre : "?";
        const sim = definicion(nombre)?.simulacion ? " SIMULACION" : "";
        // IND1115F: «sin-indicador-nativo» dice QUÉ falta (para este registro y para quien manda), nunca solo el código.
        const extra = !ok && detalle ? Object.entries(detalle).map(([k, v]) => ` ${k}=${v}`).join("") : "";
        this.d.anotar(`orden ${marca} de=${de ? de.slice(0, 8) : "-"} nivel=${nivel} resultado=${ok ? "ok" : `rechazo:${motivo}`}${extra}${sim}`);
        if (!ok) this.d.nativo.anotar(marca, de, `rechazo:${motivo}`); // ORD1114Q: también en el registro encadenado
        const cuerpo = resultado !== undefined ? resultado : !ok && detalle ? { detalle } : undefined;
        if (ok && nombre !== "abrir-sesion" && nombre !== "cerrar-sesion" && nombre !== "consultar-aceptacion") this.servidas += 1; // CTL1117C: para el diagnóstico de segundo plano
        return { tipo: "respuesta", nonce, ok, motivo, ...(cuerpo !== undefined ? { resultado: cuerpo } : {}) };
    }

    private tope(huella: string, entrada = false, lectura = false): boolean {
        const t = this.d.ahora();
        // CTL1117A · S5: el techo total no se quita: lecturas, entrada y órdenes de app suman en él.
        const total = (this.marcasTotal.get(huella) ?? []).filter((x) => t - x < 1000);
        if (total.length >= TOPE_TOTAL_SEGUNDO) {
            this.marcasTotal.set(huella, total);
            return false;
        }
        const cuenta = (m: Map<string, number[]>, max: number): boolean => {
            const l = (m.get(huella) ?? []).filter((x) => t - x < 1000);
            m.set(huella, l);
            if (l.length >= max) return false;
            l.push(t);
            return true;
        };
        if (entrada) {
            // PAN1115J: la entrada tiene su propia cuenta: no gasta el tope de las órdenes de app ni se cuenta por minuto.
            if (!cuenta(this.marcasEntrada, TOPE_ENTRADA_SEGUNDO)) return false;
        } else if (lectura) {
            if (!cuenta(this.marcasLectura, TOPE_LECTURA_SEGUNDO)) return false;
        } else {
            const lista = (this.marcas.get(huella) ?? []).filter((x) => t - x < 60_000);
            const enSegundo = lista.filter((x) => t - x < 1000).length;
            if (enSegundo >= TOPE_SEGUNDO || lista.length >= TOPE_MINUTO) {
                this.marcas.set(huella, lista);
                return false;
            }
            lista.push(t);
            this.marcas.set(huella, lista);
        }
        total.push(t);
        this.marcasTotal.set(huella, total);
        return true;
    }

    private recordarNonce(n: string): void {
        this.noncesSet.add(n);
        this.nonces.push(n);
        if (this.nonces.length > MAX_NONCES) this.noncesSet.delete(this.nonces.shift() as string);
    }

    /**
     * (ORD1114Q) Lo que llegó por el canal: SOLO una orden sellada para esta neurona. Devuelve la respuesta y
     * la clave de un solo uso para sellarla (null si no se pudo abrir: entonces no se contesta). Nunca lanza.
     */
    async recibirSellado(msg: unknown): Promise<{ respuesta: RespuestaOrden; kr: Uint8Array | null; orden: unknown }> {
        const abrir = this.d.abrirSobre;
        const a = abrir ? await abrirOrden(msg, abrir) : ({ ok: false, motivo: "sellado-roto" } as const);
        if (!a.ok) return { respuesta: this.respuesta("", false, a.motivo, "", "", "-"), kr: null, orden: null };
        return { respuesta: await this.recibir(a.orden), kr: a.kr, orden: a.orden };
    }

    /** Recibe una orden firmada (ya abierta del sello) y devuelve la respuesta. Nunca lanza. */
    async recibir(sobre: unknown): Promise<RespuestaOrden> {
        try {
            return await this.recibirSinGuarda(sobre);
        } catch {
            return this.respuesta("", false, "error", "", "", "-");
        }
    }

    private async recibirSinGuarda(sobre: unknown): Promise<RespuestaOrden> {
        const o = leerOrden(sobre);
        if (!o) return this.respuesta("", false, "forma", "", "", "-");
        const { carga: c } = o;
        const nombre = c.accion.nombre;
        const permiso = this.d.leerPermiso();

        // «presentarse»: un aparato de la cuenta pide que el dueño lo acepte AQUÍ. Nunca concede nada.
        if (nombre === "presentarse") return this.presentarse(o);
        // CTL1124F: una lectura de si ya lo aceptaron; no abre sesión ni cambia el permiso.
        if (nombre === "consultar-aceptacion") return this.consultarAceptacion(o);

        if (!permiso.encendido) {
            // CTL1117J · S3: la persona de este aparato se entera de que alguien lo pidió, y quien manda sabe que se avisó (`aviso`).
            const aviso = nombre === "abrir-sesion" ? await this.avisoDeAperturaApagada(o, permiso) : null;
            return this.respuesta(c.nonce, false, "permiso-apagado", nombre, c.de, c.nivel, undefined, aviso ? { aviso } : undefined);
        }
        // ORD1114Q: sin indicador nativo posible no hay control (§2.4).
        if (!this.d.nativo.disponible()) return this.respuesta(c.nonce, false, "sin-indicador-nativo", nombre, c.de, c.nivel);
        const cuenta = this.d.cuentaPropia();
        if (!cuenta || c.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "otra-cuenta", nombre, c.de, c.nivel);
        const ctl = permiso.controladores.find((x) => x.huella === c.de);
        if (!ctl || ctl.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "no-autorizado", nombre, c.de, c.nivel);
        if (!(await verificarFirma(this.d.subtle, ctl.spki, o.bytes, o.firma))) return this.respuesta(c.nonce, false, "firma", nombre, c.de, c.nivel);
        if (c.para !== this.d.neuronaPropia()) return this.respuesta(c.nonce, false, "otro-destino", nombre, c.de, c.nivel);

        const ahora = this.d.ahora();
        const t = Date.parse(c.t);
        const cad = Date.parse(c.caduca);
        if (Math.abs(ahora - t) > DESFASE_MAX_MS || cad <= ahora || cad - t > VIDA_ORDEN_MS || cad < t) {
            return this.respuesta(c.nonce, false, "caducada", nombre, c.de, c.nivel);
        }
        if (!this.aceptarSeqYNonce(c.de, c.seq, c.nonce)) return this.respuesta(c.nonce, false, "repetida", nombre, c.de, c.nivel);
        this.recordarNonce(c.nonce);
        if (!this.tope(c.de, definicion(nombre)?.entrada === true || definicion(nombre)?.senal === true, ACCIONES_LECTURA.has(nombre))) return this.respuesta(c.nonce, false, "limite", nombre, c.de, c.nivel);

        const def = definicion(nombre);
        if (!def) return this.respuesta(c.nonce, false, "accion-desconocida", nombre, c.de, c.nivel);
        const args = def.validar(c.accion.args);
        if (!args) return this.respuesta(c.nonce, false, "argumentos", nombre, c.de, c.nivel);

        const concedido: Nivel = NIVELES_CONCEDIBLES_FASE1.includes(permiso.nivel) ? permiso.nivel : "ver";
        if (rangoNivel(c.nivel) > rangoNivel(concedido) || rangoNivel(def.nivel) > rangoNivel(c.nivel)) {
            return this.respuesta(c.nonce, false, "nivel", nombre, c.de, c.nivel);
        }

        // ORD1114Q: una intervención a mano se dice UNA vez a quien manda (su serie para), y luego nada más.
        if (this.aMano) {
            const que = this.aMano;
            this.aMano = null;
            return this.respuesta(c.nonce, false, "a-mano", nombre, c.de, c.nivel, { que });
        }

        if (nombre === "abrir-sesion") {
            this.caducarSesion();
            const existenteDe = [...this.sesiones.values()].find((x) => x.de === c.de) ?? null;
            if (!existenteDe && this.sesiones.size >= MAX_SESIONES_ACTIVAS) return this.respuesta(c.nonce, false, "otra-sesion", nombre, c.de, c.nivel);
            const nivel = nivelMinimo(c.nivel, concedido);
            // CTL1118G: el nombre de su neurona viaja DENTRO de lo firmado (la firma ya se comprobó arriba): así se pone al día el de quien
            // se aceptó con el nombre viejo, sin aceptarlo otra vez. Nunca desde algo sin firma.
            const nombreFirmado = nombreLimpio(c.accion.args.nombre);
            const nombreCtl = nombreFirmado ?? ctl.nombre;
            // CTL1119A: el límite se eligió al aceptar; si ya se cumplió, ni se abre ni se pide otra aceptación.
            const aceptadoEn = ctl.aceptadoEn ? Date.parse(ctl.aceptadoEn) : ahora;
            const fin = finDeLimite(ctl.limite ?? { tipo: "sin-limite" }, Number.isFinite(aceptadoEn) ? aceptadoEn : ahora);
            if (fin !== null && ahora >= fin) {
                this.caducadaPor = "limite";
                return this.respuesta(c.nonce, false, "limite-cumplido", nombre, c.de, c.nivel);
            }
            // ORD1114Q: la sesión la abre Rust (pone el indicador o se niega) y su token es el de Rust.
            const n = await this.d.nativo.abrir(c.de, nombreCtl, nivel, sobre); // FSG1116 · A2: lo nativo comprueba la firma
            if (!n.ok || !n.token) return this.respuesta(c.nonce, false, n.motivo ?? "sin-indicador-nativo", nombre, c.de, c.nivel, undefined, n.detalle);
            // CTL1117A · S1/S3: abrir otra vez con la sesión viva y el mismo controlador es la MISMA sesión (mismo token y mismo fin):
            // renovar la ventana de latidos sí, estirar el límite elegido no.
            const prev = this.sesiones.get(n.token) ?? (existenteDe && existenteDe.token === n.token ? existenteDe : null);
            if (existenteDe && existenteDe.token !== n.token) this.sesiones.delete(existenteDe.token);
            const mismaSesion = prev !== null && prev.de === c.de;
            const inicio = mismaSesion && prev ? prev.inicio : ahora;
            const colorFirmado = typeof c.accion.args.color === "string" && /^#[0-9a-f]{6}$/.test(c.accion.args.color) ? c.accion.args.color : undefined;
            const color = colorFirmado ?? ctl.color;
            const activa: SesionActiva = { token: n.token, de: c.de, nombre: nombreCtl, nivel, inicio, ultima: ahora, fin, ...(color ? { color } : {}) };
            this.sesiones.set(activa.token, activa);
            this.terminadoPor.delete(c.de); // CTL1118G: una persona volvió a abrir
            this.caducadaPor = null;
            if (nombreFirmado && nombreFirmado !== ctl.nombre) this.ponerAlDiaNombre(c.de, nombreFirmado);
            this.d.alCambiar?.();
            if (!mismaSesion) this.avisar({ de: c.de, nombre: nombreCtl, tipo: "abrir-sesion", nivel: nivel === "ver" ? "ver" : "controlar", estado: "abierta", desde: inicio }); // CTL1117J · S3
            return this.respuesta(c.nonce, true, "ok", nombre, c.de, nivel, {
                sesion: activa.token,
                nivel,
                capacidades: capacidadesDeNivel(nivel),
                ...(fin !== null ? { caduca: new Date(fin).toISOString() } : { sinLimite: true }),
            });
        }

        this.caducarSesion();
        const s = c.sesion ? this.sesiones.get(c.sesion) : undefined;
        if (!s && this.terminadoPor.has(c.de)) {
            // CTL1118G: la persona terminó esta sesión. Se dice con el motivo de siempre de «parada-nativa» (terminal: no reabre sola).
            return this.respuesta(c.nonce, false, "parada-nativa", nombre, c.de, c.nivel, undefined, { motivo: MOTIVO_TERMINADO });
        }
        if (!s && this.caducadaPor === "limite") return this.respuesta(c.nonce, false, "limite-cumplido", nombre, c.de, c.nivel);
        if (!s || s.de !== c.de) return this.respuesta(c.nonce, false, this.sesiones.size > 0 ? "sin-sesion" : "sesion-caducada", nombre, c.de, c.nivel);
        if (rangoNivel(def.nivel) > rangoNivel(s.nivel)) return this.respuesta(c.nonce, false, "nivel", nombre, c.de, c.nivel);
        s.ultima = ahora;

        if (nombre === "cerrar-sesion") {
            this.sesiones.delete(s.token);
            await this.d.nativo.parar("cerrar-sesion", s.token).catch(() => undefined); // ORD1114Q: cierra solo este token
            this.d.alCambiar?.();
            return this.respuesta(c.nonce, true, "ok", nombre, c.de, s.nivel);
        }
        // ORD1114Q: Rust da el visto bueno y la anota; si paró (indicador, caducidad), aquí también se cierra.
        const visto = await this.d.nativo.orden(s.token, nombre);
        if (!visto.ok && visto.motivo === "pausa-local") {
            // CTL1117J · S1: una pausa local NO es una parada. Lo nativo sostiene la entrada ~3 s (también las lecturas: contesta igual a toda
            // orden) y la reanuda solo; la sesión, su token y la pantalla siguen vivos. Quien manda recibe «pausa-local» y su ventana dice «En pausa».
            return this.respuesta(c.nonce, false, "pausa-local", nombre, c.de, s.nivel);
        }
        if (!visto.ok) {
            this.sesiones.delete(s.token);
            this.d.alCambiar?.();
            // CTL1117C · FALLO 3: «parada-nativa» lleva el motivo REAL de lo nativo (no siempre es «Terminar»).
            const sinIndicador = visto.motivo === "sin-indicador-nativo";
            return this.respuesta(c.nonce, false, sinIndicador ? "sin-indicador-nativo" : "parada-nativa", nombre, c.de, s.nivel, undefined, visto.detalle);
        }
        try {
            const r = await this.d.ejecutar(nombre, args, c, sobre, { token: s.token, nivel: s.nivel });
            return this.respuesta(c.nonce, true, "ok", nombre, c.de, s.nivel, r);
        } catch (e) {
            const m = e instanceof Error && /^[a-z-]{1,32}$/.test(e.message) ? e.message : "fallo";
            return this.respuesta(c.nonce, false, m, nombre, c.de, s.nivel);
        }
    }

    /** CTL1118G: guarda el nombre firmado de un controlador YA aceptado (solo el nombre; no enciende ni acepta nada). */
    private ponerAlDiaNombre(huella: string, nombre: string): void {
        try {
            const p = this.d.leerPermiso();
            if (!p.controladores.some((x) => x.huella === huella)) return;
            this.d.guardarPermiso({ ...p, controladores: p.controladores.map((x) => (x.huella === huella ? { ...x, nombre } : x)) });
        } catch {
            /* sin almacenamiento: el nombre de esta sesión ya es el bueno */
        }
    }

    /** CTL1117J · S3: llama al aviso sin que un fallo suyo toque la puerta. */
    private avisar(p: PeticionControl): "si" | "ya" | null {
        try {
            const r = this.d.avisarPeticion?.(p);
            return r === "si" || r === "ya" ? r : null;
        } catch {
            return null;
        }
    }

    /**
     * CTL1117J · S3: con el permiso APAGADO, una `abrir-sesion` solo avisa si se puede verificar a quien la manda: misma cuenta, un
     * controlador ya fijado AQUÍ, su firma con esa clave, dirigida a esta neurona y en hora. No toca `seq` ni nonces (no es una orden que se cumpla).
     */
    private async avisoDeAperturaApagada(o: NonNullable<ReturnType<typeof leerOrden>>, permiso: PermisoControl): Promise<"si" | "ya" | null> {
        try {
            const c = o.carga;
            const cuenta = this.d.cuentaPropia();
            if (!cuenta || c.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return null;
            const ctl = permiso.controladores.find((x) => x.huella === c.de);
            if (!ctl || ctl.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return null;
            if (!(await verificarFirma(this.d.subtle, ctl.spki, o.bytes, o.firma))) return null;
            if (c.para !== this.d.neuronaPropia()) return null;
            const ahora = this.d.ahora();
            const t = Date.parse(c.t);
            const cad = Date.parse(c.caduca);
            if (Math.abs(ahora - t) > DESFASE_MAX_MS || cad <= ahora || cad - t > VIDA_ORDEN_MS || cad < t) return null;
            return this.avisar({ de: c.de, nombre: ctl.nombre, tipo: "abrir-sesion", nivel: c.nivel === "ver" ? "ver" : "controlar", estado: "apagado", desde: ahora });
        } catch {
            return null;
        }
    }

    /**
     * CTL1124F: dice si este aparato ya tiene aceptado a quien pregunta, SIN abrir sesión, sin pedir token al lado
     * nativo y sin tocar el permiso. La firma se comprueba con la clave fijada (aceptado o pendiente): nadie que no
     * sea de la cuenta y no se haya presentado puede preguntar. La antirrepetición y el tope son los de siempre.
     */
    private async consultarAceptacion(o: NonNullable<ReturnType<typeof leerOrden>>): Promise<RespuestaOrden> {
        const c = o.carga;
        if (c.para !== this.d.neuronaPropia()) return this.respuesta(c.nonce, false, "otro-destino", "consultar-aceptacion", c.de, c.nivel);
        const cuenta = this.d.cuentaPropia();
        if (!cuenta || c.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "otra-cuenta", "consultar-aceptacion", c.de, c.nivel);
        const ahora = this.d.ahora();
        const t = Date.parse(c.t);
        const cad = Date.parse(c.caduca);
        if (Math.abs(ahora - t) > DESFASE_MAX_MS || cad <= ahora || cad - t > VIDA_ORDEN_MS || cad < t) {
            return this.respuesta(c.nonce, false, "caducada", "consultar-aceptacion", c.de, c.nivel);
        }
        const permiso = this.d.leerPermiso();
        const aceptado = permiso.controladores.find((x) => x.huella === c.de) ?? null;
        const pendiente = aceptado ? null : permiso.pendientes.find((x) => x.huella === c.de) ?? null;
        const fijado = aceptado ?? pendiente;
        if (!fijado) return this.respuesta(c.nonce, false, "no-autorizado", "consultar-aceptacion", c.de, c.nivel);
        if (!(await verificarFirma(this.d.subtle, fijado.spki, o.bytes, o.firma))) return this.respuesta(c.nonce, false, "firma", "consultar-aceptacion", c.de, c.nivel);
        if (!this.aceptarSeqYNonce(c.de, c.seq, c.nonce)) return this.respuesta(c.nonce, false, "repetida", "consultar-aceptacion", c.de, c.nivel);
        this.recordarNonce(c.nonce);
        if (!this.tope(c.de)) return this.respuesta(c.nonce, false, "limite", "consultar-aceptacion", c.de, c.nivel);
        if (!aceptado) return this.respuesta(c.nonce, false, "no-autorizado", "consultar-aceptacion", c.de, c.nivel);
        const aceptadoEn = aceptado.aceptadoEn ? Date.parse(aceptado.aceptadoEn) : ahora;
        const fin = finDeLimite(aceptado.limite ?? { tipo: "sin-limite" }, Number.isFinite(aceptadoEn) ? aceptadoEn : ahora);
        if (fin !== null && ahora >= fin) return this.respuesta(c.nonce, false, "limite-cumplido", "consultar-aceptacion", c.de, c.nivel);
        if (!permiso.encendido) return this.respuesta(c.nonce, false, "permiso-apagado", "consultar-aceptacion", c.de, c.nivel);
        const nivel = NIVELES_CONCEDIBLES_FASE1.includes(permiso.nivel) ? permiso.nivel : "ver";
        return this.respuesta(c.nonce, true, "ok", "consultar-aceptacion", c.de, c.nivel, {
            aceptada: true,
            encendido: true,
            nivel,
            ...(fin !== null ? { caduca: new Date(fin).toISOString() } : {}),
        });
    }

    private async presentarse(o: NonNullable<ReturnType<typeof leerOrden>>): Promise<RespuestaOrden> {
        const c = o.carga;
        const a = c.accion.args;
        const cuenta = this.d.cuentaPropia();
        if (!cuenta || c.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "otra-cuenta", "presentarse", c.de, "-");
        if (typeof a.spki !== "string" || typeof a.nombre !== "string" || typeof a.neurona !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(a.neurona)) {
            return this.respuesta(c.nonce, false, "argumentos", "presentarse", c.de, "-");
        }
        // Prueba de posesión: la carga va firmada con la clave que presenta y su huella es `de`.
        if ((await huellaDeSpki(this.d.subtle, a.spki)) !== c.de) return this.respuesta(c.nonce, false, "firma", "presentarse", c.de, "-");
        if (!(await verificarFirma(this.d.subtle, a.spki, o.bytes, o.firma))) return this.respuesta(c.nonce, false, "firma", "presentarse", c.de, "-");
        if (c.para !== this.d.neuronaPropia()) return this.respuesta(c.nonce, false, "otro-destino", "presentarse", c.de, "-");
        const ahora = this.d.ahora();
        if (Math.abs(ahora - Date.parse(c.t)) > DESFASE_MAX_MS || Date.parse(c.caduca) <= ahora) return this.respuesta(c.nonce, false, "caducada", "presentarse", c.de, "-");
        if (!this.tope(c.de)) return this.respuesta(c.nonce, false, "limite", "presentarse", c.de, "-");
        const p = this.d.leerPermiso();
        if (p.controladores.some((x) => x.huella === c.de)) return this.respuesta(c.nonce, true, "ya-aceptado", "presentarse", c.de, "-");
        const nombre = [...a.nombre.replace(/[\u0000-\u001f\u007f]/g, "")].slice(0, 60).join("").trim() || "Neurona";
        const color = typeof a.color === "string" && /^#[0-9a-f]{6}$/.test(a.color) ? a.color : undefined;
        const nuevo: Controlador = { huella: c.de, spki: a.spki, cuenta: c.cuenta, nombre, neurona: a.neurona, desde: new Date(ahora).toISOString(), ...(color ? { color } : {}) };
        const pendientes = [nuevo, ...p.pendientes.filter((x) => x.huella !== c.de)].slice(0, MAX_PENDIENTES);
        this.d.guardarPermiso({ ...p, pendientes });
        this.d.alCambiar?.();
        // CTL1117J · S3: pedir ser aceptado también avisa (con el permiso apagado o encendido); nunca acepta nada por sí mismo.
        const aviso = this.avisar({ de: c.de, nombre, tipo: "presentarse", nivel: p.nivel === "ver" ? "ver" : "controlar", estado: p.encendido ? "por-aceptar" : "apagado", desde: ahora });
        // CTL1118B: quien pide sabe si además hay que ENCENDER el control aquí (ya lo sabría por «permiso-apagado» al abrir).
        const dicho = { ...(aviso ? { aviso } : {}), ...(p.encendido ? {} : { apagado: true }) };
        return this.respuesta(c.nonce, true, "pendiente", "presentarse", c.de, "-", Object.keys(dicho).length ? dicho : undefined);
    }
}

/** CTL1119A: lo que la persona elige al aceptar (ámbito, límite y filtro del dueño). */
export interface OpcionesAceptar {
    ambito?: AmbitoControl;
    limite?: LimiteSesion;
    filtro?: Partial<FiltroPermisos> | null;
    ahora?: number;
}

/** El dueño acepta EN ESTE aparato a un aparato que se presentó (lo fija por su clave y su límite). */
export function aceptarPendiente(p: PermisoControl, huella: string, o: OpcionesAceptar = {}): PermisoControl {
    const x = p.pendientes.find((y) => y.huella === huella);
    if (!x) return p;
    const ahora = o.ahora ?? Date.now();
    const filtro = filtroPorAmbito(o.ambito ?? "propia", o.filtro);
    const limite = limiteNormalizado(o.limite ?? filtro.porDefecto, filtro, ahora);
    const aceptado: Controlador = { ...x, limite, aceptadoEn: new Date(ahora).toISOString() };
    const controladores = [aceptado, ...p.controladores.filter((y) => y.huella !== huella)].slice(0, MAX_CONTROLADORES);
    return { ...p, controladores, pendientes: p.pendientes.filter((y) => y.huella !== huella) };
}

export function quitarControlador(p: PermisoControl, huella: string): PermisoControl {
    return { ...p, controladores: p.controladores.filter((y) => y.huella !== huella), pendientes: p.pendientes.filter((y) => y.huella !== huella) };
}

/** CTL1119A: un límite guardado que no tenga forma exacta no se inventa. */
function sanearLimite(v: unknown): LimiteSesion | undefined {
    if (!v || typeof v !== "object") return undefined;
    const o = v as Record<string, unknown>;
    if (o.tipo === "sin-limite") return { tipo: "sin-limite" };
    if (o.tipo === "minutos" && typeof o.minutos === "number" && Number.isFinite(o.minutos) && o.minutos > 0 && o.minutos <= 24 * 60) {
        return { tipo: "minutos", minutos: Math.round(o.minutos) };
    }
    if (o.tipo === "hasta" && typeof o.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.hora)) return { tipo: "hasta", hora: o.hora };
    return undefined;
}

/** Lee un permiso guardado con forma estricta; cualquier cosa rara vuelve al de fábrica (apagado). */
export function sanearPermiso(x: unknown): PermisoControl {
    const f = permisoDeFabrica();
    if (!x || typeof x !== "object") return f;
    const o = x as Record<string, unknown>;
    const lista = (v: unknown): Controlador[] =>
        Array.isArray(v)
            ? v
                  .filter(
                      (c): c is Controlador =>
                          !!c &&
                          typeof c === "object" &&
                          typeof (c as Controlador).huella === "string" &&
                          /^[0-9a-f]{64}$/.test((c as Controlador).huella) &&
                          typeof (c as Controlador).spki === "string" &&
                          typeof (c as Controlador).cuenta === "string" &&
                          typeof (c as Controlador).nombre === "string" &&
                          typeof (c as Controlador).neurona === "string",
                  )
                  .slice(0, MAX_CONTROLADORES + MAX_PENDIENTES)
                  .map((c) => {
                      const limite = sanearLimite(c.limite);
                      const aceptadoEn = typeof c.aceptadoEn === "string" && Number.isFinite(Date.parse(c.aceptadoEn)) ? c.aceptadoEn : undefined;
                      const color = typeof c.color === "string" && /^#[0-9a-f]{6}$/.test(c.color) ? c.color : undefined;
                      return {
                          huella: c.huella,
                          spki: c.spki,
                          cuenta: c.cuenta,
                          nombre: c.nombre,
                          neurona: c.neurona,
                          desde: typeof c.desde === "string" ? c.desde : new Date(0).toISOString(),
                          ...(color ? { color } : {}),
                          ...(limite ? { limite } : {}),
                          ...(aceptadoEn ? { aceptadoEn } : {}),
                      };
                  })
            : [];
    return {
        encendido: o.encendido === true,
        nivel: o.nivel === "ver" ? "ver" : "controlar",
        controladores: lista(o.controladores).slice(0, MAX_CONTROLADORES),
        pendientes: lista(o.pendientes).slice(0, MAX_PENDIENTES),
    };
}
