"use client";

/**
 * MotorLlamada — la llamada de verdad: malla completa de RTCPeerConnection (una por cada otra
 * persona, hasta 8 en total) con el patrón «perfect negotiation», señalización por el canal
 * Realtime PRIVADO de la sesión (`llamada:<id>` o `llamada:<id>:<token>`, ver `temas.ts`) y
 * todo lo que hace que se sienta bien:
 *
 *  · micro/cámara que se encienden y apagan sin renegociar (replaceTrack) y cambio de
 *    dispositivo en caliente; compartir pantalla sustituye la pista de vídeo;
 *  · reconexión: si ICE cae, espera un poco y reinicia ICE (restartIce) hasta 3 veces; si no
 *    hay manera, lo dice (sin TURN, dos NAT simétricos no se ven);
 *  · canales: si la sesión cambia de canal a mitad de llamada (se crea o revoca el enlace
 *    público), se SUMA el canal nuevo sin soltar el viejo: nadie se queda en otra sala. La
 *    presencia es la unión de todos y cada señal va por el canal donde está su destinatario.
 *    Si el servidor no deja entrar en ningún canal privado, la llamada termina diciéndolo
 *    (nunca se cae a un canal público);
 *  · enlaces directos (opcional, `canalesDirectos`): señalización por enlaces locales ya
 *    abiertos con otros aparatos, sin Supabase. Cada enlace es un canal más (con la marca
 *    `directo`) y conviven con los privados. Solo conectan aparatos de la misma red local
 *    (sin servidores ICE), y con varios enlaces la topología es en estrella: los extremos no
 *    se ven entre sí. Sin la opción, el comportamiento es exactamente el de siempre;
 *  · hablante activo (AnalyserNode + histéresis) y calidad por par (getStats cada 4 s).
 *
 * Imperativo y sin React: la interfaz se suscribe con `suscribir()` y lee `estado()` (una foto
 * inmutable que solo cambia cuando algo cambia, apta para useSyncExternalStore).
 * Nunca lanza hacia fuera: cualquier fallo del navegador se convierte en un aviso.
 */
import { abrirCanalLlamada, type ConexionCanal } from "@/lib/llamadas/senalizacion";
import { SesionVozDatos, type AudioVoz, type FabricaCodecs, type RelojVoz, type TransporteVoz } from "@/lib/llamadas/voz-datos/sesion";
import { decidirAccionMedio, ESPERA_ICE_MS, LIMITE_CONECTANDO_MS, MOTIVO_SIN_AUDIO, nivelCalidadVoz, TEXTO_CONTESTADA_CONECTANDO, TEXTO_VIDEO_BLE, textoCalidadVoz, textoMedioVoz } from "@/lib/llamadas/voz-datos/decision";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";
import { leerControl } from "@/lib/llamadas/voz-datos/paquete";
// (LLA1110D) Un carril estable por flujo (voz, vídeo, pantalla, señal) en vez de un único medio que saltaba.
import { esCarrilBle, LimiteRegistro, SelectorCarriles, textoCarriles, soyDirector, type CambioCarril, type Carril, type Flujo, type MuestraCarril } from "@/lib/llamadas/carriles";
import { SesionVideoDatos } from "@/lib/llamadas/video-datos/sesion-video";
import type { FabricaVideo, FuenteVideo, SalidaVideo } from "@/lib/llamadas/video-datos/tipos";
import { claseEscalada, debeEscalar, textoEscalada, TEXTO_PANTALLA_BLE, TEXTO_PANTALLA_SIN_P2P, type ClaseEscalada, type EstadoWifiLlamada } from "@/lib/llamadas/escalada-wifi";
import { MENSAJE_CANAL_PRIVADO } from "@/lib/llamadas/temas";
import { admision, evaluarDescripcion, reaccionIce, soyCortes } from "@/lib/llamadas/negociacion";
import { elegirHablante, nivelRms, suavizarNivel, type HablanteVigente } from "@/lib/llamadas/hablante";
import { calidadDesde, extraerMetricas, peorCalidad, perdidaEntre, type MetricasPar } from "@/lib/llamadas/calidad";
import { guardarPreferencia } from "@/lib/llamadas/camaras";
import { getDeviceId } from "@/lib/network/device-registry";
import { listarDispositivos, obtenerMedios, obtenerPantalla, obtenerPista, pararStream } from "@/lib/llamadas/medios";
import { AVISO_SIN_TURN, contieneTurn, servidoresIce } from "@/lib/llamadas/ice";
import { clavePestana, type Identidad } from "@/lib/llamadas/identidad";
import {
    engancharBot,
    type EngancheBot,
    type ServiciosBot,
    type TextoLlamada,
} from "@/lib/llamadas/bot-en-llamada";
import {
    MAX_PARTICIPANTES,
    type CalidadConexion,
    type EstadoConexionPar,
    type EstadoLlamada,
    type MedioVoz,
    type MetaPresencia,
    type ParticipanteLlamada,
    type SenalLlamada,
    type CargaApp,
    type CarrilesParVista,
} from "@/lib/llamadas/tipos";

/**
 * Bot invitado de la llamada (contrato `voz-fusionada-astraura.md` §5, «Llamadas grupales con
 * bots»): turnos, silencio y corte los decide `bot-en-llamada.ts`; la voz sale por la PUERTA
 * ÚNICA de `voz-unica` (contexto «llamada», que entra por `omnivoice-mixer`) y su ganancia se
 * fija con `setNeuronMixGain`. Solo `responder` (el cerebro del bot) es obligatorio: todo lo
 * demás está inyectado por el propio motor.
 */
export interface OpcionesBotLlamada {
    /** Id de presencia con el que el bot tiene la palabra («un solo bot a la vez»). */
    botId: string;
    /** Cerebro del bot: pregunta en claro → respuesta. Inyectable. */
    responder: (pregunta: string) => Promise<string>;
    /** Silencio (ms) antes de contestar; por defecto 700 (SILENCIO_MS). */
    silencioMs?: number;
    /** Volumen de la voz del bot, 0..1 (1 por defecto). */
    volumen?: number;
}

export interface OpcionesMotor {
    sesionId: string;
    yo: Identidad;
    /** Servidores ICE (de `obtenerIceServidores`); por defecto STUN + TURN fijo del entorno. */
    iceServers?: RTCIceServer[];
    /** ¿Hay TURN entre `iceServers`? Por defecto se deduce de la lista. */
    hayTurn?: boolean;
    /** Tema del canal privado (`resolverTemaSesion("llamada", …)`); por defecto el de miembros. */
    tema?: string | null;
    /**
     * Vuelve a preguntar qué canal toca (tras crear o revocar el enlace público a mitad de
     * llamada, o cuando otro participante avisa de mudanza). Sin él no hay mudanzas.
     */
    resolverTema?: () => Promise<string | null>;
    /**
     * Enlaces directos con otros aparatos (sin Supabase): una `ConexionCanal` por enlace, que el
     * motor pide UNA vez al entrar y suelta al colgar. Con ellos y sin `tema`, no se abre el
     * canal de Supabase. Más de `MAX_PARTICIPANTES - 1` no caben: el excedente se suelta.
     */
    canalesDirectos?: () => ConexionCanal[];
    /** Llamadas 1:1: al irse la otra persona, cuelga solo. */
    colgarAlQuedarSolo?: boolean;
    /**
     * (LLA1108E) Voz por enlace de datos cuando no hay ruta IP o ICE no conecta: sin esta opción el comportamiento es
     * el de siempre (solo WebRTC, sin vigilancia del tiempo de conexión).
     */
    vozDatos?: OpcionesVozDatos;
    /** Bot invitado (Astraura en la llamada); sin él, todo queda como antes. */
    bot?: OpcionesBotLlamada;
    intervaloStatsMs?: number;
    intervaloNivelMs?: number;
}

/** (LLA1108E) Lo que el motor necesita para llevar la voz por un enlace de datos (todo inyectable). */
export interface OpcionesVozDatos {
    /** El enlace de datos hacia ese par (id de presencia) o null si no hay ninguno ahora. */
    transporteHacia(parId: string): TransporteVoz | null;
    /** ¿Hay una ruta IP hacia ese par? (null: no se sabe, se espera a ICE). */
    hayRutaIp?(parId: string): boolean | null;
    /** Captura y reproducción (AudioWorklet en la app). */
    crearAudio(micro: MediaStream | null): AudioVoz | null;
    codecs(): FabricaCodecs | Promise<FabricaCodecs>;
    reloj?: RelojVoz;
    /** Cada cuánto se revisa el medio de cada par (ms, por defecto 500). */
    intervaloMs?: number;
    /** Neurona del otro aparato (para anotar los hitos en el registro del enlace). */
    neurona?: string | null;
    /**
     * (LLA1108H) Pide el enlace Wi-Fi directo (`avisarEnvioPesado`, clase «llamada» o «pantalla») cuando el único camino
     * hacia el par no lleva IP. Con el flujo local, el enlace se retiene mientras la llamada tenga pistas vivas y se
     * suelta solo al colgar. Sin esta opción la llamada no escala (el comportamiento de antes).
     */
    escalarWifi?(clase: ClaseEscalada, flujo: MediaStream | null): void;
    /** (LLA1108H) En qué paso va el enlace Wi-Fi directo con ese par (abriendo, propuesta, activo, nunca…). */
    estadoWifi?(): EstadoWifiLlamada;
    /** (LLA1108H) Vídeo ligero por el enlace de datos mientras no hay red IP (todo inyectable). */
    video?: OpcionesVideoDatos;
}

/** (LLA1108H) Lo que el motor necesita para llevar vídeo de baja resolución por el enlace de datos. */
export interface OpcionesVideoDatos {
    fabrica(): FabricaVideo | Promise<FabricaVideo>;
    /** La cámara reducida como fuente de fotogramas. */
    fuenteDePista(pista: MediaStreamTrack): FuenteVideo | null;
    /** Dónde se pinta el vídeo que llega. */
    crearSalida(): SalidaVideo | null;
}

export interface ResumenLlamada {
    duracionMs: number;
    contestada: boolean;
    /** Personas que seguían dentro al colgar yo. */
    otrosDentro: number;
}

interface Analizador {
    fuente: MediaStreamAudioSourceNode;
    analizador: AnalyserNode;
    datos: Uint8Array<ArrayBuffer>;
    streamId: string;
}

interface CanalMotor {
    conn: ConexionCanal;
    tema: string;
    presencia: MetaPresencia[];
    bajas: (() => void)[];
    /** true si va por un enlace local con otro aparato (sin Supabase). */
    directo: boolean;
}

/** Como mucho estos canales PRIVADOS a la vez (miembros + enlace público + uno en mudanza). */
const MAX_CANALES = 3;

/** Cada enlace directo trae como mucho a una persona: con 7 enlaces ya estamos los 8. */
const MAX_DIRECTOS = MAX_PARTICIPANTES - 1;

interface Par {
    id: string;
    pc: RTCPeerConnection;
    cortes: boolean;
    haciendoOferta: boolean;
    ignorandoOferta: boolean;
    aplicandoRespuesta: boolean;
    icePendiente: RTCIceCandidateInit[];
    iceSaliente: RTCIceCandidateInit[];
    temporizadorIce: ReturnType<typeof setTimeout> | null;
    temporizadorDesconexion: ReturnType<typeof setTimeout> | null;
    stream: MediaStream | null;
    emisores: { audio: RTCRtpSender | null; video: RTCRtpSender | null };
    conexion: EstadoConexionPar;
    reinicios: number;
    metricas: MetricasPar | null;
    calidad: CalidadConexion;
    cadena: Promise<void>;
    /** (LLA1110D) Hubo que ofertar sin ruta IP: la oferta sale cuando aparece una (WebRTC queda quieto mientras). */
    ofertaPendiente: boolean;
    /** (LLA1110D) Aplicando una oferta del otro (con rollback a mano si fue un choque): mis ofertas esperan a responder. */
    aplicandoOfertaAjena: boolean;
    ofertaTrasResponder: boolean;
}

const ESTADO_INICIAL: EstadoLlamada = {
    fase: "inactiva",
    participantes: [],
    hablante: null,
    inicio: null,
    micro: false,
    camara: false,
    pantalla: false,
    dispositivos: { microfonos: [], camaras: [], altavoces: [] },
    seleccion: { microId: null, camaraId: null, altavozId: null },
    aviso: null,
    motivoFin: null,
    contestada: false,
    rechazos: [],
};

/**
 * (LLA1110D) ¿Queda algo mío sin negociar? Un transceptor con pista que aún no tiene `mid`, o cuya dirección acordada
 * no incluye enviar.
 */
