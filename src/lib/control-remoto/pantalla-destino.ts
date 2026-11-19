/**
 * Control entre mis neuronas · el LADO QUE MANDA de la pantalla y la entrada (PAN1115J · contrato
 * `control-remoto-entre-neuronas.md` §12; costura 3 de `control-fase23-costuras.md`).
 *
 * Un objeto `PantallaDestino` por sesión: abre la sesión en la otra neurona, le pide la pantalla,
 * negocia la conexión de vídeo (la oferta y los candidatos viajan como órdenes `pantalla-senal` por el canal
 * de control; la contestación vuelve en la respuesta), recibe la pista y manda la entrada firmada.
 *
 * Entrada: cada orden (`gesto`, `tecla`, `volumen`, `brillo`, `texto`) se firma con la clave de este aparato y
 * sale por el canal de datos de la misma conexión si está abierto; si no, por el canal de control. Como mucho 60
 * por segundo; los `gesto` que esperan turno se funden (se juntan los puntos de cada dedo, nunca se pierde un dedo).
 * Se manda una a una y en orden: la puerta exige `seq` creciente.
 *
 * El estado dice lo que sabe y desde cuándo (`desde`): nada se enseña como vivo si no llegan cuadros.
 */

import { ACCIONES, MAX_DEDOS, MAX_PUNTOS_DEDO, definicion, type Args } from "./niveles";
import { MAX_PARTES, Reensamblador, leerParte, trocear, type ParteSenal } from "./senal-partes";
import { esRespuesta, type RespuestaOrden } from "./orden";
import { RegistroSesiones, registroGlobal } from "./registro-sesiones";
import { claveParadaNativa } from "./palabras"; // CTL1117C
import { canalDatosOk, configuracionIce, filtrarRespuesta, instantaneaMedio, permitirCandidato, registrarConexion } from "./medio-estado"; // CTL1117B
import { ESPERA_ICE_MS, ReensambladorCuadro, UMBRALES_MALLA, leerParteCuadro, lineaVia, planPorCamino, esperaSinCuadro } from "./cuadro-malla";
import { CUADROS_POR_MEDIDA, RITMO_INICIAL, mediaCoste, siguienteRitmo, type EstadoRitmo } from "./ritmo-pantalla";
import { FUENTE_DEFECTO, fuenteRealValida, type FuentePedida, type FuenteReal } from "./fuente-pantalla";
import { comprobarWebRtcUtilizable, decidirViaPantalla } from "./canal"; // CTL1119F

export type EntradaControl =
    | { tipo: "gesto"; dedos: { id: number; puntos: [number, number, number][] }[]; sigue: boolean }
    | { tipo: "tecla"; cual: string }
    | { tipo: "volumen"; flujo: "multimedia" | "llamada" | "timbre" | "alarma"; nivel: number }
    | { tipo: "brillo"; nivel: number }
    | { tipo: "texto"; texto: string };

export type EstadoPantalla = "conectando" | "en-vivo" | "pausa-local" | "sin-pantalla" | "cerrada";

export interface CapacidadesVentana {
    gestos: boolean;
    maxDedos: number;
    teclas: string[];
    volumen: boolean;
    brillo: boolean;
    texto: boolean;
}

export interface AparatoVentana {
    volumen?: Record<string, number>;
    brillo?: number;
    bateria?: number;
    cargando?: boolean;
    red?: { wifi: boolean; datos: boolean; bluetooth: boolean };
}

export interface InstantaneaPantalla {
    estado: EstadoPantalla;
    motivo?: string;
    /** Desde cuándo está en este estado (ms epoch). */
    desde: number;
    flujo: MediaStream | null;
    pantalla: { ancho: number; alto: number; giro: 0 | 90 | 180 | 270 } | null;
    nivel: "ver" | "controlar";
    capacidades: CapacidadesVentana;
    aparato: AparatoVentana | null;
    /** RST1116A: la fuente REAL que contestó el aparato (nunca la que se pidió). */
    fuente?: FuenteReal;
    latenciaMs?: number;
    fps?: number;
    /** CTL1118M: por dónde van de verdad los cuadros y por qué enlace (la ventana lo dice; nunca lo pedido). */
    via?: "webrtc" | "malla";
    enlace?: string;
    /** CTL1118M: el lienzo donde se pintan los cuadros de la malla. Se enseña TAL CUAL (sin captureStream: WebKitGTK sin GStreamer no lo tiene). */
    lienzo?: HTMLCanvasElement | null;
    /** CTL1117A · S3: cuándo llega la hora máxima de la sesión (ms epoch), si el aparato la dijo. */
    caduca?: number;
    /** CTL1117J · S2: hasta dónde llega el control en el aparato controlado, tal como él lo dijo (null: no lo dijo, aparato anterior). */
    alcance?: "total" | "protegido";
}

/** (CTL1117J · S2) El `alcance` que dice el aparato controlado en su respuesta de capacidades; un valor raro no se inventa. */
export function alcanceDeNativo(...xs: unknown[]): "total" | "protegido" | undefined {
    for (const x of xs) {
        const a = x && typeof x === "object" ? (x as { alcance?: unknown }).alcance : undefined;
        if (a === "total" || a === "protegido") return a;
    }
    return undefined;
}

export const MAX_ENTRADA_POR_SEGUNDO = 60;
export const PAUSA_LOCAL_MS = 3200;
export const REFRESCO_APARATO_MS = 5000;
export const MEDIDA_MS = 1000;
export const ESPERA_CONEXION_MS = 25_000;
export const LOTE_CANDIDATOS_MS = 150;
/** Tamaño máximo de los argumentos de un `gesto` por orden: la orden firmada entera no pasa de 4 KB. */
export const MAX_ARGS_GESTO_BYTES = 2600;
const MAX_COLA = 256;
const INTERVALO_MIN_MS = 1000 / MAX_ENTRADA_POR_SEGUNDO;

const SIN_CAPACIDADES: CapacidadesVentana = { gestos: false, maxDedos: 0, teclas: [], volumen: false, brillo: false, texto: false };

// ── piezas puras ─────────────────────────────────────────────────────────────────────────────

type Gesto = Extract<EntradaControl, { tipo: "gesto" }>;

/** Adelgaza una lista de puntos a `max` conservando el primero y el último; el tiempo de los que se van pasa al siguiente. */
export function adelgazar(puntos: [number, number, number][], max = MAX_PUNTOS_DEDO): [number, number, number][] {
    if (puntos.length <= max) return puntos;
    const salida: [number, number, number][] = [];
    let acumulado = 0;
    const paso = (puntos.length - 1) / (max - 1);
    let siguiente = 0;
    for (let i = 0; i < puntos.length; i++) {
        acumulado += puntos[i][2];
        if (i === Math.round(siguiente) || i === puntos.length - 1) {
            if (salida.length < max) {
                salida.push([puntos[i][0], puntos[i][1], Math.min(acumulado, 10_000)]);
                acumulado = 0;
                siguiente += paso;
            }
        }
    }
    return salida;
}

