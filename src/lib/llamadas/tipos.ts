/**
 * Llamadas en tiempo real (2026-09-28) — tipos internos del módulo.
 *
 * El contrato público (TipoLlamada, AdjuntoLlamada, SesionViva) vive en
 * `@/lib/mensajeria/formato-tipos`. Aquí solo lo que necesitan la señalización, el motor
 * WebRTC y la interfaz. Módulo de tipos puro: sin red, sin DOM.
 */
import type { AdjuntoLlamada, TipoLlamada } from "@/lib/mensajeria/formato-tipos";
import type { Carril, Flujo } from "@/lib/llamadas/carriles";

/** Máximo de personas en una llamada de malla completa (cada una envía a las demás). */
export const MAX_PARTICIPANTES = 8;

/** Lo que cada participante publica en la presencia del canal privado de la llamada (`temas.ts`). */
export interface MetaPresencia {
    /** Clave de presencia: `<uid|inv-xxxx>:<pestaña>`. Es también el id del par WebRTC. */
    id: string;
    /** Usuario del OS; null si es un invitado con enlace público. */
    uid: string | null;
    nombre: string;
    avatar: string | null;
    invitado: boolean;
    micro: boolean;
    camara: boolean;
    pantalla: boolean;
    /** Epoch ms en que entró (ordena quién tiene plaza si se llena). */
    unido: number;
}

/** Participante tal y como lo ve la interfaz (presencia + medios + conexión). */
export interface ParticipanteLlamada extends MetaPresencia {
    yo: boolean;
    stream: MediaStream | null;
    /** VID1110A: el canvas donde se pinta el vídeo ligero que llega por el enlace de datos (la superficie lo monta tal cual). */
    lienzo?: HTMLCanvasElement | null;
    conexion: EstadoConexionPar;
    calidad: CalidadConexion;
    /** Nivel de voz suavizado, 0..1. */
    nivel: number;
}

export type EstadoConexionPar = "conectando" | "conectado" | "reconectando" | "fallida";

export type CalidadConexion = "buena" | "regular" | "mala" | "desconocida";

/** Señales que viajan por broadcast (todas dirigidas: cada cual filtra `para`). */
export type SenalLlamada =
    /** SDP y/o candidatos ICE (en lote: menos mensajes por el canal). */
    | { tipo: "senal"; de: string; para: string; desc?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit[] }
    | { tipo: "colgar"; de: string }
    | { tipo: "rechazo"; de: string; uid: string | null; nombre: string }
    /**
     * «La sesión cambió de canal» (se creó o revocó el enlace público a mitad de llamada). No
     * lleva el tema ni el token: quien lo recibe vuelve a preguntar al servidor qué le toca.
     */
    | { tipo: "mudanza"; de: string }
    /**
     * (LLA1108E) «No hay audio»: ni WebRTC ni la voz por el enlace de datos conectaron a tiempo. Quien lo detecta
     * lo dice, y los dos extremos acaban con el mismo motivo (nadie se queda en «conectando»).
     */
    | { tipo: "fallo"; de: string; motivo: string }
    /**
     * TEXTO de lo que alguien dijo (contrato `voz-fusionada-astraura.md` §5: se comparte la
     * transcripción, nunca el audio). Va por difusión: el bot de la llamada lo lee.
     */
    | { tipo: "texto"; de: string; texto: string; en: number }
    /**
     * (LLA1108G) Mensaje de aplicación de la superficie de llamada: cambio de tipo, aviso de grabación, respuesta de
     * Astraura, chat, reacciones, espera, fin para todos. Van por difusión; cada uno lleva `k` (ver `superficie/senales-app.ts`).
     */
    | { tipo: "app"; de: string; carga: CargaApp };

/** (LLA1108G) Carga de una señal de aplicación: un objeto JSON pequeño con su clase en `k`. */
export type CargaApp = { k: string } & Record<string, unknown>;

export type FaseLlamada =
    | "inactiva"
    | "preparando"   // pidiendo micro/cámara
    | "conectando"   // entrando en el canal
    | "esperando"    // dentro, sin nadie más todavía
    | "en-curso"
    | "llena"        // ya hay MAX_PARTICIPANTES
    | "terminada"
    | "error";

export interface DispositivosMedios {
    microfonos: { id: string; nombre: string }[];
    camaras: { id: string; nombre: string }[];
    altavoces: { id: string; nombre: string }[];
}

export interface SeleccionDispositivos {
    microId: string | null;
    camaraId: string | null;
    altavozId: string | null;
}