export function necesitaNegociar(pc: Pick<RTCPeerConnection, "getTransceivers">): boolean {
    try {
        return pc.getTransceivers().some((t) => {
            if ((t as RTCRtpTransceiver & { stopped?: boolean }).stopped || t.direction === "stopped" || !t.sender.track) return false;
            if (t.mid === null) return true;
            const cd = t.currentDirection;
            return !!cd && cd !== "sendrecv" && cd !== "sendonly";
        });
    } catch {
        return false;
    }
}

function hayMediaStream(): boolean {
    return typeof MediaStream === "function";
}

function modoEco(): boolean {
    try {
        return typeof document !== "undefined" && document.documentElement.getAttribute("data-perf") === "eco";
    } catch {
        return false;
    }
}

export class MotorLlamada {
    readonly miId: string;
    readonly sesionId: string;
    private readonly opc: OpcionesMotor;
    private readonly iceServers: RTCIceServer[];
    private readonly conTurn: boolean;

    private e: EstadoLlamada = ESTADO_INICIAL;
    private parche: Partial<EstadoLlamada> = {};
    private emisionPendiente = false;
    private readonly oyentes = new Set<(e: EstadoLlamada) => void>();

    private local: MediaStream | null = null;
    private pistaAudio: MediaStreamTrack | null = null;
    private pistaCamara: MediaStreamTrack | null = null;
    private pistaPantalla: MediaStreamTrack | null = null;
    private microOn = false;
    private camaraOn = false;
    private pantallaOn = false;

    private canales: CanalMotor[] = [];
    /** Canal por el que llegó la última señal de cada par (ruta que ya se sabe que funciona). */
    private readonly rutaPar = new Map<string, CanalMotor>();
    /** Último tema que el servidor dijo que toca (para detectar mudanzas). */
    private temaActual: string | null = null;
    private revisando: Promise<boolean> | null = null;
    private readonly rechazosVistos = new Set<string>();
    private readonly pares = new Map<string, Par>();
    private presentes: MetaPresencia[] = [];
    private conPlaza = new Set<string>();
    private readonly vistos = new Set<string>();
    private unido = 0;
    private inicio: number | null = null;
    private contestada = false;
    private cerrado = false;
    private resumenFinal: ResumenLlamada | null = null;

    private ctxAudio: AudioContext | null = null;
    private readonly analizadores = new Map<string, Analizador>();
    private niveles: Record<string, number> = {};
    /** Enganche del bot invitado con la llamada (null si no hay bot). */
    private bot: EngancheBot | null = null;
    private hablante: HablanteVigente | null = null;
    /** (LLA1108E) Voz por enlace de datos, por par; y el reloj que vigila cada par. */
    private readonly vozDatos = new Map<string, SesionVozDatos>();
    private readonly activandoDatos = new Set<string>();
    private readonly vigilantes = new Map<string, ReturnType<typeof setInterval>>();
    private puedeReintentar = false;
    /** (LLA1108H) Vídeo ligero por par, su salida (MediaStream), la pista que alimenta cada fuente y la espera de la fábrica. */
    private readonly videoDatos = new Map<string, SesionVideoDatos>();
    private readonly salidasVideo = new Map<string, SalidaVideo | null>();
    private readonly pistaFuenteVideo = new Map<string, MediaStreamTrack>();
    private readonly activandoVideo = new Set<string>();
    /** (LLA1108H) Escalada al Wi-Fi directo: cuándo se pidió cada clase por par, y si hubo ruta IP la última vez. */
    private readonly escaladas = new Map<string, number>();
    private readonly rutaIpVista = new Map<string, boolean | null>();
    private readonly ultimoReintentoIce = new Map<string, number>();
    private wifiVisto = "";
    private wifiEstado: EstadoWifiLlamada | null = null;
    private temporizadorNivel: ReturnType<typeof setInterval> | null = null;
    private temporizadorStats: ReturnType<typeof setInterval> | null = null;
    private alCambiarDispositivos: (() => void) | null = null;
    /** (LLA1108G) Oyentes de los mensajes de aplicación de la superficie (cambio de tipo, grabación, Astraura…). */
    private readonly oyentesApp = new Set<(de: string, carga: CargaApp) => void>();
    /** (LLA1110D) Carriles por flujo y por par, lo que la persona forzó, y los limitadores del registro. */
    private readonly selectores = new Map<string, SelectorCarriles>();
    private readonly forzadosCarril = new Map<Flujo, Carril>();
    private readonly limiteCarril = new LimiteRegistro(4, 60_000);
    private readonly limiteNeg = new LimiteRegistro(12, 60_000);
    /** (LLA1110D) Por par: ¿el emisor de audio de WebRTC lleva el micro? (no mientras la voz va por el enlace de datos). */
    private readonly audioWebrtcPuesto = new Map<string, boolean>();
    /** (LLA1110D) Por par: el carril del enlace de datos visto en el último tic y cuándo arrancó la voz por él. */
    private readonly carrilDatos = new Map<string, Carril | null>();
    private readonly vozDatosDesde = new Map<string, number>();
    /** (LLA1110D) Encender/apagar la cámara es UNA operación a la vez (dos toques seguidos ya no se pisan). */
    private camaraEnCurso: Promise<string | null> | null = null;

    constructor(opciones: OpcionesMotor) {
        this.opc = opciones;
        this.sesionId = opciones.sesionId;
        this.miId = clavePestana(opciones.yo.base);
        this.iceServers = opciones.iceServers ?? servidoresIce();
        this.conTurn = opciones.hayTurn ?? contieneTurn(this.iceServers);
        this.temaActual = opciones.tema ?? null;
    }

    /* ───────────────────────────── Suscripción ───────────────────────────── */

    estado = (): EstadoLlamada => this.e;

    suscribir = (cb: (e: EstadoLlamada) => void): (() => void) => {
        this.oyentes.add(cb);
        return () => {
            this.oyentes.delete(cb);
        };
    };

    private set(parcial: Partial<EstadoLlamada>) {
        Object.assign(this.parche, parcial);
        this.emitir();
    }

    private emitir() {
        if (this.emisionPendiente) return;
        this.emisionPendiente = true;
        queueMicrotask(() => {
            this.emisionPendiente = false;
            const parche = this.parche;
            this.parche = {};
            this.e = {
                ...this.e,
                ...parche,
                micro: this.microOn && !!this.pistaAudio,
                camara: this.camaraOn,
                pantalla: this.pantallaOn,
                inicio: this.inicio,
                contestada: this.contestada,
                hablante: this.hablante?.id ?? null,
                participantes: this.construirParticipantes(),
                ...this.vistaMedio(),
                carriles: this.carriles(),
            };
            for (const cb of Array.from(this.oyentes)) {
                try {
                    cb(this.e);
                } catch {
                    /* un oyente roto no para la llamada */
                }
            }
        });
    }

    /* ───────────────────────────── Medios locales ───────────────────────────── */

    /**
     * Consigue micro (y cámara si `video`). Llamar SOLO tras un gesto de la persona.
     * `stream` permite reutilizar el de la vista previa (sin volver a pedir permiso).
     */
    async prepararMedios(p: { audio: boolean; video: boolean; microActivo?: boolean; stream?: MediaStream | null }): Promise<{ audio: boolean; error: string | null }> {
        if (this.cerrado) return { audio: false, error: null };
        this.set({ fase: "preparando" });
        let stream = p.stream ?? null;
        let aviso: string | null = null;
        let error: string | null = null;
        if (!stream && (p.audio || p.video)) {
            const r = await obtenerMedios({ audio: p.audio, video: p.video });
            stream = r.stream;
            aviso = r.aviso;
            error = r.error;
        }
        if (this.cerrado) {
            pararStream(stream);
            return { audio: false, error: null };
        }
        if (stream && !p.video) {
            for (const t of stream.getVideoTracks()) {
                try {
                    stream.removeTrack(t);
                    t.stop();
                } catch {
                    /* noop */
                }
            }
        }
        this.local = stream;
        this.pistaAudio = stream?.getAudioTracks()[0] ?? null;
        this.pistaCamara = stream?.getVideoTracks()[0] ?? null;
        this.microOn = !!this.pistaAudio && p.microActivo !== false;
        if (this.pistaAudio) this.pistaAudio.enabled = this.microOn;
        this.camaraOn = !!this.pistaCamara;
        this.asegurarAudio();
        this.conectarAnalizadorLocal();
        void this.actualizarDispositivos();
        this.escucharDispositivos();
        const seleccion = {
            ...this.e.seleccion,
            microId: this.idDispositivo(this.pistaAudio) ?? this.e.seleccion.microId,
            camaraId: this.idDispositivo(this.pistaCamara) ?? this.e.seleccion.camaraId,
        };
        this.set({ aviso: error ?? aviso, seleccion });
        return { audio: !!this.pistaAudio, error };
    }

    private idDispositivo(t: MediaStreamTrack | null): string | null {
        try {
            return (t?.getSettings?.().deviceId as string | undefined) ?? null;
        } catch {
            return null;
        }
    }

    private asegurarLocal(): MediaStream | null {
        if (!this.local && hayMediaStream()) this.local = new MediaStream();
        return this.local;
    }

    private pistaVideoEnviada(): MediaStreamTrack | null {
        if (this.pantallaOn && this.pistaPantalla) return this.pistaPantalla;
        return this.camaraOn ? this.pistaCamara : null;
    }

    private ponerEnEmisor(par: Par, tipo: "audio" | "video", pista: MediaStreamTrack | null) {
        const emisor = par.emisores[tipo];
        if (emisor) {
            try {
                void emisor.replaceTrack(pista).catch(() => undefined);
            } catch {
                /* noop */
            }
            return;
        }
        if (!pista) return;
        try {
            par.emisores[tipo] = this.local ? par.pc.addTrack(pista, this.local) : par.pc.addTrack(pista);
        } catch {
            /* la conexión ya estaba cerrada */
        }
    }

    private ponerPistaAudio(pista: MediaStreamTrack) {
        const vieja = this.pistaAudio;
        const local = this.asegurarLocal();
        if (vieja && vieja !== pista) {
            try {
                local?.removeTrack(vieja);
            } catch {
                /* noop */
            }
            try {
                vieja.stop();
            } catch {
                /* noop */
            }
        }
        this.pistaAudio = pista;
        pista.enabled = this.microOn;
        try {
            local?.addTrack(pista);
        } catch {
            /* noop */
        }
        // (LLA1110D) Mientras la voz de un par va por el enlace de datos, su emisor de WebRTC no lleva el micro (no hay voz doble).
        for (const par of this.pares.values()) this.ponerEnEmisor(par, "audio", this.audioWebrtcPuesto.get(par.id) === false ? null : pista);
        this.conectarAnalizadorLocal();
    }

    async alternarMicro(): Promise<string | null> {
        if (this.cerrado) return null;
        if (!this.pistaAudio) {
            const r = await obtenerPista("audio", this.e.seleccion.microId);
            if (!r.pista) return r.error;
            this.microOn = true;
            this.ponerPistaAudio(r.pista);
        } else {
            this.microOn = !this.microOn;
            this.pistaAudio.enabled = this.microOn;
        }
        for (const v of this.vozDatos.values()) v.silenciar(!this.microOn);
        this.set({ aviso: null });
        this.publicarMeta();
        return null;
    }

    async alternarCamara(): Promise<string | null> {
        if (this.camaraEnCurso) return this.camaraEnCurso;
        const p = this.alternarCamaraAhora();
        this.camaraEnCurso = p;
        try {
            return await p;
        } finally {
            if (this.camaraEnCurso === p) this.camaraEnCurso = null;
        }
    }

    private async alternarCamaraAhora(): Promise<string | null> {
        if (this.cerrado) return null;
        if (this.pantallaOn) return "Deja de compartir la pantalla para encender la cámara.";
        const local = this.asegurarLocal();
        if (this.camaraOn && this.pistaCamara) {
            const p = this.pistaCamara;
            this.pistaCamara = null;
            this.camaraOn = false;
            for (const par of this.pares.values()) this.ponerEnEmisor(par, "video", null);
            try {
                local?.removeTrack(p);
                p.stop();
            } catch {
                /* noop */
            }
        } else {
            let r = await obtenerPista("video", this.e.seleccion.camaraId);
            // (LLA1110D) La cámara elegida ya no está o no admite lo pedido (OverconstrainedError, NotFoundError): se
            // reintenta sin deviceId (la del sistema) y queda en el registro.
            if (!r.pista && this.e.seleccion.camaraId && !this.cerrado) {
                anotarLlamada("camara", this.opc.vozDatos?.neurona ?? null, `elegida-no-abre se reintenta sin deviceId error=${r.error ?? "?"}`);
                r = await obtenerPista("video", null);
            }
            // (LLA1110D) Por qué no se encendió, en el registro (en la prueba 33 la segunda llamada no dejó rastro).
            if (!r.pista) {
                anotarLlamada("camara", this.opc.vozDatos?.neurona ?? null, `encender-fallo pedida=${this.e.seleccion.camaraId ? "elegida" : "sistema"} error=${r.error ?? "sin-pista"}`);
                return r.error;
            }
            if (this.cerrado) {
                r.pista.stop();
                return null;
            }
            this.pistaCamara = r.pista;
            this.camaraOn = true;
            anotarLlamada("camara", this.opc.vozDatos?.neurona ?? null, `encendida estado=${r.pista.readyState} pares=${this.pares.size}`);
            try {
                local?.addTrack(r.pista);
            } catch {
                /* noop */
            }
            for (const par of this.pares.values()) this.ponerEnEmisor(par, "video", r.pista);
            this.set({ seleccion: { ...this.e.seleccion, camaraId: this.idDispositivo(r.pista) ?? this.e.seleccion.camaraId } });
        }
        this.publicarMeta();
        this.emitir();
        this.alCambiarVideoLocal();
        return null;
    }