/** Junta dos gestos seguidos: los puntos de cada dedo se suman (nunca se quita un dedo) y `sigue` es el del último. */
export function fundirGestos(a: Gesto, b: Gesto): Gesto {
    // UNI1115M · costura f: `enviar` solo funde gestos con los mismos dedos (si cambian, el levantado se perdería).
    const por = new Map<number, [number, number, number][]>();
    for (const d of a.dedos) por.set(d.id, [...d.puntos]);
    for (const d of b.dedos) por.set(d.id, [...(por.get(d.id) ?? []), ...d.puntos]);
    const dedos = [...por.entries()]
        .sort((x, y) => x[0] - y[0])
        .slice(0, MAX_DEDOS)
        .map(([id, puntos]) => ({ id, puntos: adelgazar(puntos) }));
    return { tipo: "gesto", dedos, sigue: b.sigue };
}

export function mismosDedos(a: Gesto, b: Gesto): boolean {
    return a.dedos.length === b.dedos.length && a.dedos.every((d) => b.dedos.some((e) => e.id === d.id));
}

/** Parte un gesto grande en varios que caben en una orden firmada (todos «siguen» menos el último). */
export function partirGesto(g: Gesto, maxBytes = MAX_ARGS_GESTO_BYTES): Gesto[] {
    const tam = (x: Gesto) => JSON.stringify({ dedos: x.dedos, sigue: x.sigue }).length;
    if (tam(g) <= maxBytes) return [g];
    const mayor = Math.max(...g.dedos.map((d) => d.puntos.length));
    let k = mayor;
    // UNI1115M · costura f: todos los dedos van en cada trozo (el que ya no tiene puntos repite el último con dt 0),
    // porque un dedo que un trozo no nombra se levanta.
    const trozo = (j: number, kk: number): Gesto => ({
        tipo: "gesto",
        dedos: g.dedos.map((d) => {
            const trz = d.puntos.slice(j * kk, (j + 1) * kk);
            if (trz.length) return { id: d.id, puntos: trz };
            const u = d.puntos[d.puntos.length - 1];
            return { id: d.id, puntos: [[u[0], u[1], 0] as [number, number, number]] };
        }),
        sigue: true,
    });
    while (k > 1 && tam(trozo(0, k)) > maxBytes) k -= 1;
    const n = Math.ceil(mayor / k);
    const lista: Gesto[] = [];
    for (let j = 0; j < n; j++) {
        const t = trozo(j, k);
        if (t.dedos.length) lista.push(t);
    }
    if (lista.length) lista[lista.length - 1].sigue = g.sigue;
    return lista;
}

function aArgs(e: EntradaControl): Args {
    const { tipo: _t, ...resto } = e as Record<string, unknown>;
    return resto;
}

/** Lo que dice el lado nativo (`control_capacidades().entrada`) → lo que la ventana espera. */
export function capacidadesDeNativo(x: unknown, nivel: "ver" | "controlar"): CapacidadesVentana {
    if (nivel !== "controlar" || !x || typeof x !== "object") return SIN_CAPACIDADES;
    const e = (x as { entrada?: Record<string, unknown> }).entrada;
    if (!e || typeof e !== "object") return SIN_CAPACIDADES;
    return {
        gestos: e.gestos === true,
        maxDedos: typeof e.max_dedos === "number" ? Math.max(0, Math.min(MAX_DEDOS, Math.floor(e.max_dedos))) : 0,
        teclas: Array.isArray(e.teclas) ? e.teclas.filter((t): t is string => typeof t === "string").slice(0, 32) : [],
        volumen: e.volumen === true,
        brillo: e.brillo === true,
        texto: e.texto === true,
    };
}

// ── lo que se inyecta ────────────────────────────────────────────────────────────────────────

export interface CanalDestinoLike {
    readyState: string;
    onopen: (() => void) | null;
    onmessage: ((e: { data: unknown }) => void) | null;
    onclose: (() => void) | null;
    send(d: string): void;
    close(): void;
}

export interface PeerDestinoLike {
    localDescription: { sdp?: string } | null;
    connectionState?: string;
    onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null;
    ontrack: ((e: { track: unknown; streams?: unknown[] }) => void) | null;
    onconnectionstatechange: (() => void) | null;
    addTransceiver(tipo: string, init: { direction: string }): unknown;
    createDataChannel(nombre: string, init: { ordered: boolean }): CanalDestinoLike;
    createOffer(): Promise<{ type?: string; sdp?: string }>;
    setLocalDescription(d?: unknown): Promise<void>;
    setRemoteDescription(d: { type: string; sdp: string }): Promise<void>;
    getStats(): Promise<{ forEach(cb: (v: Record<string, unknown>) => void): void }>;
    close(): void;
}

export interface OpcionesOrdenDestino {
    nivel: "ver" | "controlar";
    sesion?: string | null;
    esperaMs?: number;
}

export interface DepsDestino {
    /** Por el canal de control (sellado, con respuesta). */
    mandar: (nombre: string, args: Args, o: OpcionesOrdenDestino) => Promise<RespuestaOrden>;
    /** Firma sin mandar, para el canal de datos de la conexión. null si no se pudo. */
    firmar: (nombre: string, args: Args, o: OpcionesOrdenDestino) => Promise<{ sobre: unknown; nonce: string } | null>;
    iceServers: () => Promise<RTCIceServer[]>;
    crearPeer: (iceServers: RTCIceServer[]) => PeerDestinoLike;
    flujoDe: (pista: unknown) => MediaStream | null;
    ahora: () => number;
    /** Línea para el registro de llamadas que la app ya espeja (`control-senal paso=… lado=… resultado=… motivo=…`). */
    anotar?: (linea: string) => void;
    /** CTL1117A · S1/S2/S4: la sesión es una por neurona y se comparte con quien más la use en este aparato. */
    registro?: RegistroSesiones;
    /** CTL1118M · la pantalla por la malla cuando no hay WebRTC (sin esto, como antes: se cierra). */
    malla?: {
        hayWebRtc: () => boolean;
        crearLienzo: () => { pintar(jpeg: Uint8Array, ancho: number, alto: number): Promise<boolean>; flujo(): unknown; elemento?(): unknown; liberar(): void };
        /** El enlace real de las órdenes ahora (directo/capa y medio). */
        enlace: () => { camino: "directo" | "capa" | "sin-determinar"; medio: string | null };
        esperar: (ms: number) => Promise<void>;
    };
    /** CTL1117B · el medio elegido para este aparato: filtro de rutas, medida del par y permiso del canal de datos. Sin él, todo como antes. */
    medio?: {
        permitirCandidato: (candidato: string) => boolean;
        filtrarRespuesta: (sdp: string) => string;
        registrar: (peer: PeerDestinoLike, canalAbierto: () => boolean) => () => void;
        canalDatosOk: () => boolean;
    };
}

/** Lecturas de la ventana: esperan poco su respuesta para no retener el carril de la entrada (S6). */
const LECTURAS = new Set(["leer-aparato", "leer-estado"]);
export const ESPERA_LECTURA_MS = 2500;
/** CTL1117F: lo máximo que una orden puede ocupar el carril: pasado esto, la siguiente sale aunque la anterior no haya vuelto (una orden colgada no calla a la ventana). */
export const LIMITE_CARRIL_MS = 20_000;
/** CTL1117A · S6: un rechazo «repetida» o «limite» de una orden de entrada se reenvía UNA vez con otro seq, nunca se pierde en silencio. */
export const REINTENTO_LIMITE_MS = 350;

