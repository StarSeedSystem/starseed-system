/**
 * Llamadas en tiempo real (2026-09-28) — tipos internos del módulo.
 *
 * El contrato público (TipoLlamada, AdjuntoLlamada, SesionViva) vive en
 * `@/lib/mensajeria/formato-tipos`. Aquí solo lo que necesitan la señalización, el motor
 * WebRTC y la interfaz. Módulo de tipos puro: sin red, sin DOM.
 */
import type { AdjuntoLlamada, TipoLlamada } from "@/lib/mensajeria/formato-tipos";

/** Máximo de personas en una llamada de malla completa (cada una envía a las demás). */
export const MAX_PARTICIPANTES = 8;

/** Lo que cada participante publica en la presencia del canal `llamada:<sesionId>`. */
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
    | { tipo: "rechazo"; de: string; uid: string | null; nombre: string };

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