export interface EstadoLlamada {
    fase: FaseLlamada;
    /** Yo primero; el resto por orden de llegada. */
    participantes: ParticipanteLlamada[];
    hablante: string | null;
    /** Epoch ms en que llegó la primera persona además de mí (inicio del cronómetro). */
    inicio: number | null;
    micro: boolean;
    camara: boolean;
    pantalla: boolean;
    dispositivos: DispositivosMedios;
    seleccion: SeleccionDispositivos;
    /** Aviso amable para la persona (sin micro, red difícil…). */
    aviso: string | null;
    /** Por qué terminó (si terminó). */
    motivoFin: string | null;
    /** ¿Llegó a haber alguien más en la llamada? */
    contestada: boolean;
    /** Personas que rechazaron el timbre (uid o nombre), para avisar en 1:1. */
    rechazos: { uid: string | null; nombre: string }[];
    /** (LLA1108E) Por dónde va la voz ahora y cómo va (null: aún no hay audio). */
    medio?: MedioVoz | null;
    /** (LLA1108E) «Contestada · conectando audio…» mientras alguien contestó y el audio aún no suena. */
    estadoAudio?: string | null;
    /** (LLA1108E) La llamada acabó por falta de audio: se ofrece «Reintentar». */
    puedeReintentar?: boolean;
    /** (LLA1108E) Motivo por el que el vídeo no va por este medio (Bluetooth), con la oferta de seguir solo con voz. */
    videoNoDisponible?: string | null;
    /** (LLA1108H) Vídeo ligero por el enlace de datos (baja resolución, sin router). Null: no hay sesión de vídeo de datos. */
    videoDatos?: VideoDatosVista | null;
    /** (LLA1108H) Los pasos de la escalada al Wi-Fi directo («Abriendo Wi-Fi directo…», «Video por Wi-Fi directo (sin router)»). */
    escalada?: EscaladaVista | null;
    /** (LLA1110D) Carril de cada flujo con cada par («Voz: Bluetooth · Vídeo: WebRTC»). Ver `MotorLlamada.carriles()`. */
    carriles?: CarrilesParVista[];
}

/** (LLA1110D) Carriles de un par para la superficie. `texto` ya viene listo para enseñar. */
export interface CarrilesParVista {
    parId: string;
    voz: Carril | null;
    video: Carril | null;
    pantalla: Carril | null;
    senal: Carril | null;
    /** El carril del enlace de datos con ese par ahora (aunque no lleve nada). */
    datos: Carril | null;
    /** Lo que la persona forzó, por flujo. */
    forzados: Partial<Record<Flujo, Carril>>;
    texto: string;
    /** ¿Decide este extremo cuando los dos discrepan? (el descortés de la negociación). */
    director: boolean;
}

/** (LLA1108H) El vídeo ligero por enlace de datos, dicho para la superficie. */
export interface VideoDatosVista {
    /** Este aparato puede llevar vídeo ligero por el enlace de datos (hay códec). */
    disponible: boolean;
    enviando: boolean;
    recibiendo: boolean;
    /** «160×120 · 4 fps · 40 kbps · VP8». */
    calidadTexto: string | null;
    nivel: "buena" | "regular" | "mala" | null;
}

/** (LLA1108H) Estado de la escalada al Wi-Fi directo para la superficie. */
export interface EscaladaVista {
    paso: "inactivo" | "abriendo" | "propuesta" | "activo" | "no" | "sin-p2p";
    /** La línea de estado (null: nada que contar). */
    texto: string | null;
    /** Aviso (en el Mac: sale de tu Wi-Fi de casa mientras dure). */
    aviso: string | null;
}

/** (LLA1108E) El medio que lleva la voz, dicho para la superficie de la llamada. */
export interface MedioVoz {
    tipo: "webrtc" | "enlace-datos";
    /** «Voz por Bluetooth directo · cifrada». */
    texto: string;
    cifrada: boolean;
    /** «latencia 180 ms · pérdida 2 % · ADPCM» (solo en enlace de datos). */
    calidadTexto?: string;
    nivel?: "buena" | "regular" | "mala";
}

/**
 * Adjunto de llamada con los campos de registro que añade el creador. Son opcionales y viajan
 * en el mismo JSON del adjunto (compatibles con `AdjuntoLlamada`, que no los conoce).
 */
export interface AdjuntoLlamadaRegistro extends AdjuntoLlamada {
    /** ISO: cuándo empezó a sonar. */
    iniciada?: string;
    /** ISO: cuándo colgó el creador (si hay `fin`, la tarjeta ya no escucha la presencia). */
    fin?: string;
    duracionMs?: number;
    contestada?: boolean;
}

export type EstadoTarjeta = "sonando" | "en-curso" | "terminada" | "perdida" | "sin-respuesta" | "finalizada";

export type { TipoLlamada };