const FATALES = new Set(["sin-sesion", "sesion-caducada", "parada-nativa", "a-mano", "sin-indicador-nativo", "permiso-apagado", "no-autorizado", "otra-cuenta", "otro-destino", "sin-puerta"]);

export class PantallaDestino {
    private snap: InstantaneaPantalla;
    private oyentes = new Set<() => void>();
    private token: string | null = null;
    /** CTL1117E: ya se reintentó una vez con una sesión más nueva (solo una). */
    private reintentoSesion = false;
    private peer: PeerDestinoLike | null = null;
    private canal: CanalDestinoLike | null = null;
    private quitarMedio: (() => void) | null = null; // CTL1117B
    private cola: EntradaControl[] = [];
    private bombeando = false;
    private marcasEnvio: number[] = [];
    private pendientes = new Map<string, { nombre: string; t: number; entrada?: EntradaControl }>();
    private temporizadores = new Set<ReturnType<typeof setTimeout>>();
    private intervalos = new Set<ReturnType<typeof setInterval>>();
    private candidatos: string[] = [];
    private remotoListo = false;
    private fallo: string | null = null; // SEN1116A: motivo de señalización con paso y lado
    private cerrada = false;
    private ultimosCuadros = { n: 0, t: 0 };
    private sinCuadros = 0;
    private rtt: number | null = null;
    private medidaLatencia: number | null = null;
    private readonly registro: RegistroSesiones;
    /** CTL1118F: el carril es el de la neurona (compartido con las demás ventanas/banco que usan la misma sesión), no uno por destino. */
    private readonly carrilCompartido: { cola: Promise<unknown> };
    private reintentadas = new WeakSet<object>();
    private enMalla = false; // CTL1118M
    private lienzoMalla: { pintar(jpeg: Uint8Array, ancho: number, alto: number): Promise<boolean>; flujo(): unknown; elemento?(): unknown; liberar(): void } | null = null;
    private inicioConexion = 0;

    constructor(
        readonly neurona: string,
        private readonly d: DepsDestino,
        private readonly fuente: FuentePedida = FUENTE_DEFECTO,
    ) {
        this.registro = d.registro ?? new RegistroSesiones(d.ahora);
        this.carrilCompartido = this.registro.carrilDe(neurona);
        this.snap = { estado: "conectando", desde: d.ahora(), flujo: null, pantalla: null, nivel: "ver", capacidades: SIN_CAPACIDADES, aparato: null };
    }

    // ── observable ───────────────────────────────────────────────────────────────────────────

    instantanea(): InstantaneaPantalla {
        return this.snap;
    }

    suscribir(cb: () => void): () => void {
        this.oyentes.add(cb);
        return () => this.oyentes.delete(cb);
    }

    private poner(p: Partial<InstantaneaPantalla>): void {
        const cambiaEstado = p.estado !== undefined && p.estado !== this.snap.estado;
        this.snap = { ...this.snap, ...p, ...(cambiaEstado ? { desde: this.d.ahora() } : {}) };
        if (cambiaEstado && p.motivo === undefined) delete this.snap.motivo;
        for (const o of [...this.oyentes]) o();
    }

    private cada(ms: number, f: () => void): void {
        this.intervalos.add(setInterval(f, ms));
    }

    private despues(ms: number, f: () => void): void {
        const t = setTimeout(() => {
            this.temporizadores.delete(t);
            f();
        }, ms);
        this.temporizadores.add(t);
    }

    /** CTL1119F: obtiene las capacidades nativas del controlador (este aparato) para decidir la vía. */
    private async capacidadesControlador(): Promise<Awaited<ReturnType<typeof import("./nativo").capacidadesNativas>> | null> {
        try {
            const { capacidadesNativas } = await import("./nativo");
            return await capacidadesNativas();
        } catch {
            return null;
        }
    }

    /** CTL1119F: convierte la razón larga en un código corto para el registro (compatibilidad con lineaVia). */
    private causaCorto(razon: string): string {
        if (razon.includes("Linux sin WebRTC")) return "sin-webrtc";
        if (razon.includes("WebRTC no disponible")) return "sin-webrtc";
        return "sin-webrtc";
    }

    // ── abrir ────────────────────────────────────────────────────────────────────────────────

