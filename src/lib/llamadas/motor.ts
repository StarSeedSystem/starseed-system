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
 *  · hablante activo (AnalyserNode + histéresis) y calidad por par (getStats cada 4 s).
 *
 * Imperativo y sin React: la interfaz se suscribe con `suscribir()` y lee `estado()` (una foto
 * inmutable que solo cambia cuando algo cambia, apta para useSyncExternalStore).
 * Nunca lanza hacia fuera: cualquier fallo del navegador se convierte en un aviso.
 */
import { abrirCanalLlamada, type ConexionCanal } from "@/lib/llamadas/senalizacion";
import { MENSAJE_CANAL_PRIVADO } from "@/lib/llamadas/temas";
import { admision, evaluarDescripcion, reaccionIce, soyCortes } from "@/lib/llamadas/negociacion";
import { elegirHablante, nivelRms, suavizarNivel, type HablanteVigente } from "@/lib/llamadas/hablante";
import { calidadDesde, extraerMetricas, peorCalidad, perdidaEntre, type MetricasPar } from "@/lib/llamadas/calidad";
import { listarDispositivos, obtenerMedios, obtenerPantalla, obtenerPista, pararStream } from "@/lib/llamadas/medios";
import { AVISO_SIN_TURN, contieneTurn, servidoresIce } from "@/lib/llamadas/ice";
import { clavePestana, type Identidad } from "@/lib/llamadas/identidad";
import {
    MAX_PARTICIPANTES,
    type CalidadConexion,
    type EstadoConexionPar,
    type EstadoLlamada,
    type MetaPresencia,
    type ParticipanteLlamada,
    type SenalLlamada,
} from "@/lib/llamadas/tipos";

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
    /** Llamadas 1:1: al irse la otra persona, cuelga solo. */
    colgarAlQuedarSolo?: boolean;
    intervaloStatsMs?: number;
    intervaloNivelMs?: number;
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
}

/** Como mucho estos canales a la vez (miembros + enlace público + uno en mudanza). */
const MAX_CANALES = 3;

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
    private hablante: HablanteVigente | null = null;
    private temporizadorNivel: ReturnType<typeof setInterval> | null = null;
    private temporizadorStats: ReturnType<typeof setInterval> | null = null;
    private alCambiarDispositivos: (() => void) | null = null;

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
        for (const par of this.pares.values()) this.ponerEnEmisor(par, "audio", pista);
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
        this.set({ aviso: null });
        this.publicarMeta();
        return null;
    }

    async alternarCamara(): Promise<string | null> {
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
            const r = await obtenerPista("video", this.e.seleccion.camaraId);
            if (!r.pista) return r.error;
            if (this.cerrado) {
                r.pista.stop();
                return null;
            }
            this.pistaCamara = r.pista;
            this.camaraOn = true;
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
        return null;
    }

    async cambiarCamara(id: string): Promise<string | null> {
        this.set({ seleccion: { ...this.e.seleccion, camaraId: id } });
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
        return null;
    }

    cambiarAltavoz(id: string) {
        this.set({ seleccion: { ...this.e.seleccion, altavozId: id } });
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
        const c: CanalMotor = { conn, tema: conn.tema ?? tema ?? `llamada:${this.sesionId}`, presencia: [], bajas: [] };
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
            this.set({ fase, aviso: this.e.aviso === AVISO_RECONEXION ? null : this.e.aviso });
        } else if (!this.canales.some((x) => x.conn.suscrito())) {
            this.set({ aviso: AVISO_RECONEXION });
        }
    }

    /** El servidor no deja entrar en un canal privado. Sin ninguno que valga, se termina y se dice. */
    private alDenegarCanal(c: CanalMotor) {
        if (this.cerrado || !this.canales.includes(c)) return;
        this.soltarCanal(c);
        if (!this.canales.length) {
            this.terminar("error", MENSAJE_CANAL_PRIVADO);
            return;
        }
        this.set({ aviso: "Uno de los canales de esta llamada ya no admite entrar (quizá se revocó el enlace público). Seguís conectados por el otro." });
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
            if (this.canales.length >= MAX_CANALES) this.soltarCanal(this.canales[0]);
            return !!this.abrirCanal(tema);
        })();
        this.revisando = p;
        void p.finally(() => {
            if (this.revisando === p) this.revisando = null;
        });
        return p;
    }

    /** Entra en el canal de la llamada (tras `prepararMedios`). */
    entrar(): boolean {
        if (this.cerrado) return false;
        if (this.canales.length) return true;
        this.unido = Date.now();
        const c = this.abrirCanal(this.opc.tema ?? null);
        if (!c) {
            this.set({ fase: "error", motivoFin: "No se pudo conectar con el servidor de la llamada. Revisa tu conexión y vuelve a intentarlo." });
            return false;
        }
        if (!this.temaActual) this.temaActual = c.tema;
        this.set({ fase: c.conn.suscrito() ? "esperando" : "conectando" });
        this.arrancarTemporizadores();
        return true;
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
        }
        for (const id of Array.from(this.pares.keys())) {
            if (!ids.has(id) && this.vistos.has(id)) this.cerrarPar(id);
        }
        this.revisarCompania();
    }

    private revisarCompania() {
        if (this.presentes.length > 0) {
            if (this.inicio === null) this.inicio = Date.now();
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
        pc.onnegotiationneeded = async () => {
            if (this.pares.get(id) !== par) return;
            try {
                par.haciendoOferta = true;
                await pc.setLocalDescription();
                if (pc.localDescription) this.enviarDescripcion(par, pc.localDescription);
            } catch {
                /* se reintentará en la próxima negociación */
            } finally {
                par.haciendoOferta = false;
            }
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
            if (decision.ignorar) return;
            try {
                par.aplicandoRespuesta = s.desc.type === "answer";
                try {
                    // Soy el cortés si hay colisión: el navegador retira mi oferta solo (rollback
                    // implícito) y acepta la suya.
                    await pc.setRemoteDescription(s.desc);
                } catch (err) {
                    // Navegadores sin rollback implícito: se hace a mano y se reintenta.
                    if (s.desc.type !== "offer" || pc.signalingState !== "have-local-offer") throw err;
                    await pc.setLocalDescription({ type: "rollback" });
                    await pc.setRemoteDescription(s.desc);
                }
            } catch {
                par.aplicandoRespuesta = false;
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
                    aviso: this.conTurn
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
        if (this.cerrado || !this.analizadores.size) return;
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
                stream: par?.stream ?? null,
                conexion: par?.conexion ?? "conectando",
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