    async alternarPantalla(): Promise<string | null> {
        if (this.cerrado) return null;
        if (this.pantallaOn) {
            this.dejarPantalla();
            return null;
        }
        const r = await obtenerPantalla();
        if (!r.pista) return r.error;
        if (this.cerrado) {
            r.pista.stop();
            return null;
        }
        const local = this.asegurarLocal();
        this.pistaPantalla = r.pista;
        r.pista.onended = () => this.dejarPantalla();
        this.pantallaOn = true;
        if (this.pistaCamara) {
            try {
                local?.removeTrack(this.pistaCamara);
            } catch {
                /* noop */
            }
        }
        try {
            local?.addTrack(r.pista);
        } catch {
            /* noop */
        }
        for (const par of this.pares.values()) this.ponerEnEmisor(par, "video", r.pista);
        this.publicarMeta();
        this.emitir();
        this.alCambiarVideoLocal();
        return null;
    }

    private dejarPantalla() {
        if (!this.pantallaOn) return;
        const local = this.local;
        const p = this.pistaPantalla;
        this.pistaPantalla = null;
        this.pantallaOn = false;
        if (p) {
            try {
                local?.removeTrack(p);
                p.onended = null;
                p.stop();
            } catch {
                /* noop */
            }
        }
        const video = this.pistaVideoEnviada();
        if (video) {
            try {
                local?.addTrack(video);
            } catch {
                /* noop */
            }
        }
        for (const par of this.pares.values()) this.ponerEnEmisor(par, "video", video);
        this.publicarMeta();
        this.emitir();
        this.alCambiarVideoLocal();
    }

    async cambiarMicro(id: string): Promise<string | null> {
        const r = await obtenerPista("audio", id);
        if (!r.pista) return r.error;
        if (this.cerrado) {
            r.pista.stop();
            return null;
        }
        this.ponerPistaAudio(r.pista);
        this.set({ seleccion: { ...this.e.seleccion, microId: id } });
        this.recordarDispositivo("micro", id, this.e.dispositivos.microfonos);
        return null;
    }

    /** VID1110A: lo que la persona elige se recuerda en esta neurona (y gana a la elección automática). */
    private recordarDispositivo(clave: "camara" | "micro" | "altavoz", id: string, lista: ReadonlyArray<{ id: string; nombre: string }>) {
        try {
            guardarPreferencia(getDeviceId(), { [clave]: { id, etiqueta: lista.find((d) => d.id === id)?.nombre ?? "" } });
        } catch {
            /* sin almacenamiento */
        }
    }

    async cambiarCamara(id: string): Promise<string | null> {
        this.set({ seleccion: { ...this.e.seleccion, camaraId: id } });
        this.recordarDispositivo("camara", id, this.e.dispositivos.camaras);
        if (!this.camaraOn) return null;
        const r = await obtenerPista("video", id);
        if (!r.pista) return r.error;
        if (this.cerrado) {
            r.pista.stop();
            return null;
        }
        const vieja = this.pistaCamara;
        this.pistaCamara = r.pista;
        if (!this.pantallaOn) {
            try {
                if (vieja) this.local?.removeTrack(vieja);
                this.asegurarLocal()?.addTrack(r.pista);
            } catch {
                /* noop */
            }
            for (const par of this.pares.values()) this.ponerEnEmisor(par, "video", r.pista);
        }
        try {
            vieja?.stop();
        } catch {
            /* noop */
        }
        this.emitir();
        // VID1110A: el vídeo ligero lee de la pista vieja (ya parada): sin esto, tras cambiar de cámara seguía en negro.
        this.alCambiarVideoLocal();
        return null;
    }

    cambiarAltavoz(id: string) {
        this.set({ seleccion: { ...this.e.seleccion, altavozId: id } });
        this.recordarDispositivo("altavoz", id, this.e.dispositivos.altavoces);
    }

    async actualizarDispositivos() {
        const d = await listarDispositivos();
        if (!this.cerrado) this.set({ dispositivos: d });
    }

    private escucharDispositivos() {
        if (this.alCambiarDispositivos || typeof navigator === "undefined") return;
        const md = navigator.mediaDevices;
        if (!md?.addEventListener) return;
        this.alCambiarDispositivos = () => void this.actualizarDispositivos();
        try {
            md.addEventListener("devicechange", this.alCambiarDispositivos);
        } catch {
            this.alCambiarDispositivos = null;
        }
    }

    /* ───────────────────────────── Canal y presencia ───────────────────────────── */

    private meta(): MetaPresencia {
        const y = this.opc.yo;
        return {
            id: this.miId,
            uid: y.uid,
            nombre: y.nombre,
            avatar: y.avatar,
            invitado: y.invitado,
            micro: this.microOn && !!this.pistaAudio,
            camara: this.camaraOn,
            pantalla: this.pantallaOn,
            unido: this.unido,
        };
    }

    private publicarMeta() {
        const meta = this.meta();
        for (const c of this.canales) c.conn.publicar(meta);
    }

    /** Envía una señal: las dirigidas, por el canal donde está su destinatario; el resto, por todos. */
    private enviar(s: SenalLlamada) {
        if (!this.canales.length) return;
        if (s.tipo === "senal") {
            this.canalPara(s.para).conn.enviar(s);
            return;
        }
        for (const c of this.canales) c.conn.enviar(s);
    }

    private canalPara(id: string): CanalMotor {
        const ruta = this.rutaPar.get(id);
        if (ruta && this.canales.includes(ruta)) return ruta;
        for (let i = this.canales.length - 1; i >= 0; i--) {
            if (this.canales[i].presencia.some((p) => p.id === id)) return this.canales[i];
        }
        return this.canales[this.canales.length - 1];
    }