    async iniciar(): Promise<void> {
        if (this.cerrada || this.token) return;
        // CTL1117A · S1/S4: una sola `abrir-sesion` en vuelo por neurona; con una sesión viva se reutiliza (no se corta la imagen).
        const r = await this.registro.abrir(this.neurona, this.d.mandar, { nivel: "controlar", bajarSiNivel: true });
        if (this.cerrada) {
            if (r.ok) void this.registro.soltar(this.neurona, (r.resultado as { sesion?: string } | undefined)?.sesion ?? null, this.d.mandar);
            return;
        }
        const abierta = r.resultado as { sesion?: string; nivel?: string; caduca?: string; reutilizada?: boolean } | undefined;
        // CTL1118A: cada paso de la apertura deja su línea en el registro (sin ella, un «no pidió la pantalla» no se podía distinguir de un «la pidió y el aparato no contestó»).
        this.anotar(`control-senal paso=abrir lado=controlador resultado=${r.ok && typeof abierta?.sesion === "string" ? "ok" : "rechazo"} motivo=${this.motivoCorto(r.motivo)}${abierta?.reutilizada ? " reutilizada=si" : ""}`);
        if (!r.ok || typeof abierta?.sesion !== "string") return this.cerrar(claveParadaNativa(r.motivo || "sin-sesion", r.resultado), false); // CTL1117J · S3
        this.token = abierta.sesion;
        const caduca = typeof abierta.caduca === "string" ? Date.parse(abierta.caduca) : NaN;
        if (Number.isFinite(caduca)) this.poner({ caduca });
        const nivel = abierta.nivel === "controlar" ? "controlar" : "ver";
        this.poner({ nivel });

        this.anotar(`control-senal paso=pantalla-iniciar lado=controlador resultado=envio fuente=${this.fuente}`); // CTL1118A
        const t0 = this.d.ahora();
        const p = await this.orden("pantalla-iniciar", this.fuente === "proyeccion" ? { fuente: this.fuente } : {}, "ver");
        this.anotar(`control-senal paso=pantalla-iniciar lado=controlador resultado=${p.ok ? "ok" : "rechazo"} motivo=${this.motivoCorto(p.motivo)} ms=${Math.max(0, Math.min(999_999, Math.round(this.d.ahora() - t0)))}`); // CTL1118A
        if (this.cerrada) return;
        if (!p.ok) return this.cerrar(p.motivo, false);
        const res = (p.resultado ?? {}) as Record<string, unknown>;
        const real = res.fuente;
        const fuente: FuenteReal | undefined = real === "proyeccion" || real === "accesibilidad" ? real : undefined;
        if (res.ok !== true) {
            // La orden se cumplió pero la fuente de pantalla no está: lo arregla la persona EN el aparato; se dice qué falta.
            const falta = Array.isArray(res.falta) && typeof res.falta[0] === "string" ? res.falta[0] : typeof res.motivo === "string" ? res.motivo : "sin-pantalla";
            this.poner({ estado: "sin-pantalla", motivo: falta, capacidades: SIN_CAPACIDADES, ...(fuente ? { fuente } : {}) });
            this.cada(REFRESCO_APARATO_MS, () => void this.leerAparato());
            return;
        }
        // UNI1115M · costura e: los cuadros llegan YA derechos (como los ve la persona en la tableta). El `giro` de lo
        // nativo es solo informativo: la ventana no gira nada, así la imagen sale derecha y el toque cae donde se hizo.
        this.poner({
            pantalla: { ancho: Number(res.ancho) || 0, alto: Number(res.alto) || 0, giro: 0 },
            capacidades: capacidadesDeNativo(res.capacidades, nivel),
            ...(fuente ? { fuente } : {}),
            ...(alcanceDeNativo(res.capacidades, res) ? { alcance: alcanceDeNativo(res.capacidades, res) } : {}), // CTL1117J · S2
        });
        this.inicioConexion = this.d.ahora();
        // CTL1119F: decidir la vía de pantalla según capacidades (WebRTC o malla).
        let viaRazon: { via: "webrtc" | "malla"; razon: string } | null = null;
        if (this.d.malla) {
            const capsControlador = await this.capacidadesControlador();
            viaRazon = await decidirViaPantalla(capsControlador, null);
            if (viaRazon.via === "malla") {
                this.cada(REFRESCO_APARATO_MS, () => void this.leerAparato());
                this.pasarAMalla(this.causaCorto(viaRazon.razon));
                void this.leerAparato();
                return;
            }
        }
        try {
            await this.negociar();
        } catch (e) {
            if (this.d.malla && !this.cerrada) {
                this.cada(REFRESCO_APARATO_MS, () => void this.leerAparato());
                this.pasarAMalla("sin-oferta");
                void this.leerAparato();
                return;
            }
            // El motivo lleva el paso y el lado («senal-oferta-aparato-argumentos»); la ventana lo dice en palabras.
            const m = e instanceof Error && /^senal-/.test(e.message) ? e.message : "negociacion";
            if (m === "negociacion") this.anotar("control-senal paso=conexion lado=controlador resultado=error motivo=negociacion");
            if (!this.cerrada) await this.cerrar(m, true);
            return;
        }
        if (this.cerrada) return;
        if (this.d.malla) this.despues(ESPERA_ICE_MS, () => this.snap.estado === "conectando" && !this.enMalla && this.pasarAMalla("ice-sin-conexion"));
        // CTL1119F: a los 10 s en "conectando" sin pantalla, avisar la causa y la vía intentada.
        this.despues(10_000, () => {
            if (this.snap.estado === "conectando" && !this.enMalla && !this.snap.motivo) {
                const causa = viaRazon?.razon ?? (this.d.malla ? "negociación WebRTC" : "sin WebRTC");
                this.poner({ motivo: `Conectando… (${causa}). Se intentará pantalla por cuadros.` });
            }
        });
        this.despues(ESPERA_CONEXION_MS, () => {
            if (this.snap.estado === "conectando" && !this.enMalla) void this.cerrar("sin-conexion", true);
        });
        this.cada(REFRESCO_APARATO_MS, () => void this.leerAparato());
        this.cada(MEDIDA_MS, () => void this.medir());
        void this.leerAparato();
    }

    private async negociar(): Promise<void> {
        const ice = await this.d.iceServers().catch(() => [] as RTCIceServer[]);
        const peer = this.d.crearPeer(ice);
        this.peer = peer;
        this.quitarMedio = this.d.medio?.registrar(peer, () => this.canal?.readyState === "open") ?? null; // CTL1117B
        peer.addTransceiver("video", { direction: "recvonly" }); // primero: su m-line es la 0 (los candidatos van a ella)
        const canal = peer.createDataChannel("entrada", { ordered: true });
        this.canal = canal;
        canal.onmessage = (e) => this.alMensajeCanal(e.data);
        canal.onclose = () => {
            if (this.canal === canal) this.canal = null;
        };
        peer.ontrack = (e) => {
            const f = (e.streams?.[0] as MediaStream | undefined) ?? this.d.flujoDe(e.track);
            if (f) this.poner({ flujo: f });
        };
        peer.onconnectionstatechange = () => {
            const s = peer.connectionState;
            if (s === "connected" && (this.snap.estado === "conectando" || this.snap.estado === "sin-pantalla")) this.poner({ estado: "en-vivo" });
            if (this.enMalla) return;
            if (s === "failed" && this.d.malla) return this.pasarAMalla("ice-fallido");
            if (s === "failed" || s === "closed") void this.cerrar("conexion-perdida", true);
        };
        peer.onicecandidate = (e) => {
            if (!e.candidate?.candidate) return;
            if (this.d.medio && !this.d.medio.permitirCandidato(e.candidate.candidate)) return; // CTL1117B: el medio elegido no deja esta ruta
            this.candidatos.push(e.candidate.candidate);
            if (this.remotoListo) this.despues(LOTE_CANDIDATOS_MS, () => void this.soltarCandidatos());
        };
        const oferta = await peer.createOffer();
        await peer.setLocalDescription(oferta);
        const sdp = peer.localDescription?.sdp ?? oferta.sdp;
        if (typeof sdp !== "string") throw this.falloSenal("oferta", "controlador", "sin-oferta");
        // SEN1116A: la oferta (4–6 KB) y la respuesta viajan en partes numeradas dentro del tope de la orden firmada.
        let partes: ParteSenal[];
        try {
            partes = await trocear(sdp, "oferta");
        } catch (e) {
            throw this.falloSenal("oferta", "controlador", e instanceof Error ? e.message : "fallo");
        }
        let fin: unknown;
        for (const p of partes) {
            const r = await this.orden("pantalla-senal", { ...p }, "ver");
            if (!r.ok) throw this.falloSenal("oferta", "aparato", r.motivo || "sin-respuesta", `parte ${p.i + 1} de ${p.n}`);
            fin = r.resultado;
        }
        const f = fin as { lista?: boolean; n?: number; total?: number; sha?: string } | undefined;
        if (!f?.lista || typeof f.n !== "number" || f.n < 1 || f.n > MAX_PARTES) throw this.falloSenal("respuesta", "aparato", "respuesta-invalida");
        this.anotar(`control-senal paso=oferta lado=controlador resultado=ok partes=${partes.length} largo=${sdp.length}`);
        const neg = partes[0].neg;
        const piezas: ParteSenal[] = [];
        const reens = new Reensamblador();
        let respuesta: string | null = null;
        for (let i = 0; i < f.n; i++) {
            const r = await this.orden("pantalla-senal", { neg, pide: i }, "ver");
            if (!r.ok) throw this.falloSenal("respuesta", "aparato", r.motivo || "sin-respuesta", `parte ${i + 1} de ${f.n}`);
            const q = leerParte({ ...(r.resultado as Record<string, unknown>) });
            if (!q || q.tipo !== "respuesta" || q.neg !== neg) throw this.falloSenal("respuesta", "controlador", "respuesta-invalida");
            piezas.push(q);
        }
        try {
            for (const q of piezas) respuesta = await reens.meter(q);
        } catch (e) {
            throw this.falloSenal("respuesta", "controlador", e instanceof Error ? e.message : "fallo");
        }
        if (respuesta === null) throw this.falloSenal("respuesta", "controlador", "respuesta-incompleta");
        try {
            await peer.setRemoteDescription({ type: "answer", sdp: this.d.medio ? this.d.medio.filtrarRespuesta(respuesta) : respuesta });
        } catch {
            throw this.falloSenal("respuesta", "controlador", "respuesta-rechazada");
        }
        this.anotar(`control-senal paso=respuesta lado=controlador resultado=ok partes=${f.n} largo=${respuesta.length}`);
        this.remotoListo = true;
        await this.soltarCandidatos();
    }

    /**
     * CTL1118M · la pantalla por la malla: se suelta la conexión de vídeo y los cuadros se piden con `pantalla-cuadro`, un cuadro en vuelo como mucho,
     * y se pintan en un lienzo propio cuyo flujo es el mismo `flujo` de la ventana. Tamaño y calidad siguen al coste medido de cada cuadro.
     */
    private pasarAMalla(causa: string): void {
        if (this.enMalla || this.cerrada || !this.d.malla) return;
        this.enMalla = true;
        try {
            this.quitarMedio?.();
            this.peer?.close();
        } catch {
            /* ya cerrada */
        }
        this.quitarMedio = null;
        this.peer = null;
        this.canal = null;
        this.candidatos = [];
        const l = this.d.malla.crearLienzo();
        this.lienzoMalla = l;
        const e = this.d.malla.enlace();
        this.anotar(lineaVia({ via: "malla", enlace: e.medio ? `${e.camino}:${e.medio}` : null, cuadrosS: null, causa }));
        const motivoMalla = "Pantalla por cuadros: sin vídeo WebRTC en este aparato";
        this.poner({ via: "malla", ...(e.medio ? { enlace: `${e.camino}:${e.medio}` } : {}), flujo: l.flujo() as MediaStream | null, lienzo: (l.elemento?.() as HTMLCanvasElement | null | undefined) ?? null, motivo: motivoMalla });
        void this.bucleMalla(l);
    }

    private async bucleMalla(l: NonNullable<PantallaDestino["lienzoMalla"]>): Promise<void> {
        const m = this.d.malla;
        if (!m) return;
        const reens = new ReensambladorCuadro();
        let desde = 0;
        let vacios = 0;
        let fallos = 0;
        let ritmo: EstadoRitmo = RITMO_INICIAL;
        let coste: number | null = null;
        let enMedida = 0;
        let cuadros = 0;
        let t0fps = this.d.ahora();
        let ultimaLinea = t0fps;
        while (!this.cerrada && this.enMalla) {
            const camino = m.enlace();
            const plan = planPorCamino(camino.camino, ritmo.nivel);
            const t0 = this.d.ahora();
            const r = await this.orden("pantalla-cuadro", { desde, pide: 0, nivel: plan.nivel }, "ver");
            if (this.cerrada) return;
            if (!r.ok) {
                fallos += 1;
                if (fallos >= 5) return void (await this.cerrar(r.motivo === "sin-pantalla" ? "sin-pantalla" : "sin-cuadros", true));
                await m.esperar(300 * fallos);
                continue;
            }
            fallos = 0;
            const res = (r.resultado ?? {}) as Record<string, unknown>;
            if (res.nuevo === false) {
                vacios += 1;
                if (this.snap.estado !== "en-vivo" && this.snap.estado !== "pausa-local") this.poner({ estado: "en-vivo", motivo: this.snap.motivo });
                await m.esperar(esperaSinCuadro(vacios));
                continue;
            }
            vacios = 0;
            const p0 = leerParteCuadro(res);
            if (!p0) {
                fallos += 1;
                continue;
            }
            let jpeg: Uint8Array | null = null;
            try {
                jpeg = reens.meter(p0);
                for (let i = 1; jpeg === null && i < p0.n && !this.cerrada; i++) {
                    const q = await this.orden("pantalla-cuadro", { desde, pide: i, num: p0.num }, "ver");
                    const pq = q.ok ? leerParteCuadro(q.resultado) : null;
                    if (!pq) throw new Error("parte");
                    jpeg = reens.meter(pq);
                }
            } catch {
                fallos += 1;
                continue;
            }
            if (!jpeg || this.cerrada) continue;
            desde = p0.num;
            const ancho = Number(res.ancho) || 0;
            const alto = Number(res.alto) || 0;
            if (ancho > 0 && alto > 0 && (this.snap.pantalla?.ancho !== ancho || this.snap.pantalla?.alto !== alto)) this.poner({ pantalla: { ancho, alto, giro: 0 } });
            if (await l.pintar(jpeg, ancho, alto).catch(() => false)) {
                cuadros += 1;
                if (this.snap.estado !== "en-vivo" && this.snap.estado !== "pausa-local") this.poner({ estado: "en-vivo", motivo: this.snap.motivo });
            }
            const ms = this.d.ahora() - t0;
            coste = mediaCoste(coste, ms);
            enMedida += 1;
            if (enMedida >= Math.min(CUADROS_POR_MEDIDA, 10)) {
                enMedida = 0;
                const { estado, cambio } = siguienteRitmo(ritmo, coste, UMBRALES_MALLA);
                ritmo = estado;
                if (cambio) this.anotar(lineaVia({ via: "malla", enlace: camino.medio ? `${camino.camino}:${camino.medio}` : null, cuadrosS: null, causa: "ritmo", kbps: (jpeg.length * 8) / Math.max(1, ms), nivel: estado.nivel }));
            }
            const ahora = this.d.ahora();
            if (ahora - t0fps >= 1000) {
                const fps = (cuadros * 1000) / (ahora - t0fps);
                cuadros = 0;
                t0fps = ahora;
                this.poner({ fps: Math.round(fps * 10) / 10 });
                if (ahora - ultimaLinea >= 5000) {
                    ultimaLinea = ahora;
                    this.anotar(lineaVia({ via: "malla", enlace: camino.medio ? `${camino.camino}:${camino.medio}` : null, cuadrosS: fps, kbps: (jpeg.length * 8) / Math.max(1, ms) }));
                }
            }
            if (plan.pausaMs) await m.esperar(plan.pausaMs);
        }
    }

    /** CTL1118A: un motivo para el registro: solo letras minúsculas y guiones, acotado. */
    private motivoCorto(m: unknown): string {
        return typeof m === "string" && /^[a-z-]{1,32}$/.test(m) ? m : "fallo";
    }

    private anotar(l: string): void {
        try {
            this.d.anotar?.(l);
        } catch {
            /* el registro no puede romper el control */
        }
    }

    /** Deja la línea del registro y el motivo en palabras para la ventana; devuelve el error para lanzarlo. */
    private falloSenal(paso: string, lado: "controlador" | "aparato", motivo: string, donde = ""): Error {
        const m = /^[a-z-]{1,32}$/.test(motivo) ? motivo : "fallo";
        this.anotar(`control-senal paso=${paso} lado=${lado} resultado=rechazo motivo=${m}${donde ? ` donde=${donde.replace(/ /g, "_")}` : ""}`);
        this.fallo = `senal-${paso}-${lado}-${m}`;
        return new Error(this.fallo);
    }