    /** Presencia de todos los canales, sin repetir a nadie, por orden de llegada. */
    private presenciaUnida(): MetaPresencia[] {
        if (this.canales.length === 1) return this.canales[0].presencia;
        const porId = new Map<string, MetaPresencia>();
        for (const c of this.canales) for (const p of c.presencia) if (!porId.has(p.id)) porId.set(p.id, p);
        return Array.from(porId.values()).sort((a, b) => a.unido - b.unido || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    private abrirCanal(tema: string | null): CanalMotor | null {
        const conn = abrirCanalLlamada(this.sesionId, { clave: this.miId, tema });
        if (!conn) return null;
        return this.registrarCanal(conn, conn.tema ?? tema ?? `llamada:${this.sesionId}`, false);
    }

    /**
     * Abre los enlaces directos que pide `canalesDirectos`. Una fábrica rota no tumba la
     * llamada (se sigue con las demás) y lo que pase de `MAX_DIRECTOS` se suelta sin usar.
     */
    private abrirDirectos(): CanalMotor[] {
        const fabrica = this.opc.canalesDirectos;
        if (!fabrica) return [];
        let conexiones: ConexionCanal[] = [];
        try {
            const r = fabrica();
            conexiones = Array.isArray(r) ? r.filter((x): x is ConexionCanal => !!x) : [];
        } catch {
            conexiones = [];
        }
        for (const sobra of conexiones.slice(MAX_DIRECTOS)) {
            try {
                sobra.soltar();
            } catch {
                /* noop */
            }
        }
        const abiertos: CanalMotor[] = [];
        for (const conn of conexiones.slice(0, MAX_DIRECTOS)) {
            try {
                abiertos.push(this.registrarCanal(conn, conn.tema || `directo:${this.sesionId}`, true));
            } catch {
                // Falló a medias al engancharlo: se quita del motor y se suelta el enlace.
                const medio = this.canales.find((x) => x.conn === conn);
                if (medio) this.soltarCanal(medio);
                else {
                    try {
                        conn.soltar();
                    } catch {
                        /* noop */
                    }
                }
            }
        }
        return abiertos;
    }

    /** Engancha un canal (privado o directo) al motor: presencia, señales, suscripción y estado. */
    private registrarCanal(conn: ConexionCanal, tema: string, directo: boolean): CanalMotor {
        const c: CanalMotor = { conn, tema, presencia: [], bajas: [], directo };
        this.canales.push(c);
        c.bajas.push(
            conn.onPresencia((p) => {
                c.presencia = p;
                this.alCambiarPresencia(this.presenciaUnida());
            }),
        );
        c.bajas.push(conn.onSenal((s) => this.alRecibirSenal(s, c)));
        c.bajas.push(conn.onSuscrito((ok) => this.alCambiarSuscripcion(c, ok)));
        if (typeof conn.onEstado === "function") {
            c.bajas.push(
                conn.onEstado((e) => {
                    if (e === "denegado") this.alDenegarCanal(c);
                }),
            );
        }
        conn.publicar(this.meta());
        if (typeof conn.estado === "function" && conn.estado() === "denegado") queueMicrotask(() => this.alDenegarCanal(c));
        return c;
    }

    /** ¿Todos los canales abiertos son enlaces directos? (sin ninguno no hay «solo directos»). */
    private soloDirectos(): boolean {
        return this.canales.length > 0 && this.canales.every((c) => c.directo);
    }

    /** ¿La ruta hacia esta persona es un enlace directo? */
    private viaDirecta(id: string): boolean {
        const c = this.rutaPar.get(id) ?? this.canales.find((x) => x.presencia.some((p) => p.id === id));
        return !!c?.directo;
    }

    private soltarCanal(c: CanalMotor) {
        const i = this.canales.indexOf(c);
        if (i === -1) return;
        this.canales.splice(i, 1);
        for (const [id, ruta] of this.rutaPar) if (ruta === c) this.rutaPar.delete(id);
        for (const b of c.bajas.splice(0)) {
            try {
                b();
            } catch {
                /* noop */
            }
        }
        try {
            c.conn.retirar();
            c.conn.soltar();
        } catch {
            /* noop */
        }
    }

    private alCambiarSuscripcion(c: CanalMotor, ok: boolean) {
        if (this.cerrado || !this.canales.includes(c)) return;
        if (ok) {
            c.conn.publicar(this.meta());
            const fase = this.e.fase === "conectando" || this.e.fase === "preparando" ? (this.presentes.length ? "en-curso" : "esperando") : this.e.fase;
            const avisoDeConexion = this.e.aviso === AVISO_RECONEXION || this.e.aviso === AVISO_ENLACE_CAIDO;
            this.set({ fase, aviso: avisoDeConexion ? null : this.e.aviso });
        } else if (!this.canales.some((x) => x.conn.suscrito())) {
            this.set({ aviso: this.soloDirectos() ? AVISO_ENLACE_CAIDO : AVISO_RECONEXION });
        }
    }

    /**
     * El servidor no deja entrar en un canal privado (o un enlace directo se niega). Sin ninguno
     * que valga, se termina y se dice; nunca se cae a un canal público.
     */
    private alDenegarCanal(c: CanalMotor) {
        if (this.cerrado || !this.canales.includes(c)) return;
        this.soltarCanal(c);
        if (!this.canales.length) {
            this.terminar("error", c.directo ? MENSAJE_ENLACE_RECHAZADO : MENSAJE_CANAL_PRIVADO);
            return;
        }
        this.set({
            aviso: c.directo
                ? "Un enlace directo ya no admite esta llamada. Seguís conectados por el otro canal."
                : "Uno de los canales de esta llamada ya no admite entrar (quizá se revocó el enlace público). Seguís conectados por el otro.",
        });
        this.alCambiarPresencia(this.presenciaUnida());
    }

    /**
     * Pregunta al servidor qué canal toca ahora y, si es otro, lo SUMA (sin soltar los que ya
     * funcionan). `avisar`: además manda «mudanza» por los canales actuales para que los demás
     * pregunten también (sin token en el mensaje). Devuelve true si cambió algo.
     */
    revisarCanal(avisar = true): Promise<boolean> {
        if (this.cerrado || !this.opc.resolverTema || !this.canales.length) return Promise.resolve(false);
        if (this.revisando) return this.revisando;
        const resolver = this.opc.resolverTema;
        const p = (async (): Promise<boolean> => {
            let tema: string | null = null;
            try {
                tema = await resolver();
            } catch {
                tema = null;
            }
            if (this.cerrado || !tema || tema === this.temaActual) return false;
            this.temaActual = tema;
            if (avisar) this.enviar({ tipo: "mudanza", de: this.miId });
            if (this.canales.some((c) => c.tema === tema)) return true;
            // El límite es de canales PRIVADOS: un enlace directo nunca se suelta por esto.
            const privados = this.canales.filter((c) => !c.directo);
            if (privados.length >= MAX_CANALES) this.soltarCanal(privados[0]);
            return !!this.abrirCanal(tema);
        })();
        this.revisando = p;
        void p.finally(() => {
            if (this.revisando === p) this.revisando = null;
        });
        return p;
    }

    /**
     * Entra en la llamada (tras `prepararMedios`): abre los enlaces directos, si los hay, y el
     * canal privado de Supabase salvo que haya directos y ningún `tema` (sin servidor).
     */
    entrar(): boolean {
        if (this.cerrado) return false;
        if (this.canales.length) return true;
        this.unido = Date.now();
        const directos = this.abrirDirectos();
        const quierePrivado = directos.length === 0 || !!this.opc.tema;
        const privado = quierePrivado ? this.abrirCanal(this.opc.tema ?? null) : null;
        if (!this.canales.length) {
            this.set({ fase: "error", motivoFin: this.opc.canalesDirectos ? MENSAJE_SIN_ENLACE : MENSAJE_SIN_SERVIDOR });
            return false;
        }
        if (privado && !this.temaActual) this.temaActual = privado.tema;
        this.set({ fase: this.canales.some((c) => c.conn.suscrito()) ? "esperando" : "conectando" });
        this.engancharBotInvitado();
        this.arrancarTemporizadores();
        return true;
    }

    /* ───────────────────────────── Bot invitado ───────────────────────────── */

    /**
     * Conecta el bot invitado (si lo hay) con la llamada: los turnos los lleva
     * `bot-en-llamada.ts`; el TEXTO va por las señales de la llamada (difusión) y la voz por la
     * puerta única (`voz-unica`, contexto «llamada → omnivoice-mixer»), con su ganancia en el
     * mezclador (`setNeuronMixGain`). Los módulos pesados se importan SOLO al usarlos, y un
     * fallo del bot nunca tumba la llamada.
     */
    private engancharBotInvitado() {
        const o = this.opc.bot;
        if (!o || this.bot) return;
        const servicios: ServiciosBot = {
            publicarTexto: (t: TextoLlamada) => {
                try {
                    this.enviar({ tipo: "texto", de: t.de, texto: t.texto, en: t.en });
                } catch {
                    /* canal cerrado: el turno se recupera en el siguiente tick */
                }
            },
            responder: o.responder,
            hablar: async (texto) => {
                const v = await import("@/lib/aurora/voz-unica");
                await v.hablar(texto, { contexto: "llamada" });
            },
            callar: () => {
                void import("@/lib/aurora/voz-unica")
                    .then((v) => v.callar())
                    .catch(() => undefined);
            },
            ganancia: (g: number) => {
                void import("@/lib/aurora/tts-oss/omnivoice-mixer")
                    .then((m) => m.setNeuronMixGain(o.botId, g))
                    .catch(() => undefined);
            },
        };
        try {
            this.bot = engancharBot({ botId: o.botId, silencioMs: o.silencioMs, volumen: o.volumen, servicios });
        } catch {
            this.bot = null;
        }
    }

    /**
     * Comparte el TEXTO de lo que alguien ha dicho (una transcripción, nunca el audio, contrato
     * §5): lo lee el bot de esta llamada y sale por difusión para el de las demás.
     */
    compartirTexto(texto: string, en = Date.now()): void {
        if (this.cerrado) return;
        const limpio = texto.trim();
        if (!limpio) return;
        const t: TextoLlamada = { de: this.miId, texto: limpio, en };
        this.bot?.recibir(t);
        this.enviar({ tipo: "texto", de: t.de, texto: t.texto, en: t.en });
    }

    /** (LLA1108G) Difunde un mensaje de aplicación a todos los de la llamada. Devuelve false si no hay canal. */
    enviarApp(carga: CargaApp): boolean {
        if (this.cerrado || !this.canales.length) return false;
        this.enviar({ tipo: "app", de: this.miId, carga });
        return true;
    }

    /** (LLA1108G) Escucha los mensajes de aplicación de los demás. Devuelve la baja. */
    suscribirApp(cb: (de: string, carga: CargaApp) => void): () => void {
        this.oyentesApp.add(cb);
        return () => {
            this.oyentesApp.delete(cb);
        };
    }

    /** Suelta el turno del bot, lo calla y deja de lado el enganche (al colgar). */
    private soltarBot() {
        if (!this.bot) return;
        try {
            this.bot.soltar();
        } catch {
            /* noop */
        }
        this.bot = null;
        void import("@/lib/aurora/voz-unica")
            .then((v) => v.callar())
            .catch(() => undefined);
    }

    private alCambiarPresencia(lista: MetaPresencia[]) {
        if (this.cerrado) return;
        const conmigo = lista.some((p) => p.id === this.miId) ? lista : [...lista, this.meta()];
        const { admitido, conPlaza } = admision(conmigo, this.miId);
        if (!admitido) {
            this.terminar(
                "llena",
                `Esta llamada ya tiene ${MAX_PARTICIPANTES} personas, el máximo para que todo el mundo se vea y se oiga bien. Prueba de nuevo en un rato.`,
            );
            return;
        }
        this.conPlaza = new Set(conPlaza);
        this.presentes = lista.filter((p) => p.id !== this.miId && this.conPlaza.has(p.id));
        const ids = new Set(this.presentes.map((p) => p.id));
        for (const p of this.presentes) {
            this.vistos.add(p.id);
            if (!this.pares.has(p.id)) this.crearPar(p.id);
            if (this.opc.vozDatos && !this.vigilantes.has(p.id)) this.vigilarMedio(p.id);
        }
        for (const id of Array.from(this.pares.keys())) {
            if (!ids.has(id) && this.vistos.has(id)) this.cerrarPar(id);
        }
        this.revisarCompania();
    }

    private revisarCompania() {
        if (this.presentes.length > 0) {
            if (this.inicio === null) this.inicio = Date.now();
            if (!this.contestada) anotarLlamada("contestada", this.opc.vozDatos?.neurona ?? null, `presentes=${this.presentes.length}`);
            this.contestada = true;
            if (this.e.fase !== "en-curso") this.set({ fase: "en-curso" });
            else this.emitir();
            return;
        }
        if (this.contestada && this.opc.colgarAlQuedarSolo) {
            this.colgar("La otra persona ha colgado.");
            return;
        }
        if (this.e.fase === "en-curso") this.set({ fase: "esperando" });
        else this.emitir();
    }

    private alRecibirSenal(s: SenalLlamada, c?: CanalMotor) {
        if (this.cerrado || s.de === this.miId) return;
        if (c && this.canales.includes(c)) this.rutaPar.set(s.de, c);
        if (s.tipo === "mudanza") {
            void this.revisarCanal(false);
            return;
        }
        if (s.tipo === "app") {
            // (LLA1108G) Mensajes de la superficie; un oyente roto no para la llamada.
            for (const cb of Array.from(this.oyentesApp)) {
                try {
                    cb(s.de, s.carga);
                } catch {
                    /* noop */
                }
            }
            return;
        }
        if (s.tipo === "texto") {
            // El TEXTO compartido lo lee el bot de esta llamada (si lo hay); nunca es señal de par.
            this.bot?.recibir({ de: s.de, texto: s.texto, en: s.en });
            return;
        }
        if (s.tipo === "fallo") {
            // (LLA1108E) El otro extremo no consiguió audio: acabamos con el mismo motivo, sin quedarnos en «conectando».
            anotarLlamada("fallo", this.opc.vozDatos?.neurona ?? null, "el otro extremo dice que no hay audio");
            this.puedeReintentar = true;
            this.terminar("error", s.motivo || MOTIVO_SIN_AUDIO);
            return;
        }
        if (s.tipo === "colgar") {
            this.vistos.add(s.de);
            this.cerrarPar(s.de);
            const antes = this.presentes.length;
            this.presentes = this.presentes.filter((p) => p.id !== s.de);
            if (this.presentes.length !== antes) this.revisarCompania();
            return;
        }
        if (s.tipo === "rechazo") {
            // Con dos canales el mismo rechazo puede llegar dos veces.
            if (this.rechazosVistos.has(s.de)) return;
            this.rechazosVistos.add(s.de);
            this.set({ rechazos: [...this.e.rechazos, { uid: s.uid, nombre: s.nombre }] });
            return;
        }
        if (s.para !== this.miId) return;
        // Con la llamada llena, solo se habla con quien tiene plaza.
        if (this.conPlaza.size >= MAX_PARTICIPANTES && !this.conPlaza.has(s.de)) return;
        const par = this.pares.get(s.de) ?? this.crearPar(s.de);
        if (!par) return;
        par.cadena = par.cadena.then(() => this.procesarSenal(par, s)).catch(() => undefined);
    }

    /* ───────────────────────────── Pares WebRTC ───────────────────────────── */

    private crearPar(id: string): Par | null {
        if (this.cerrado || typeof RTCPeerConnection !== "function") return null;
        let pc: RTCPeerConnection;
        try {
            pc = new RTCPeerConnection({ iceServers: this.iceServers });
        } catch {
            return null;
        }
        const par: Par = {
            id,
            pc,
            cortes: soyCortes(this.miId, id),
            haciendoOferta: false,
            ignorandoOferta: false,
            aplicandoRespuesta: false,
            icePendiente: [],
            iceSaliente: [],
            temporizadorIce: null,
            temporizadorDesconexion: null,
            stream: null,
            emisores: { audio: null, video: null },
            conexion: "conectando",
            reinicios: 0,
            metricas: null,
            calidad: "desconocida",
            cadena: Promise.resolve(),
            ofertaPendiente: false,
            aplicandoOfertaAjena: false,
            ofertaTrasResponder: false,
        };
        this.pares.set(id, par);

        pc.onicecandidate = (ev) => {
            if (!ev.candidate) return;
            const c = typeof ev.candidate.toJSON === "function" ? ev.candidate.toJSON() : (ev.candidate as unknown as RTCIceCandidateInit);
            this.encolarIce(par, c);
        };
        pc.ontrack = (ev) => {
            if (this.pares.get(id) !== par) return;
            const s = ev.streams?.[0];
            if (s) par.stream = s;
            else {
                if (!par.stream && hayMediaStream()) par.stream = new MediaStream();
                try {
                    par.stream?.addTrack(ev.track);
                } catch {
                    /* noop */
                }
            }
            const refrescar = () => this.emitir();
            ev.track.onmute = refrescar;
            ev.track.onunmute = refrescar;
            ev.track.onended = refrescar;
            if (ev.track.kind === "audio") this.conectarAnalizador(id, par.stream);
            this.emitir();
        };
        pc.onnegotiationneeded = () => {
            if (this.pares.get(id) !== par) return;
            void this.ofertar(par, "negociacion-necesaria");
        };
        // (LLA1110D) Cada transición de la negociación queda en el registro, con quién era cortés.
        pc.onsignalingstatechange = () => {
            if (this.pares.get(id) !== par) return;
            this.anotarNegociacion(par, `estado=${pc.signalingState}`);
        };
        pc.oniceconnectionstatechange = () => this.alCambiarIce(par, pc.iceConnectionState);
        pc.onconnectionstatechange = () => {
            const cs = pc.connectionState;
            if (cs === "connected" || cs === "failed") this.alCambiarIce(par, cs);
        };

        const audio = this.pistaAudio;
        if (audio) this.ponerEnEmisor(par, "audio", audio);
        const video = this.pistaVideoEnviada();
        if (video) this.ponerEnEmisor(par, "video", video);
        this.emitir();
        return par;
    }

    private async procesarSenal(par: Par, s: Extract<SenalLlamada, { tipo: "senal" }>) {
        if (this.pares.get(par.id) !== par) return;
        const pc = par.pc;
        if (s.desc) {
            const decision = evaluarDescripcion(s.desc.type, par, pc.signalingState);
            par.ignorandoOferta = decision.ignorar;
            if (decision.colision) this.anotarNegociacion(par, decision.ignorar ? "colision oferta-ajena-ignorada" : "colision cede-y-responde");
            if (decision.ignorar) return;
            par.aplicandoOfertaAjena = s.desc.type === "offer";
            try {
                par.aplicandoRespuesta = s.desc.type === "answer";
                try {
                    // Soy el cortés si hay colisión: retiro mi oferta y acepto la suya. (LLA1110D) El rollback se hace
                    // A MANO antes: con el implícito, Chromium dejaba la pista remota «muted» para siempre aunque
                    // llegaran y se decodificaran los cuadros (banco: la tableta, cortés, veía negro el vídeo de la Mac).
                    if (decision.colision && s.desc.type === "offer" && pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
                    await pc.setRemoteDescription(s.desc);
                } catch (err) {
                    // Navegadores sin rollback implícito: se hace a mano y se reintenta.
                    if (s.desc.type !== "offer" || pc.signalingState !== "have-local-offer") throw err;
                    await pc.setLocalDescription({ type: "rollback" });
                    await pc.setRemoteDescription(s.desc);
                }
            } catch {
                par.aplicandoRespuesta = false;
                par.aplicandoOfertaAjena = false;
                return;
            }
            par.aplicandoRespuesta = false;
            await this.vaciarIcePendiente(par);
            if (s.desc.type === "offer") {
                try {
                    await pc.setLocalDescription();
                    if (pc.localDescription) this.enviarDescripcion(par, pc.localDescription);
                } catch {
                    /* noop */
                }
                par.aplicandoOfertaAjena = false;
                const pendiente = par.ofertaTrasResponder;
                par.ofertaTrasResponder = false;
                // (LLA1110D) El cortés que cedió su oferta (o que respondió con pistas suyas aún sin negociar) vuelve a
                // ofertar: el navegador no siempre repite «negotiationneeded» tras el rollback implícito, y entonces sus
                // pistas (micro o cámara) nunca llegaban al otro lado (reproducido en el banco: cámara a la vez en los dos).
                if (pendiente || necesitaNegociar(pc)) {
                    this.anotarNegociacion(par, pendiente ? "oferta-aplazada: sale tras responder" : "pistas-sin-negociar: se vuelve a ofertar");
                    setTimeout(() => {
                        if (this.pares.get(par.id) === par && pc.signalingState === "stable" && !par.haciendoOferta) void this.ofertar(par, "tras-ceder");
                    }, 0);
                }
            }
        }
        if (s.ice) {
            for (const c of s.ice) await this.aplicarIce(par, c);
        }
    }

    private async aplicarIce(par: Par, c: RTCIceCandidateInit) {
        if (!par.pc.remoteDescription) {
            if (par.icePendiente.length < 200) par.icePendiente.push(c);
            return;
        }
        try {
            await par.pc.addIceCandidate(c);
        } catch {
            /* candidato de una oferta ignorada o duplicado: se descarta */
        }
    }

    private async vaciarIcePendiente(par: Par) {
        const lista = par.icePendiente.splice(0);
        for (const c of lista) await this.aplicarIce(par, c);
    }

    private encolarIce(par: Par, c: RTCIceCandidateInit) {
        par.iceSaliente.push(c);
        if (par.temporizadorIce) return;
        par.temporizadorIce = setTimeout(() => {
            par.temporizadorIce = null;
            const lote = par.iceSaliente.splice(0);
            if (lote.length && this.pares.get(par.id) === par) {
                this.enviar({ tipo: "senal", de: this.miId, para: par.id, ice: lote });
            }
        }, 120);
    }

    /**
     * (LLA1110D) Hace una oferta («perfect negotiation»: el descortés ignora las ofertas cruzadas, el cortés cede).
     * Sin ruta IP hacia el par no se oferta: por Bluetooth ICE no puede conectar nunca y las ofertas solo
     * ocupaban el enlace (prueba 33). La oferta queda pendiente y sale cuando aparece una ruta IP.
     */
    private async ofertar(par: Par, motivo: string): Promise<void> {
        const pc = par.pc;
        // Mientras respondo a una oferta del otro (el navegador lanza «negotiationneeded» tras el rollback a mano), mi
        // oferta espera: sale al acabar la respuesta. Si no, se cruzaba otra vez con la suya.
        if (par.aplicandoOfertaAjena) {
            par.ofertaTrasResponder = true;
            return;
        }
        if (this.rutaIp(par.id) === false) {
            if (!par.ofertaPendiente) this.anotarNegociacion(par, `oferta-en-espera motivo=${motivo} sin-ruta-ip`);
            par.ofertaPendiente = true;
            return;
        }
        par.ofertaPendiente = false;
        try {
            par.haciendoOferta = true;
            await pc.setLocalDescription();
            if (pc.localDescription) {
                this.enviarDescripcion(par, pc.localDescription);
                if (pc.localDescription.type === "offer") this.anotarNegociacion(par, `oferta-enviada motivo=${motivo}`);
            }
        } catch (err) {
            this.anotarNegociacion(par, `oferta-fallida motivo=${motivo} error=${(err as Error)?.name ?? "desconocido"}`);
        } finally {
            par.haciendoOferta = false;
        }
    }

    private anotarNegociacion(par: Par, detalle: string) {
        if (!this.limiteNeg.puede(`neg:${par.id}`, Date.now()) && !/colision|espera|fallid/.test(detalle)) return;
        anotarLlamada("negociacion", this.opc.vozDatos?.neurona ?? null, `par=${par.id} rol=${par.cortes ? "cortes" : "descortes"} ${detalle}`);
    }

    /**
     * (LLA1110D) ¿Hay ruta IP hacia el par? Un WebRTC ya conectado ES la prueba. En la prueba 33 (Wi-Fi encendido) la
     * red local nativa no contaba como ruta IP: «sin IP → enlace de datos» y «WebRTC conectado → vuelve a WebRTC» se
     * contradecían en cada tic.
     */
    private rutaIp(id: string): boolean | null {
        if (this.pares.get(id)?.conexion === "conectado") return true;
        try {
            return this.opc.vozDatos?.hayRutaIp?.(id) ?? null;
        } catch {
            return null;
        }
    }

    private enviarDescripcion(par: Par, d: RTCSessionDescription | RTCSessionDescriptionInit) {
        if (!d.type || (d.type !== "offer" && d.type !== "answer")) return;
        this.enviar({ tipo: "senal", de: this.miId, para: par.id, desc: { type: d.type, sdp: d.sdp ?? "" } });
    }

    private alCambiarIce(par: Par, estado: string) {
        if (this.pares.get(par.id) !== par) return;
        switch (reaccionIce(estado, par.reinicios)) {
            case "conectado":
                par.conexion = "conectado";
                par.reinicios = 0;
                if (par.temporizadorDesconexion) {
                    clearTimeout(par.temporizadorDesconexion);
                    par.temporizadorDesconexion = null;
                }
                break;
            case "esperar":
                par.conexion = "reconectando";
                if (!par.temporizadorDesconexion) {
                    par.temporizadorDesconexion = setTimeout(() => {
                        par.temporizadorDesconexion = null;
                        if (this.pares.get(par.id) === par && par.pc.iceConnectionState === "disconnected") this.reiniciarIce(par);
                    }, 5000);
                }
                break;
            case "reiniciar":
                this.reiniciarIce(par);
                break;
            case "fallida": {
                par.conexion = "fallida";
                const nombre = this.presentes.find((p) => p.id === par.id)?.nombre ?? "una persona";
                this.set({
                    aviso: this.viaDirecta(par.id)
                        ? `No se pudo conectar con ${nombre} por el enlace directo. Los dos aparatos tienen que estar en la misma red para llamar sin servidor.`
                        : this.conTurn
                          ? `No se pudo conectar con ${nombre}. Probad a salir y volver a entrar.`
                          : `No se pudo conectar con ${nombre}. ${AVISO_SIN_TURN}`,
                });
                break;
            }
            default:
                return;
        }
        this.emitir();
    }

    private reiniciarIce(par: Par) {
        par.reinicios += 1;
        par.conexion = "reconectando";
        try {
            par.pc.restartIce();
        } catch {
            /* navegador antiguo: se queda reconectando */
        }
        this.emitir();
    }

    private cerrarPar(id: string) {
        this.pararVigilante(id);
        this.pararVozDatos(id, "par-fuera");
        this.rutaIpVista.delete(id);
        this.selectores.delete(id);
        this.audioWebrtcPuesto.delete(id);
        this.carrilDatos.delete(id);
        this.vozDatosDesde.delete(id);
        this.cuadrosWeb.delete(id);
        const par = this.pares.get(id);
        if (!par) return;
        this.pares.delete(id);
        if (par.temporizadorIce) clearTimeout(par.temporizadorIce);
        if (par.temporizadorDesconexion) clearTimeout(par.temporizadorDesconexion);
        try {
            par.pc.onicecandidate = null;
            par.pc.ontrack = null;
            par.pc.onnegotiationneeded = null;
            par.pc.oniceconnectionstatechange = null;
            par.pc.onconnectionstatechange = null;
            par.pc.close();
        } catch {
            /* noop */
        }
        this.desconectarAnalizador(id);
        delete this.niveles[id];
        this.emitir();
    }

    /* ───────────────────────────── Voz por enlace de datos (LLA1108E) ───────────────────────────── */

    private relojVoz(): RelojVoz {
        return (
            this.opc.vozDatos?.reloj ?? {
                ahora: () => Date.now(),
                cada: (fn, ms) => {
                    const t = setInterval(fn, ms);
                    return () => clearInterval(t);
                },
            }
        );
    }

    private estadoDatosPar(id: string): "sin-enlace" | "disponible" | "activo" {
        if (this.vozDatos.get(id)?.estado().activa) return "activo";
        try {
            return this.opc.vozDatos?.transporteHacia(id) ? "disponible" : "sin-enlace";
        } catch {
            return "sin-enlace";
        }
    }

    private hayAudioEnAlgunPar(): boolean {
        for (const p of this.pares.values()) if (p.conexion === "conectado") return true;
        for (const s of this.vozDatos.values()) if (s.estado().recibiendo) return true;
        return false;
    }

    /**
     * Vigila qué medio lleva la voz con ese par (cada 500 ms): sin ruta IP, o con ICE sin conectar tras 6 s, pasa a
     * la voz por el enlace de datos sin colgar; si luego WebRTC conecta, vuelve a él; y a los 15 s sin audio por
     * ninguno, acaba la llamada con un motivo claro en los dos extremos. Ver `voz-datos/decision.ts`.
     */
    private vigilarMedio(id: string) {
        const v = this.opc.vozDatos;
        if (!v || this.cerrado || this.vigilantes.has(id)) return;
        const reloj = this.relojVoz();
        let desde = reloj.ahora();
        let anotadoWebrtc = false;
        let bajaEscucha: (() => void) | null = null;
        let escuchado: TransporteVoz | null = null;
        const neurona = v.neurona ?? null;
        const tic = () => {
            const par = this.pares.get(id);
            if (this.cerrado || !par) {
                this.pararVigilante(id);
                return;
            }
            const tr = (() => {
                try {
                    return v.transporteHacia(id);
                } catch {
                    return null;
                }
            })();
            // Si el otro extremo ya habla por el enlace de datos, se le contesta al instante (sin esperar mis 6 s).
            if (tr && tr !== escuchado) {
                bajaEscucha?.();
                escuchado = tr;
                // (LLA1110D) Solo el control de voz del otro cuenta (un «hola» arranca, un «fin carril:…» para). Antes
                // cualquier texto voz.* —hasta el «fin» con que el otro la paraba— rearrancaba la sesión aquí.
                bajaEscucha = tr.alRecibir((t) => this.alControlVozAjeno(id, t));
                this.vigiladoEscucha.set(id, () => {
                    bajaEscucha?.();
                    bajaEscucha = null;
                });
            }
            const accion = decidirAccionMedio({
                transcurridoMs: reloj.ahora() - desde,
                webrtc: par.conexion,
                datos: this.estadoDatosPar(id),
                hayRutaIp: this.rutaIp(id),
            });
            switch (accion) {
                case "usar-datos":
                    void this.activarVozDatos(id);
                    break;
                case "volver-webrtc":
                    // (LLA1110D) Ya solo llega aquí con la voz por datos degradada (ver `decidirAccionMedio`); el «fin» lleva el
                    // motivo «carril:webrtc» para que el otro extremo la pare también y no la rearranque.
                    this.pararVozDatos(id, "carril:webrtc");
                    anotarLlamada("medio=webrtc", neurona, `par=${id} (vuelve a WebRTC sin cortar)`);
                    desde = reloj.ahora();
                    break;
                case "mantener":
                    if (par.conexion === "conectado") {
                        if (!anotadoWebrtc) {
                            anotadoWebrtc = true;
                            anotarLlamada("medio=webrtc", neurona, `par=${id}`);
                        }
                        // Si la conexión se cae más tarde, el plazo cuenta desde la caída.
                        desde = reloj.ahora();
                    }
                    break;
                case "fallar":
                    if (this.hayAudioEnAlgunPar()) {
                        // En un grupo, un par sin audio no tumba la llamada con los demás.
                        par.conexion = "fallida";
                        this.pararVigilante(id);
                        this.emitir();
                    } else {
                        this.fallarSinAudio();
                    }
                    break;
                default:
                    break;
            }
            // (LLA1108H) Wi-Fi directo: pedirlo si solo hay Bluetooth, subir a WebRTC cuando aparezca una ruta IP y
            // llevar vídeo ligero por el enlace de datos mientras tanto.
            this.revisarEscalada(id, par);
            // (LLA1110D) Un carril por flujo, con evidencia sostenida y enfriamiento.
            this.revisarCarriles(id, par, tr);
            void this.sincronizarVideoDatos(id);
        };
        this.vigilantes.set(id, setInterval(tic, v.intervaloMs ?? 500));
    }

    private readonly vigiladoEscucha = new Map<string, () => void>();

    /* ───────────────────────────── Carriles por flujo (LLA1110D) ───────────────────────────── */

    private selectorDe(id: string): SelectorCarriles {
        let s = this.selectores.get(id);
        if (!s) {
            s = new SelectorCarriles();
            for (const [f, c] of this.forzadosCarril) s.forzar(f, c);
            this.selectores.set(id, s);
        }
        return s;
    }

    /** El carril que es el enlace de datos de ahora (Bluetooth rápido o GATT, o un enlace local). */
    private carrilDeTransporte(tr: TransporteVoz | null): Carril | null {
        if (!tr) return null;
        let tipo = "";
        try {
            tipo = tr.info().tipo;
        } catch {
            return null;
        }
        const t = tipo.toLowerCase();
        if (t === "ble" || t.includes("bluetooth")) {
            let kbps: number | null = null;
            try {
                kbps = tr.capacidadKbps?.() ?? null;
            } catch {
                kbps = null;
            }
            // El canal L2CAP rápido mide 160–170 kb/s; el GATT, unas decenas.
            return kbps !== null && kbps < 60 ? "ble-gatt" : "ble-l2cap";
        }
        if (tipo === "wifi-directo") return "wifi-direct";
        if (tipo === "wifi-aware") return "wifi-aware";
        if (tipo === "awdl") return "awdl";
        return "lan-tcp";
    }

    /**
     * (LLA1110D) Lo que el otro extremo dice de la voz por el enlace de datos: un «hola» la arranca aquí (salvo que yo
     * sea el director y mi voz vaya bien por WebRTC: entonces el otro, sin oírme, vuelve solo a WebRTC); un «fin» con
     * motivo «carril:…» la para aquí también. Nunca la rearranca un «fin» ni un paquete de audio en vuelo.
     */
    private alControlVozAjeno(id: string, t: string) {
        if (typeof t !== "string" || !t.startsWith('{"t":"voz.c"')) return;
        const c = leerControl(t);
        if (!c || c.s !== this.sesionId || this.cerrado) return;
        const par = this.pares.get(id);
        const sel = this.selectorDe(id);
        if (c.k === "hola") {
            if (this.vozDatos.has(id) || this.activandoDatos.has(id)) return;
            if (par?.conexion === "conectado" && sel.carril("voz") === "webrtc" && soyDirector(this.miId, id)) {
                if (this.limiteCarril.puede(`hola-ignorado:${id}`, Date.now())) anotarLlamada("carril", this.opc.vozDatos?.neurona ?? null, `par=${id} flujo=voz hola-ignorado motivo=director-en-webrtc`);
                return;
            }
            void this.activarVozDatos(id, "el-otro-saluda");
        } else if (c.k === "fin" && typeof c.m === "string" && c.m.startsWith("carril:")) {
            if (!this.vozDatos.has(id)) return;
            this.pararVozDatos(id, "sigue-al-otro");
            const cambio = sel.seguir("voz", par?.conexion === "conectado" ? "webrtc" : null, this.relojVoz().ahora());
            if (cambio) this.anotarCarril(id, cambio);
        }
    }

    private anotarCarril(id: string, c: CambioCarril) {
        if (!this.limiteCarril.puede(`carril:${id}:${c.flujo}`, Date.now())) return;
        anotarLlamada("carril", this.opc.vozDatos?.neurona ?? null, `par=${id} flujo=${c.flujo} de=${c.de ?? "-"} a=${c.a ?? "-"} motivo=${c.motivo}${c.muestras ? ` muestras=[${c.muestras}]` : ""}`);
    }

    /** El emisor de audio de WebRTC lleva el micro solo si la voz NO va por el enlace de datos (sin voz doble). */
    private aplicarAudioWebrtc(id: string) {
        const par = this.pares.get(id);
        if (!par) return;
        const quiere = !this.vozDatos.get(id)?.estado().activa;
        if (this.audioWebrtcPuesto.get(id) === quiere) return;
        this.audioWebrtcPuesto.set(id, quiere);
        this.ponerEnEmisor(par, "audio", quiere ? this.pistaAudio : null);
    }

    /**
     * Revisa el carril de cada flujo con ese par. La voz la ARRANCA `decidirAccionMedio` (WebRTC, o el enlace de datos
     * sin IP o con ICE sin conectar); desde ahí el selector solo la mueve si su carril se cae o se degrada de forma
     * sostenida, una vez por enfriamiento. El vídeo y la pantalla eligen por capacidad y suben con histéresis.
     */
    private revisarCarriles(id: string, par: Par, tr: TransporteVoz | null) {
        this.medirCuadrosWeb(id, par);
        const sel = this.selectorDe(id);
        const reloj = this.relojVoz();
        const ahora = reloj.ahora();
        const datosCarril = this.carrilDeTransporte(tr);
        this.carrilDatos.set(id, datosCarril);
        const voz = this.vozDatos.get(id);
        const ev = voz?.estado();
        const muestras: MuestraCarril[] = [];
        const met = par.metricas;
        muestras.push({
            carril: "webrtc",
            arriba: par.conexion === "conectado",
            rttMs: met?.rttMs ?? null,
            perdidaPct: par.calidad === "mala" ? 20 : met && met.recibidos + met.perdidos > 0 ? (100 * met.perdidos) / (met.recibidos + met.perdidos) : 0,
        });
        if (datosCarril && tr) {
            let abierto = false;
            try {
                abierto = tr.abierto();
            } catch {
                abierto = false;
            }
            // Voz por datos que no recibe nada desde hace 4 s: el carril está mal aunque el enlace diga «abierto».
            const desdeRx = ev?.activa ? ahora - Math.max(ev.ultimoRxEn || 0, this.vozDatosDesde.get(id) ?? ahora) : 0;
            const cal = voz?.calidad();
            let kbps: number | null = null;
            try {
                kbps = tr.capacidadKbps?.() ?? null;
            } catch {
                kbps = null;
            }
            muestras.push({ carril: datosCarril, arriba: abierto, rttMs: cal?.rttMs ?? null, perdidaPct: desdeRx > 4000 ? 100 : (cal?.perdidaPct ?? 0), kbps });
        }
        const puede = (f: Flujo, c: Carril) => {
            if (c === "webrtc") return true;
            if (c !== datosCarril) return false;
            if (f === "video" || f === "pantalla") return !!this.opc.vozDatos?.video;
            return true;
        };
        const cambios: CambioCarril[] = [];
        // La voz: el selector refleja dónde va DE VERDAD (lo arrancado por la decisión de arranque o por el otro extremo).
        const vozReal: Carril | null = ev?.activa ? datosCarril : par.conexion === "conectado" ? "webrtc" : null;
        if (vozReal && sel.carril("voz") !== vozReal) {
            const c = sel.fijar("voz", vozReal, ahora);
            if (c) cambios.push({ ...c, motivo: ev?.activa ? "voz-por-datos" : "voz-por-webrtc", muestras: "" });
        }
        const senal = this.viaDirecta(id) ? (datosCarril ?? "lan-tcp") : null;
        if (sel.carril("senal") !== senal) {
            const c = sel.fijar("senal", senal, ahora);
            if (c) cambios.push({ ...c, motivo: senal ? "enlace-directo" : "servidor" });
        }
        const flujos: Flujo[] = sel.carril("voz") ? ["voz", "video", "pantalla"] : ["video", "pantalla"];
        for (const c of sel.actualizar(muestras, ahora, puede, flujos)) {
            cambios.push(c);
            if (c.flujo !== "voz") continue;
            if (c.a === "webrtc" && ev?.activa) this.pararVozDatos(id, "carril:webrtc");
            else if (c.a && c.a === datosCarril && !ev?.activa) void this.activarVozDatos(id, `carril:${c.motivo}`);
        }
        for (const c of cambios) this.anotarCarril(id, c);
        this.aplicarAudioWebrtc(id);
        if (cambios.length) this.emitir();
    }

    /** ¿El vídeo de ese par va por el enlace de datos (vídeo ligero)? */
    private videoPorDatos(id: string, par: Par | undefined): boolean {
        const sel = this.selectores.get(id);
        const dc = this.carrilDatos.get(id) ?? null;
        const elegido = sel ? (this.pantallaOn ? sel.carril("pantalla") : sel.carril("video")) : null;
        if (elegido && dc && elegido === dc) return true;
        if (elegido === "webrtc") return false;
        return par?.conexion !== "conectado";
    }

    /**
     * (LLA1110D) Carril de cada flujo con cada par, para la ventana: «Voz: Bluetooth · Vídeo: WebRTC». Forzar un carril:
     * `forzarCarril("video", "webrtc")`; `forzarCarril("video", null)` vuelve a la elección automática.
     */
    carriles(): CarrilesParVista[] {
        const out: CarrilesParVista[] = [];
        for (const id of this.pares.keys()) {
            const sel = this.selectores.get(id);
            if (!sel) {
                out.push({ parId: id, voz: null, video: null, pantalla: null, senal: null, datos: null, forzados: {}, texto: "", director: soyDirector(this.miId, id) });
                continue;
            }
            const f = sel.foto();
            const forzados: Partial<Record<Flujo, Carril>> = {};
            for (const k of Object.keys(f) as Flujo[]) if (f[k].forzado) forzados[k] = f[k].forzado!;
            out.push({ parId: id, voz: f.voz.carril, video: f.video.carril, pantalla: f.pantalla.carril, senal: f.senal.carril, datos: this.carrilDatos.get(id) ?? null, forzados, texto: textoCarriles(this.pantallaOn ? { voz: f.voz, pantalla: f.pantalla } : { voz: f.voz, video: f.video }), director: soyDirector(this.miId, id) });
        }
        return out;
    }

    /** (LLA1110D) La persona fuerza el carril de un flujo (null: automático). Si el forzado no está arriba, manda lo automático. */
    forzarCarril(flujo: Flujo, carril: Carril | null): void {
        if (carril) this.forzadosCarril.set(flujo, carril);
        else this.forzadosCarril.delete(flujo);
        for (const s of this.selectores.values()) s.forzar(flujo, carril);
        anotarLlamada("carril", this.opc.vozDatos?.neurona ?? null, `flujo=${flujo} forzado=${carril ?? "automatico"}`);
        this.emitir();
    }

    private pararVigilante(id: string) {
        const t = this.vigilantes.get(id);
        if (t) clearInterval(t);
        this.vigilantes.delete(id);
        const baja = this.vigiladoEscucha.get(id);
        if (baja) {
            try {
                baja();
            } catch {
                /* noop */
            }
        }
        this.vigiladoEscucha.delete(id);
    }

    private async activarVozDatos(id: string, motivo = "arranque"): Promise<void> {
        const v = this.opc.vozDatos;
        if (!v || this.cerrado || this.vozDatos.has(id) || this.activandoDatos.has(id)) return;
        const neurona = v.neurona ?? null;
        let tr: TransporteVoz | null = null;
        try {
            tr = v.transporteHacia(id);
        } catch {
            tr = null;
        }
        if (!tr) return;
        this.activandoDatos.add(id);
        try {
            const audio = v.crearAudio(this.local);
            if (!audio) {
                anotarLlamada("fallo", neurona, "este aparato no puede capturar audio para la voz por enlace de datos");
                return;
            }
            const codecs = await v.codecs();
            if (this.cerrado) return;
            const s = new SesionVozDatos({
                idLlamada: this.sesionId,
                transporte: tr,
                audio,
                codecs,
                reloj: this.relojVoz(),
                anotar: (h) => anotarLlamada("medio=enlace-datos", neurona, h),
            });
            s.suscribir(() => this.emitir());
            const ok = await s.iniciar();
            if (!ok || this.cerrado) {
                if (ok) s.detener();
                else anotarLlamada("fallo", neurona, "no se pudo abrir el micrófono para la voz por enlace de datos");
                return;
            }
            s.silenciar(!this.microOn);
            this.vozDatos.set(id, s);
            this.vozDatosDesde.set(id, this.relojVoz().ahora());
            const e = s.estado();
            anotarLlamada("medio=enlace-datos", neurona, `par=${id} codec=${e.codecTx} via=${e.medio.tipo}${e.medio.cifrada ? " cifrada" : " sin-cifrar"} motivo=${motivo}`);
            this.aplicarAudioWebrtc(id);
            this.emitir();
        } finally {
            this.activandoDatos.delete(id);
        }
    }

    private pararVozDatos(id: string, motivo: string) {
        this.pararVideoDatos(id);
        const s = this.vozDatos.get(id);
        if (!s) return;
        this.vozDatos.delete(id);
        this.vozDatosDesde.delete(id);
        try {
            s.detener(motivo);
        } catch {
            /* noop */
        }
        this.aplicarAudioWebrtc(id);
        this.emitir();
    }

    /* ───────────────────── Escalada al Wi-Fi directo y vídeo ligero (LLA1108H) ───────────────────── */

    /** Cámara o pantalla cambiaron: se revisa ya la escalada y el vídeo de datos, sin esperar al siguiente tic. */
    private alCambiarVideoLocal() {
        if (!this.opc.vozDatos || this.cerrado) return;
        for (const [id, par] of this.pares) {
            this.revisarEscalada(id, par);
            void this.sincronizarVideoDatos(id);
        }
    }

    /**
     * Si el único camino hacia el par no lleva IP y hace falta más que voz (cámara, pantalla, o la voz va regular),
     * pide el enlace Wi-Fi directo (según el ajuste: Automático lo abre, Preguntar lo propone a un toque en los dos
     * aparatos, Nunca no hace nada). Cuando aparece una ruta IP, reinicia ICE para que WebRTC suba SIN colgar; el
     * vigilante ya vuelve a WebRTC (y suelta el vídeo ligero) en cuanto conecta.
     */
    private revisarEscalada(id: string, par: Par) {
        const v = this.opc.vozDatos;
        if (!v || this.cerrado) return;
        const neurona = v.neurona ?? null;
        const ip = (() => {
            try {
                return v.hayRutaIp?.(id) ?? null;
            } catch {
                return null;
            }
        })();
        const ahora = this.relojVoz().ahora();
        // 1) Aparece una ruta IP (se abrió el Wi-Fi directo): WebRTC reintenta por ella, sin cortar la voz.
        const antes = this.rutaIpVista.get(id) ?? null;
        this.rutaIpVista.set(id, ip);
        // (LLA1110D) Apareció la ruta IP y había una oferta en espera: sale ahora.
        if (ip === true && par.ofertaPendiente && par.pc.signalingState === "stable") void this.ofertar(par, "ruta-ip-nueva");
        if (ip === true && par.conexion !== "conectado") {
            const ultimo = this.ultimoReintentoIce.get(id) ?? -Infinity;
            if (antes === false || (par.conexion === "fallida" && ahora - ultimo >= 5000 && par.reinicios < 6)) {
                if (ahora - ultimo >= 1500) {
                    this.ultimoReintentoIce.set(id, ahora);
                    par.reinicios = 0;
                    anotarLlamada("medio=webrtc", neurona, `par=${id} ruta IP nueva (Wi-Fi directo): se reintenta WebRTC sin colgar`);
                    this.reiniciarIce(par);
                }
            }
        }
        // 2) Pedir el enlace.
        const datos = this.vozDatos.get(id);
        const cal = datos ? nivelCalidadVoz(datos.calidad()) : null;
        // (WFA1109A) Sin Wi-Fi P2P posible entre este par (Mac ↔ Android sin el permiso del punto de acceso): la llamada se queda en Bluetooth y no pide Wi-Fi.
        let sinP2p = false;
        try {
            sinP2p = v.estadoWifi?.()?.paso === "sin-p2p";
        } catch {
            sinP2p = false;
        }
        if (v.escalarWifi && !sinP2p && debeEscalar({ contestada: this.contestada, hayRutaIp: ip, camara: this.camaraOn, pantalla: this.pantallaOn, vozDatosActiva: !!datos?.estado().activa, nivelVoz: cal })) {
            const clase = claseEscalada({ pantalla: this.pantallaOn });
            const clave = `${id}:${clase}`;
            if (ahora - (this.escaladas.get(clave) ?? -Infinity) >= 60_000) {
                this.escaladas.set(clave, ahora);
                anotarLlamada("escalada-wifi", neurona, `par=${id} solo hay enlaces sin IP: se pide Wi-Fi directo clase=${clase} (camara=${this.camaraOn ? "si" : "no"} pantalla=${this.pantallaOn ? "si" : "no"} voz=${cal ?? "-"})`);
                try {
                    v.escalarWifi(clase, this.local);
                } catch {
                    /* pedir el enlace nunca tumba la llamada */
                }
            }
        }
        // 3) El paso del enlace cambió: la superficie lo cuenta.
        let w: EstadoWifiLlamada | null = null;
        try {
            w = v.estadoWifi?.() ?? null;
        } catch {
            w = null;
        }
        const firma = w ? `${w.paso}|${w.aviso ?? ""}` : "";
        if (firma !== this.wifiVisto) {
            if (w) anotarLlamada("escalada-wifi", neurona, `par=${id} wifi-directo ${w.paso}`);
            this.wifiVisto = firma;
            this.wifiEstado = w;
            this.emitir();
        }
    }

    /** Qué imagen enseñar del par: la de WebRTC si trae vídeo; si no, la del enlace de datos (cuando ya llegó algo). */
    /**
     * (LLA1110D) ¿Trae WebRTC imagen de ese par? Conectado y con una pista de vídeo viva y NO muda. Por Bluetooth WebRTC
     * negocia y da una pista de vídeo que se queda muda para siempre (ICE nunca conecta): esa no cuenta.
     */
    private webConImagen(par: Par | undefined): boolean {
        if (!par || par.conexion !== "conectado") return false;
        try {
            const vivas = par.stream?.getVideoTracks().filter((t) => t.readyState === "live") ?? [];
            if (vivas.some((t) => !t.muted)) return true;
            // Chromium deja a veces la pista «muted» aunque lleguen y se decodifiquen cuadros (tras un rollback): cuentan
            // los cuadros decodificados de verdad (getStats), medidos en el tic.
            return vivas.length > 0 && Date.now() - (this.cuadrosWeb.get(par.id)?.en ?? -Infinity) < 3000;
        } catch {
            return false;
        }
    }

    private readonly cuadrosWeb = new Map<string, { n: number; en: number; pidiendo: boolean; ultimo: number }>();

    /** (LLA1110D) Cuadros de vídeo decodificados que entran por WebRTC de ese par (como mucho una consulta por segundo). */
    private medirCuadrosWeb(id: string, par: Par) {
        if (par.conexion !== "conectado" || !par.stream?.getVideoTracks().length) return;
        let c = this.cuadrosWeb.get(id);
        if (!c) this.cuadrosWeb.set(id, (c = { n: 0, en: -Infinity, pidiendo: false, ultimo: 0 }));
        const ahora = Date.now();
        if (c.pidiendo || ahora - c.ultimo < 1000) return;
        c.pidiendo = true;
        const cc = c;
        void par.pc
            .getStats()
            .then((st) => {
                let n = 0;
                st.forEach((r: Record<string, unknown>) => {
                    if (r.type === "inbound-rtp" && r.kind === "video" && typeof r.framesDecoded === "number") n += r.framesDecoded;
                });
                if (n > cc.n) cc.en = Date.now();
                cc.n = n;
            })
            .catch(() => undefined)
            .finally(() => {
                cc.pidiendo = false;
                cc.ultimo = Date.now();
            });
    }

    private streamDe(id: string, par: Par | undefined): MediaStream | null {
        const web = par?.stream ?? null;
        // (LLA1110D) Con imagen por el enlace de datos, se enseña esa si el carril de vídeo es el de datos o si WebRTC no
        // trae imagen (pista muda o par sin conectar): nunca un <video> negro mientras se pinta el vídeo ligero.
        const sd = this.videoDatos.get(id);
        const sal = this.salidasVideo.get(id);
        if (sd && sal?.stream && sd.estado().recibiendo && (this.videoPorDatos(id, par) || !this.webConImagen(par))) return sal.stream;
        if (web && web.getVideoTracks().length) return web;
        const s = this.videoDatos.get(id);
        const salida = this.salidasVideo.get(id);
        if (s && salida?.stream && s.estado().recibiendo) return salida.stream;
        return web;
    }

    /** VID1110A: el canvas del vídeo ligero de ese par (solo si WebRTC no trae vídeo y ya llegó una imagen). */
    private lienzoDe(id: string, par: Par | undefined): HTMLCanvasElement | null {
        const web = par?.stream ?? null;
        const s = this.videoDatos.get(id);
        const salida = this.salidasVideo.get(id);
        // (LLA1110D) Vídeo por el enlace de datos con imagen: el lienzo manda si es su carril o si WebRTC no trae imagen.
        if (s && salida?.lienzo && s.estado().recibiendo && (this.videoPorDatos(id, par) || !this.webConImagen(par))) return salida.lienzo;
        if (web && web.getVideoTracks().length) return null;
        return s && salida?.lienzo && s.estado().recibiendo ? salida.lienzo : null;
    }

    /**
     * Mantiene el vídeo ligero de ese par: existe mientras la voz va por el enlace de datos y WebRTC no ha conectado
     * (así también se RECIBE el del otro aunque mi cámara esté apagada); su fuente es mi cámara cuando está encendida.
     * Al conectar WebRTC o acabar la voz por datos, se suelta (el vídeo pasa a WebRTC sin colgar).
     */
    private async sincronizarVideoDatos(id: string): Promise<void> {
        const v = this.opc.vozDatos;
        const vid = v?.video;
        if (!v || !vid || this.cerrado) return;
        const par = this.pares.get(id);
        const voz = this.vozDatos.get(id);
        // (LLA1110D) El vídeo ligero vive mientras el carril de vídeo de ese par sea el enlace de datos (no «mientras WebRTC no conecte»).
        // Y también mientras la pista de WebRTC de ese par no traiga imagen: en el relevo datos → WebRTC el lienzo sigue
        // hasta que el <video> tenga cuadros, y en WebRTC → datos arranca en cuanto WebRTC se cae (sin hueco negro).
        const deseada = !!par && !!voz?.estado().activa && (this.videoPorDatos(id, par) || !this.webConImagen(par));
        if (!deseada) {
            this.pararVideoDatos(id);
            return;
        }
        let s = this.videoDatos.get(id);
        if (!s) {
            if (this.activandoVideo.has(id)) return;
            let tr: TransporteVoz | null = null;
            try {
                tr = v.transporteHacia(id);
            } catch {
                tr = null;
            }
            if (!tr) return;
            this.activandoVideo.add(id);
            try {
                const fabrica = await vid.fabrica();
                if (this.cerrado || this.videoDatos.has(id) || !this.vozDatos.get(id)?.estado().activa) return;
                const salida = vid.crearSalida();
                const neurona = v.neurona ?? null;
                s = new SesionVideoDatos({
                    idLlamada: this.sesionId,
                    transporte: tr,
                    codecs: fabrica,
                    salida,
                    reloj: this.relojVoz(),
                    anotar: (h) => anotarLlamada("medio=video-datos", neurona, h),
                });
                s.suscribir(() => this.emitir());
                s.iniciar();
                this.videoDatos.set(id, s);
                this.salidasVideo.set(id, salida);
                anotarLlamada("medio=video-datos", neurona, `par=${id} vídeo ligero abierto (códec por sentido tras el saludo)`);
                this.emitir();
            } catch {
                /* sin vídeo ligero la llamada sigue con voz */
            } finally {
                this.activandoVideo.delete(id);
            }
        }
        s = this.videoDatos.get(id);
        if (!s) return;
        // (LLA1110D) Solo se manda imagen por datos si el carril de vídeo de este lado es el de datos (con WebRTC sano la
        // sesión sigue viva solo para RECIBIR hasta que el <video> del otro tenga imagen).
        const quiere = this.camaraOn && !this.pantallaOn && this.videoPorDatos(id, par) ? this.pistaCamara : null;
        const actual = this.pistaFuenteVideo.get(id) ?? null;
        if (quiere && actual !== quiere) {
            const f = vid.fuenteDePista(quiere);
            if (f) {
                s.ponerFuente(f);
                this.pistaFuenteVideo.set(id, quiere);
            }
        } else if (!quiere && actual) {
            s.ponerFuente(null);
            this.pistaFuenteVideo.delete(id);
        }
    }

    private pararVideoDatos(id: string) {
        const s = this.videoDatos.get(id);
        this.pistaFuenteVideo.delete(id);
        if (!s) return;
        this.videoDatos.delete(id);
        this.salidasVideo.delete(id);
        try {
            s.detener();
        } catch {
            /* noop */
        }
        this.emitir();
    }

    /** Ni WebRTC ni el enlace de datos dieron audio a tiempo: se acaba diciéndolo, en los dos extremos. */
    private fallarSinAudio() {
        if (this.cerrado) return;
        anotarLlamada("fallo", this.opc.vozDatos?.neurona ?? null, "sin audio a los 15 s: ni webrtc ni enlace-datos");
        this.puedeReintentar = true;
        this.enviar({ tipo: "fallo", de: this.miId, motivo: MOTIVO_SIN_AUDIO });
        this.terminar("error", MOTIVO_SIN_AUDIO);
    }

    /** Lo que la superficie necesita saber del medio: cuál es, cómo va y si todavía se está conectando el audio. */
    private vistaMedio(): Pick<EstadoLlamada, "medio" | "estadoAudio" | "puedeReintentar" | "videoNoDisponible" | "videoDatos" | "escalada"> {
        const webrtcOk = Array.from(this.pares.values()).some((p) => p.conexion === "conectado");
        const datos = Array.from(this.vozDatos.values()).find((s) => s.estado().activa);
        let medio: MedioVoz | null = null;
        // (LLA1110D) La voz se queda por el enlace de datos aunque WebRTC conecte (lleva el vídeo): se dice por dónde va DE VERDAD.
        if (webrtcOk && !datos) medio = { tipo: "webrtc", texto: "Voz por WebRTC · cifrada", cifrada: true };
        else if (datos) {
            const e = datos.estado();
            const cal = datos.calidad();
            medio = { tipo: "enlace-datos", texto: textoMedioVoz(e.medio), cifrada: e.medio.cifrada, calidadTexto: textoCalidadVoz(cal), nivel: nivelCalidadVoz(cal) };
        }
        const conAudio = webrtcOk || Array.from(this.vozDatos.values()).some((s) => s.estado().recibiendo);
        // (LLA1108H) Vídeo ligero por el enlace de datos y pasos de la escalada al Wi-Fi directo.
        const vd = Array.from(this.videoDatos.values())[0]?.estado();
        const hayVideoLigero = !!this.opc.vozDatos?.video;
        const videoDatos = vd
            ? { disponible: hayVideoLigero, enviando: vd.enviando, recibiendo: vd.recibiendo, calidadTexto: vd.texto, nivel: vd.nivel }
            : hayVideoLigero && datos && !webrtcOk
              ? { disponible: true, enviando: false, recibiendo: false, calidadTexto: null, nivel: null }
              : null;
        const w = this.wifiEstado ?? { paso: "inactivo" as const, aviso: null };
        const videoPedido = this.camaraOn || this.pantallaOn;
        const escalada =
            this.opc.vozDatos && (this.opc.vozDatos.escalarWifi || hayVideoLigero) && this.contestada
                ? { paso: w.paso, texto: textoEscalada({ paso: w.paso, webrtcConectado: webrtcOk, videoPedido, videoDatosActivo: !!vd?.enviando }), aviso: w.aviso ?? null }
                : null;
        let videoNoDisponible: string | null = null;
        if (datos && !webrtcOk) {
            // La pantalla no cabe por el enlace de datos (sí por el Wi-Fi directo); la cámara solo si no hay vídeo ligero.
            if (this.pantallaOn) videoNoDisponible = w.paso === "sin-p2p" ? TEXTO_PANTALLA_SIN_P2P : this.opc.vozDatos?.escalarWifi ? TEXTO_PANTALLA_BLE : TEXTO_VIDEO_BLE;
            else if (this.camaraOn && !hayVideoLigero) videoNoDisponible = TEXTO_VIDEO_BLE;
        }
        return {
            medio,
            estadoAudio: this.contestada && !this.cerrado && !conAudio && this.opc.vozDatos ? TEXTO_CONTESTADA_CONECTANDO : null,
            puedeReintentar: this.puedeReintentar,
            videoNoDisponible,
            videoDatos,
            escalada,
        };
    }

    /* ───────────────────────────── Hablante y calidad ───────────────────────────── */

    private asegurarAudio(): AudioContext | null {
        if (this.ctxAudio) return this.ctxAudio;
        if (typeof window === "undefined") return null;
        const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!C) return null;
        try {
            this.ctxAudio = new C();
        } catch {
            this.ctxAudio = null;
        }
        return this.ctxAudio;
    }

    private conectarAnalizador(id: string, stream: MediaStream | null) {
        const ctx = this.ctxAudio;
        if (!ctx || !stream || !stream.getAudioTracks().length) return;
        if (this.analizadores.get(id)?.streamId === stream.id) return;
        this.desconectarAnalizador(id);
        try {
            const fuente = ctx.createMediaStreamSource(stream);
            const analizador = ctx.createAnalyser();
            analizador.fftSize = 512;
            analizador.smoothingTimeConstant = 0.3;
            fuente.connect(analizador);
            this.analizadores.set(id, { fuente, analizador, datos: new Uint8Array(new ArrayBuffer(analizador.fftSize)), streamId: stream.id });
        } catch {
            /* sin medidor para esta voz */
        }
    }

    private conectarAnalizadorLocal() {
        if (!this.pistaAudio || !hayMediaStream()) return;
        this.desconectarAnalizador(this.miId);
        this.conectarAnalizador(this.miId, new MediaStream([this.pistaAudio]));
    }

    private desconectarAnalizador(id: string) {
        const a = this.analizadores.get(id);
        if (!a) return;
        this.analizadores.delete(id);
        try {
            a.fuente.disconnect();
        } catch {
            /* noop */
        }
    }

    private medirNiveles() {
        if (this.cerrado) return;
        // El reloj de la llamada mueve también los turnos del bot (silencio ≥ SILENCIO_MS, corte…).
        this.bot?.tictac(Date.now());
        if (!this.analizadores.size) return;
        if (this.ctxAudio?.state === "suspended") void this.ctxAudio.resume().catch(() => undefined);
        const niveles: Record<string, number> = {};
        for (const [id, a] of this.analizadores) {
            try {
                a.analizador.getByteTimeDomainData(a.datos);
            } catch {
                continue;
            }
            // La voz hablada ronda 0,02–0,2 de RMS: se amplía para que el halo se note.
            const bruto = Math.min(1, nivelRms(a.datos) * 3);
            const mudo = id === this.miId && !this.microOn;
            niveles[id] = mudo ? 0 : suavizarNivel(this.niveles[id] ?? 0, bruto);
        }
        const anterior = this.hablante?.id ?? null;
        this.hablante = elegirHablante(niveles, this.hablante, Date.now());
        const cambioNivel = Object.keys(niveles).some((id) => Math.round(niveles[id] * 6) !== Math.round((this.niveles[id] ?? 0) * 6));
        this.niveles = niveles;
        if (cambioNivel || anterior !== (this.hablante?.id ?? null)) this.emitir();
    }

    private async medirCalidad() {
        if (this.cerrado) return;
        let cambio = false;
        for (const par of Array.from(this.pares.values())) {
            try {
                const informe = await par.pc.getStats();
                const m = extraerMetricas(informe as unknown as Iterable<Record<string, unknown>>);
                const perdida = perdidaEntre(par.metricas, m);
                par.metricas = m;
                const calidad = calidadDesde({ rttMs: m.rttMs, perdidaPct: perdida, jitterMs: m.jitterMs });
                if (calidad !== par.calidad) {
                    par.calidad = calidad;
                    cambio = true;
                }
            } catch {
                /* estadísticas no disponibles ahora */
            }
        }
        if (cambio) this.emitir();
    }

    /** (LLA1108G) Medidas por par para el indicador de calidad de la superficie (lo que midió `getStats`). */
    metricasPares(): Array<{ id: string; rttMs: number | null; perdidos: number; recibidos: number; jitterMs: number | null }> {
        const out: Array<{ id: string; rttMs: number | null; perdidos: number; recibidos: number; jitterMs: number | null }> = [];
        for (const par of this.pares.values()) {
            if (par.metricas) out.push({ id: par.id, rttMs: par.metricas.rttMs, perdidos: par.metricas.perdidos, recibidos: par.metricas.recibidos, jitterMs: par.metricas.jitterMs });
        }
        return out;
    }

    private arrancarTemporizadores() {
        const eco = modoEco();
        this.temporizadorNivel = setInterval(() => this.medirNiveles(), this.opc.intervaloNivelMs ?? (eco ? 400 : 150));
        this.temporizadorStats = setInterval(() => void this.medirCalidad(), this.opc.intervaloStatsMs ?? 4000);
    }

    private construirParticipantes(): ParticipanteLlamada[] {
        if (this.e.fase === "inactiva" && !this.local) return [];
        const yo: ParticipanteLlamada = {
            ...this.meta(),
            yo: true,
            stream: this.local,
            conexion: "conectado",
            calidad: peorCalidad(Array.from(this.pares.values(), (p) => p.calidad)),
            nivel: this.niveles[this.miId] ?? 0,
        };
        const otros = this.presentes.map((p): ParticipanteLlamada => {
            const par = this.pares.get(p.id);
            return {
                ...p,
                yo: false,
                stream: this.streamDe(p.id, par),
                lienzo: this.lienzoDe(p.id, par),
                conexion: this.vozDatos.get(p.id)?.estado().recibiendo ? "conectado" : (par?.conexion ?? "conectando"),
                calidad: par?.calidad ?? "desconocida",
                nivel: this.niveles[p.id] ?? 0,
            };
        });
        return [yo, ...otros];
    }

    /* ───────────────────────────── Salir ───────────────────────────── */

    /** Cuelga: avisa a los demás, cierra todo y libera micro/cámara. */
    colgar(motivo = "Has salido de la llamada."): ResumenLlamada {
        if (this.cerrado) return this.resumen();
        this.resumenFinal = {
            duracionMs: this.inicio ? Date.now() - this.inicio : 0,
            contestada: this.contestada,
            otrosDentro: this.presentes.length,
        };
        const resumen = this.resumenFinal;
        this.enviar({ tipo: "colgar", de: this.miId });
        this.limpiar();
        this.set({ fase: "terminada", motivoFin: motivo });
        return resumen;
    }

    /** Duración, si llegó a haber alguien y cuántos quedaban dentro al salir. */
    resumen(): ResumenLlamada {
        return (
            this.resumenFinal ?? {
                duracionMs: this.inicio ? Date.now() - this.inicio : 0,
                contestada: this.contestada,
                otrosDentro: this.presentes.length,
            }
        );
    }

    /** Aviso amable para la persona (lo pinta la ventana). */
    avisar(texto: string | null) {
        this.set({ aviso: texto });
    }

    private terminar(fase: "llena" | "error", motivo: string) {
        if (this.cerrado) return;
        this.resumenFinal = { duracionMs: 0, contestada: this.contestada, otrosDentro: this.presentes.length };
        this.limpiar();
        this.set({ fase, motivoFin: motivo });
    }

    private limpiar() {
        this.cerrado = true;
        if (this.temporizadorNivel) clearInterval(this.temporizadorNivel);
        if (this.temporizadorStats) clearInterval(this.temporizadorStats);
        this.temporizadorNivel = null;
        this.temporizadorStats = null;
        this.soltarBot();
        for (const id of Array.from(this.vigilantes.keys())) this.pararVigilante(id);
        for (const id of Array.from(this.vozDatos.keys())) this.pararVozDatos(id, "colgada");
        for (const id of Array.from(this.pares.keys())) this.cerrarPar(id);
        for (const id of Array.from(this.analizadores.keys())) this.desconectarAnalizador(id);
        for (const t of [this.pistaAudio, this.pistaCamara, this.pistaPantalla]) {
            try {
                t?.stop();
            } catch {
                /* noop */
            }
        }
        pararStream(this.local);
        try {
            void this.ctxAudio?.close().catch(() => undefined);
        } catch {
            /* noop */
        }
        this.ctxAudio = null;
        if (this.alCambiarDispositivos) {
            try {
                navigator.mediaDevices?.removeEventListener("devicechange", this.alCambiarDispositivos);
            } catch {
                /* noop */
            }
            this.alCambiarDispositivos = null;
        }
        this.oyentesApp.clear();
        for (const c of this.canales.slice()) this.soltarCanal(c);
        this.rutaPar.clear();
        this.presentes = [];
        this.hablante = null;
        this.niveles = {};
    }

    /** ¿Ya colgó / se cerró? */
    get cerrada(): boolean {
        return this.cerrado;
    }
}

const AVISO_RECONEXION = "Reconectando con el servidor de la llamada…";
const AVISO_ENLACE_CAIDO = "El enlace directo con el otro aparato se ha caído. Esperando a que vuelva…";
const MENSAJE_SIN_SERVIDOR = "No se pudo conectar con el servidor de la llamada. Revisa tu conexión y vuelve a intentarlo.";
const MENSAJE_SIN_ENLACE =
    "No hay ningún enlace abierto con otro aparato ni conexión con el servidor de la llamada. " +
    "Vincula un aparato desde «Vincular sin internet» o revisa tu conexión.";
const MENSAJE_ENLACE_RECHAZADO = "El enlace directo con el otro aparato ya no admite esta llamada. Vuelve a vincular el aparato e inténtalo de nuevo.";