    private async soltarCandidatos(): Promise<void> {
        while (this.candidatos.length && !this.cerrada) {
            const lote = this.candidatos.splice(0, 8);
            const r = await this.orden("pantalla-senal", { candidatos: lote }, "ver");
            if (!r.ok) this.anotar(`control-senal paso=candidatos lado=aparato resultado=rechazo motivo=${/^[a-z-]{1,32}$/.test(r.motivo) ? r.motivo : "fallo"}`);
        }
    }

    // ── órdenes ──────────────────────────────────────────────────────────────────────────────

    private async orden(nombre: string, args: Args, nivel: "ver" | "controlar"): Promise<RespuestaOrden> {
        const t0 = this.d.ahora();
        const r = await this.emitir(nombre, args, { nivel, sesion: this.token });
        this.tomarLatencia(this.d.ahora() - t0);
        if (r.ok) this.registro.usada(this.neurona);
        if (!r.ok && FATALES.has(r.motivo)) {
            const usada = this.token;
            if (r.motivo === "sin-sesion" || r.motivo === "sesion-caducada") {
                this.registro.olvidar(this.neurona, usada);
                // CTL1117E: si el registro compartido ya tiene (o está abriendo) una sesión MÁS NUEVA que la que se intentó, se reintenta
                // UNA vez con ella antes de darse por cerrada (la ventana mandó con la vieja y el banco abrió la nueva 0,3 s después).
                if (!this.reintentoSesion && usada && !this.cerrada) {
                    this.reintentoSesion = true;
                    const nueva = await this.registro.masNuevaQue(this.neurona, usada);
                    if (nueva && !this.cerrada) {
                        this.token = nueva;
                        return this.orden(nombre, args, nivel);
                    }
                }
            }
            void this.cerrar(claveParadaNativa(r.motivo, r.resultado), false); // CTL1117C: la parada del aparato dice su causa real
        }
        return r;
    }

    /** CTL1117A · S6: todo lo que sale de esta ventana pasa por UN carril: se firma y se manda en orden, así el `seq` llega creciente. */
    private enCarril<T>(f: () => Promise<T>): Promise<T> {
        const p = this.carrilCompartido.cola.then(f, f);
        // CTL1117F: el turno acaba cuando vuelve la orden O pasa LIMITE_CARRIL_MS; una que no vuelve nunca no deja sin lecturas (ni sin renovar) la sesión.
        this.carrilCompartido.cola = new Promise<void>((fin) => {
            const t = setTimeout(fin, LIMITE_CARRIL_MS);
            const suelta = () => { clearTimeout(t); fin(); };
            p.then(suelta, suelta);
        });
        return p;
    }

    /** Las lecturas esperan poco: mientras una espera su respuesta por el relé, el carril no deja pasar otra orden (el `seq` llegaría cruzado). */
    private emitir(nombre: string, args: Args, o: OpcionesOrdenDestino): Promise<RespuestaOrden> {
        const lectura = LECTURAS.has(nombre);
        return this.enCarril(() => this.d.mandar(nombre, args, lectura ? { ...o, esperaMs: o.esperaMs ?? ESPERA_LECTURA_MS } : o));
    }

    private tomarLatencia(ms: number): void {
        this.medidaLatencia = this.medidaLatencia === null ? ms : this.medidaLatencia * 0.7 + ms * 0.3;
        this.publicarLatencia();
    }

    private publicarLatencia(): void {
        const v = this.rtt ?? this.medidaLatencia;
        if (v !== null && Math.round(v) !== this.snap.latenciaMs) this.poner({ latenciaMs: Math.round(v) });
    }

    private async leerAparato(): Promise<void> {
        if (this.cerrada || !this.token) return;
        const r = await this.orden("leer-aparato", {}, "ver");
        if (this.cerrada || !r.ok) return;
        // CTL1118F: la fuente REAL ahora (si la fluida se aceptó o se cortó a media sesión, la ventana lo sabe sin reabrir nada).
        const real = fuenteRealValida((r.resultado as { fuente?: unknown } | undefined)?.fuente);
        if (real && real !== this.snap.fuente) {
            this.anotar(`control-fuente lado=controlador fuente=${real} antes=${this.snap.fuente ?? "ninguna"}`);
            this.poner({ fuente: real });
        }
        const a = (r.resultado as { aparato?: Record<string, unknown> } | undefined)?.aparato;
        if (a && typeof a === "object") {
            this.poner({ aparato: a as AparatoVentana });
            const al = alcanceDeNativo(a, (r.resultado as { capacidades?: unknown } | undefined)?.capacidades); // CTL1117J · S2
            if (al && al !== this.snap.alcance) this.poner({ alcance: al });
            // UNI1115M · costura e: si la tableta se giró, los cuadros siguen llegando derechos pero con otra proporción: la ventana la sigue.
            const p = (a as { pantalla?: { ancho?: unknown; alto?: unknown } }).pantalla;
            const w = Number(p?.ancho);
            const h = Number(p?.alto);
            const ahora = this.snap.pantalla;
            if (w > 0 && h > 0 && ahora && ahora.ancho > 0 && ahora.alto > 0 && Math.abs(w / h - ahora.ancho / ahora.alto) > 0.02 * (ahora.ancho / ahora.alto)) {
                this.poner({ pantalla: { ancho: Math.round(w), alto: Math.round(h), giro: 0 } });
            }
        }
    }

    /**
     * CTL1118F: la persona de ESTA ventana pide la pantalla fluida con la sesión en marcha. No reabre nada: manda `pantalla-iniciar` con `mantener`
     * y el aparato abre su diálogo (solo su persona lo acepta); si ya está en fluida o no hay pantalla, no hace nada. true si la orden salió.
     */
    async pedirFluida(): Promise<boolean> {
        if (this.cerrada || !this.token || this.snap.fuente === "proyeccion" || (this.snap.estado !== "en-vivo" && this.snap.estado !== "pausa-local" && this.snap.estado !== "conectando")) return false;
        this.anotar("control-fuente lado=controlador paso=fluida-pedida-por-la-persona");
        const r = await this.orden("pantalla-iniciar", { fuente: "proyeccion", mantener: true }, "ver");
        this.anotar(`control-fuente lado=controlador paso=fluida-pedida-por-la-persona resultado=${r.ok ? "ok" : "rechazo"} motivo=${this.motivoCorto(r.motivo)}`);
        const real = fuenteRealValida((r.resultado as { fuente?: unknown } | undefined)?.fuente);
        if (r.ok && real && !this.cerrada) this.poner({ fuente: real });
        return r.ok;
    }

    private async medir(): Promise<void> {
        const peer = this.peer;
        if (!peer || this.cerrada) return;
        try {
            const st = await peer.getStats();
            let decodificados: number | null = null;
            let rtt: number | null = null;
            st.forEach((v) => {
                if (v.type === "inbound-rtp" && v.kind === "video" && typeof v.framesDecoded === "number") decodificados = v.framesDecoded;
                if (v.type === "candidate-pair" && v.nominated === true && typeof v.currentRoundTripTime === "number") rtt = v.currentRoundTripTime * 1000;
            });
            const t = this.d.ahora();
            if (decodificados !== null) {
                const dt = (t - this.ultimosCuadros.t) / 1000;
                const primera = this.ultimosCuadros.t === 0;
                const fps = !primera && dt > 0 ? Math.max(0, (decodificados - this.ultimosCuadros.n) / dt) : 0;
                this.ultimosCuadros = { n: decodificados, t };
                this.sinCuadros = !primera && fps === 0 ? this.sinCuadros + 1 : 0;
                this.poner({ fps: Math.round(fps * 10) / 10 });
                // Tres medidas seguidas sin un cuadro nuevo: no se enseña como vivo lo que no llega.
                if (this.sinCuadros >= 3 && this.snap.estado === "en-vivo") this.poner({ estado: "sin-pantalla", motivo: "sin-cuadros" });
                if (this.sinCuadros === 0 && this.snap.estado === "sin-pantalla" && this.snap.motivo === "sin-cuadros") this.poner({ estado: "en-vivo" });
            }
            if (rtt !== null) {
                this.rtt = rtt;
                this.publicarLatencia();
            }
        } catch {
            /* sin estadísticas: la latencia sale de las órdenes */
        }
    }

    // ── entrada ──────────────────────────────────────────────────────────────────────────────

    /** Pone una orden de entrada en la cola. false si no se puede mandar (el motivo queda en el estado cuando importa). */
    enviar(entrada: EntradaControl): boolean {
        const s = this.snap;
        if (this.cerrada || (s.estado !== "en-vivo" && s.estado !== "pausa-local")) return false;
        if (s.nivel !== "controlar" || !entrada || typeof entrada !== "object") return false;
        const def = definicion(entrada.tipo);
        if (!def?.entrada) return false;
        const args = def.validar(aArgs(entrada));
        if (!args) return false;
        const c = s.capacidades;
        if (entrada.tipo === "gesto" && !c.gestos) return false;
        if (entrada.tipo === "tecla" && c.teclas.length > 0 && !c.teclas.includes(entrada.cual)) return false;
        if (entrada.tipo === "volumen" && !c.volumen) return false;
        if (entrada.tipo === "brillo" && !c.brillo) return false;
        if (entrada.tipo === "texto" && !c.texto) return false;
        const e = { tipo: entrada.tipo, ...args } as EntradaControl;
        // Los dedos que esta ventana no admite se quitan, no la orden entera.
        if (e.tipo === "gesto" && c.maxDedos > 0 && e.dedos.length > c.maxDedos) e.dedos = e.dedos.slice(0, c.maxDedos);
        const ult = this.cola[this.cola.length - 1];
        if (e.tipo === "gesto" && ult?.tipo === "gesto" && ult.sigue && mismosDedos(ult, e)) this.cola[this.cola.length - 1] = fundirGestos(ult, e);
        else if (e.tipo === "volumen" && ult?.tipo === "volumen" && ult.flujo === e.flujo) this.cola[this.cola.length - 1] = e;
        else if (e.tipo === "brillo" && ult?.tipo === "brillo") this.cola[this.cola.length - 1] = e;
        else {
            if (this.cola.length >= MAX_COLA) return false;
            this.cola.push(e);
        }
        void this.bombear();
        return true;
    }

    /** Órdenes esperando turno (para pruebas y para la ventana). */
    enCola(): number {
        return this.cola.length;
    }

    private async bombear(): Promise<void> {
        if (this.bombeando) return;
        this.bombeando = true;
        try {
            while (this.cola.length && !this.cerrada) {
                const t = this.d.ahora();
                this.marcasEnvio = this.marcasEnvio.filter((x) => t - x < 1000);
                const espera = this.marcasEnvio.length >= MAX_ENTRADA_POR_SEGUNDO ? 1000 - (t - this.marcasEnvio[0]) + 1 : INTERVALO_MIN_MS - (t - (this.marcasEnvio[this.marcasEnvio.length - 1] ?? -1e9));
                if (espera > 0) {
                    await new Promise<void>((r) => this.despues(Math.ceil(espera), r));
                    continue;
                }
                const e = this.cola.shift() as EntradaControl;
                const trozos = e.tipo === "gesto" ? partirGesto(e) : [e];
                const [primero, ...resto] = trozos;
                if (resto.length) this.cola.unshift(...resto);
                this.marcasEnvio.push(this.d.ahora());
                await this.enviarUna(primero);
            }
        } finally {
            this.bombeando = false;
        }
    }

    private async enviarUna(e: EntradaControl): Promise<void> {
        const nombre = e.tipo;
        const args = aArgs(e);
        const o: OpcionesOrdenDestino = { nivel: "controlar", sesion: this.token };
        const canal = this.canal;
        const sale = await this.enCarril(async (): Promise<RespuestaOrden | null> => {
            if (this.cerrada) return null;
            if (canal && canal.readyState === "open" && (this.d.medio?.canalDatosOk() ?? true)) { // CTL1117B
                const f = await this.d.firmar(nombre, args, o);
                if (f) {
                    try {
                        canal.send(JSON.stringify(f.sobre));
                        this.pendientes.set(f.nonce, { nombre, t: this.d.ahora(), entrada: e });
                        if (this.pendientes.size > 512) this.pendientes.delete(this.pendientes.keys().next().value as string);
                        return null;
                    } catch {
                        /* el canal se cayó entre medias: sale por el de control */
                    }
                }
            }
            return this.d.mandar(nombre, args, { ...o, esperaMs: 4000 });
        });
        if (sale) this.alRespuestaEntrada(sale, e, "control");
    }

    private alMensajeCanal(data: unknown): void {
        if (typeof data !== "string" || data.length > 8192) return;
        let x: unknown;
        try {
            x = JSON.parse(data);
        } catch {
            return;
        }
        if (!esRespuesta(x)) return;
        const p = this.pendientes.get(x.nonce);
        if (!p) return;
        this.pendientes.delete(x.nonce);
        this.tomarLatencia(this.d.ahora() - p.t);
        this.alRespuestaEntrada(x, p.entrada, "datos");
    }

    private alRespuestaEntrada(r: RespuestaOrden, entrada?: EntradaControl, via?: "datos" | "control"): void {
        if (this.cerrada) return;
        if (r.ok) {
            if (this.snap.estado === "pausa-local") this.poner({ estado: "en-vivo" });
            // CTL1117A · S9: un aviso de una orden anterior no se queda cuando la siguiente sí se cumplió.
            else if (this.snap.estado === "en-vivo" && this.snap.motivo !== undefined) {
                const { motivo: _m, ...resto } = this.snap;
                this.snap = resto as InstantaneaPantalla;
                for (const o of [...this.oyentes]) o();
            }
            return;
        }
        if (FATALES.has(r.motivo)) {
            if (r.motivo === "sin-sesion" || r.motivo === "sesion-caducada") this.registro.olvidar(this.neurona, this.token);
            return void this.cerrar(claveParadaNativa(r.motivo, r.resultado), false); // CTL1117C
        }
        // CTL1117A · S6: «repetida» (seq cruzado) o «limite»: la orden de la persona no se pierde; se manda otra vez, una sola.
        if ((r.motivo === "repetida" || r.motivo === "limite") && entrada && !this.reintentadas.has(entrada)) {
            this.reintentadas.add(entrada);
            // CTL1118F: una línea con la VÍA por la que salió el rechazado (datos = canal de la conexión, control = canal de órdenes) y qué se hace.
            this.anotar(`control-orden tipo=${entrada.tipo} resultado=rechazo motivo=${r.motivo} via=${via ?? "desconocida"} reintento=si`);
            const poner = () => {
                if (this.cerrada) return;
                this.cola.unshift(entrada);
                void this.bombear();
            };
            if (r.motivo === "limite") this.despues(REINTENTO_LIMITE_MS, poner);
            else poner();
            return;
        }
        if (r.motivo === "pausa-local") {
            // La persona tocó su pantalla: el control espera hasta que pasen 3 s sin tocar.
            if (this.snap.estado !== "pausa-local") {
                this.poner({ estado: "pausa-local", motivo: "pausa-local" });
                this.despues(PAUSA_LOCAL_MS, () => {
                    if (this.snap.estado === "pausa-local") this.poner({ estado: "en-vivo" });
                });
            }
            return;
        }
        // regla G, límite, sin servicio… la orden no se cumplió; se dice una vez y se quita sola.
        this.poner({ motivo: r.motivo });
        this.despues(PAUSA_LOCAL_MS, () => {
            if (this.snap.motivo === r.motivo && this.snap.estado !== "cerrada" && this.snap.estado !== "sin-pantalla") {
                const { motivo: _m, ...resto } = this.snap;
                this.snap = resto as InstantaneaPantalla;
                for (const o of [...this.oyentes]) o();
            }
        });
    }

    // ── cerrar ───────────────────────────────────────────────────────────────────────────────

    /** Cierra todo. `avisar`: manda `pantalla-parar` y `cerrar-sesion` (no si la otra neurona ya cerró). Idempotente. */
    async cerrar(motivo = "cerrada", avisar = true): Promise<void> {
        if (this.cerrada) return;
        this.cerrada = true;
        this.cola = [];
        for (const t of this.temporizadores) clearTimeout(t);
        for (const i of this.intervalos) clearInterval(i);
        this.temporizadores.clear();
        this.intervalos.clear();
        const token = this.token;
        try {
            this.canal?.close();
        } catch {
            /* ya cerrado */
        }
        try {
            this.peer?.close();
        } catch {
            /* ya cerrada */
        }
        this.canal = null;
        this.peer = null;
        this.quitarMedio?.(); // CTL1117B
        this.quitarMedio = null;
        try {
            this.lienzoMalla?.liberar();
        } catch {
            /* nada */
        }
        this.lienzoMalla = null;
        this.poner({ estado: "cerrada", motivo, flujo: null, lienzo: null });
        if (avisar && token) {
            const o = { nivel: "ver" as const, sesion: token, esperaMs: 3000 };
            await this.d.mandar("pantalla-parar", {}, o).catch(() => undefined);
            // CTL1117A · S2: se cierra SU sesión (su token) y solo si nadie más en este aparato la sigue usando.
            await this.registro.soltar(this.neurona, token, this.d.mandar);
        } else if (token) {
            this.registro.olvidar(this.neurona, token);
        }
        this.token = null;
    }
}

// ── implementación real ──────────────────────────────────────────────────────────────────────

/** CTL1118M: el lienzo donde quien manda pinta los cuadros que llegan por la malla; su flujo es el que enseña la ventana. */
function crearLienzoMalla() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const flujo = typeof canvas.captureStream === "function" ? canvas.captureStream(0) : null;
    const pista = flujo?.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    return {
        async pintar(jpeg: Uint8Array, ancho: number, alto: number): Promise<boolean> {
            if (!ctx) return false;
            let bmp: ImageBitmap | null = null;
            try {
                bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
                if (canvas.width !== ancho || canvas.height !== alto) {
                    canvas.width = ancho;
                    canvas.height = alto;
                }
                ctx.drawImage(bmp, 0, 0, ancho, alto);
                pista?.requestFrame?.();
                return true;
            } catch {
                return false;
            } finally {
                bmp?.close();
            }
        },
        flujo: () => flujo,
        elemento: () => canvas,
        liberar() {
            for (const t of flujo?.getTracks() ?? []) t.stop();
            canvas.width = 0;
            canvas.height = 0;
        },
    };
}

/** Las piezas reales: canal de control, firma del aparato, configuración ICE de las llamadas y RTCPeerConnection. */
export function depsReales(neurona: string): DepsDestino {
    return {
        registro: registroGlobal,
        mandar: async (nombre, args, o) => (await import("./canal")).mandarOrden(neurona, nombre, args, { nivel: o.nivel, sesion: o.sesion ?? null, esperaMs: o.esperaMs }),
        firmar: async (nombre, args, o) => (await import("./canal")).firmarParaCanalDirecto(neurona, nombre, args, { nivel: o.nivel, sesion: o.sesion ?? null }),
        iceServers: async () => (await (await import("@/lib/llamadas/ice")).obtenerIceServidores()).iceServers,
        crearPeer: (iceServers) => new RTCPeerConnection(configuracionIce(neurona, iceServers)) as unknown as PeerDestinoLike, // CTL1117B: política del medio elegido
        medio: {
            permitirCandidato: (c) => permitirCandidato(neurona, c),
            filtrarRespuesta: (sdp) => filtrarRespuesta(neurona, sdp),
            registrar: (peer, abierto) => registrarConexion(neurona, peer, abierto),
            canalDatosOk: () => canalDatosOk(neurona),
        },
        flujoDe: (pista) => (typeof MediaStream === "function" ? new MediaStream([pista as MediaStreamTrack]) : null),
        // CTL1118M: sin RTCPeerConnection (WebKitGTK sin GStreamer) o sin negociación que llegue, la pantalla va por la malla.
        malla: {
            hayWebRtc: () => typeof RTCPeerConnection === "function",
            crearLienzo: crearLienzoMalla,
            enlace: () => {
                const o = instantaneaMedio(neurona).ordenes;
                return { camino: o.camino === "capa" ? "capa" : o.camino === "directo" ? "directo" : "sin-determinar", medio: o.medio };
            },
            esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
        },
        ahora: () => Date.now(),
        anotar: (l) => {
            void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", null, l)).catch(() => undefined);
            try {
                console.info(`[control-neuronas] ${l}`);
            } catch {
                /* nada */
            }
        },
    };
}

export interface OpcionesPantallaDestino {
    /** RST1116A: lo que pide la persona. «auto» no manda el campo (comportamiento de siempre). */
    fuente?: FuentePedida;
    /** Piezas inyectadas (pruebas); en producción se usan las reales. */
    deps?: DepsDestino;
}

export function crearPantallaDestino(neurona: string, opciones: OpcionesPantallaDestino = {}): PantallaDestino {
    return new PantallaDestino(neurona, opciones.deps ?? depsReales(neurona), opciones.fuente ?? FUENTE_DEFECTO);
}

// Para quien quiera comprobar que el vocabulario de entrada coincide con el de la puerta.
export const TIPOS_ENTRADA: readonly string[] = Object.entries(ACCIONES)
    .filter(([, d]) => d.entrada)
    .map(([k]) => k);
