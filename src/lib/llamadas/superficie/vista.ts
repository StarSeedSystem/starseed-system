/**
 * Contrato entre un motor de llamadas y la superficie (LLA1108C). La superficie NO conoce los motores:
 * recibe una `VistaLlamada` (lo que se ve) y unas `AccionesLlamada` (lo que se puede hacer). Cada acción
 * ausente deja su botón desactivado y explica por qué (no hay botones que no hagan nada).
 */
import type { EstadoSuperficie, FinSuperficie, TipoSuperficie } from "./maquina";
import type { ResumenCalidad } from "./calidad-llamada";
import type { EstadoGrabacion, DestinoGrabacion } from "./grabacion";
import type { EstadoAstraura } from "./astraura-llamada";
import type { MedioLlamada, OpcionMedio } from "./selector-medio";
import type { Invitable } from "./grupo-invitar";

export interface ParticipanteVista {
  id: string;
  nombre: string;
  yo?: boolean;
  stream?: MediaStream | null;
  micro: boolean;
  camara: boolean;
  /** 0..1 */
  volumen: number;
  nivel?: number;
}

export interface VistaLlamada {
  estado: EstadoSuperficie;
  tipo: TipoSuperficie;
  nombre: string;
  /** Mi identificador en la llamada (para el indicador de grabación). */
  yo: string;
  desde: number | null;
  /** Al terminar. */
  fin?: FinSuperficie | null;
  duracionMs?: number | null;
  medioUsado?: string | null;
  motivo?: string | null;
  local: MediaStream | null;
  remoto: MediaStream | null;
  micro: boolean;
  camara: boolean;
  compartiendoPantalla: boolean;
  /** Hay más de una cámara (para mostrar «girar»). */
  camaras?: number;
  participantes?: ParticipanteVista[];
  /** Transmisión en vivo. */
  espectadores?: number | null;
  relevo?: string | null;
  calidad?: ResumenCalidad | null;
  medioElegido?: MedioLlamada;
  opcionesMedio?: OpcionMedio[];
  textoMedio?: string | null;
  grabacion?: EstadoGrabacion;
  astraura?: EstadoAstraura;
  /** Reconocedor de voz disponible para la transcripción. */
  reconocedor?: "local" | "navegador" | "ninguno";
  transcripcionActiva?: boolean;
  archivos?: string[];
  invitables?: Invitable[];
  /** Tipo al que se está cambiando (renegociando) ahora. */
  cambiandoA?: TipoSuperficie | null;
}

export interface AccionesLlamada {
  contestar?: () => void | Promise<void>;
  rechazar?: () => void;
  colgar?: () => void;
  alternarMicro?: () => void;
  alternarCamara?: () => void;
  girarCamara?: () => void;
  alternarPantalla?: () => void;
  /** Poner en espera / reanudar. */
  alternarEspera?: () => void;
  cambiarTipo?: (a: TipoSuperficie) => void | Promise<void>;
  invitar?: (quien: Invitable[]) => void | Promise<void>;
  elegirMedio?: (m: MedioLlamada) => void | Promise<void>;
  iniciarGrabacion?: () => void | Promise<void>;
  pararGrabacion?: () => void | Promise<void>;
  destinoGrabacion?: (d: DestinoGrabacion) => void | Promise<void>;
  alternarAstraura?: () => void;
  alternarHablarAstraura?: () => void;
  alternarTranscripcion?: () => void;
  preguntarAstraura?: (pregunta: string) => void | Promise<void>;
  volumenParticipante?: (id: string, v: number) => void;
  silenciarParticipante?: (id: string) => void;
  /** Cierra el resumen de la llamada terminada. */
  descartar?: () => void;
}

/** Información nativa OPCIONAL (Android: rutas de audio, proximidad). LLA1108D o el integrador la conectan. */
export interface InfoNativaLlamada {
  rutasAudio: Array<{ id: string; etiqueta: string }>;
  rutaActiva: string | null;
  elegirRuta?: (id: string) => void;
  /** Sensor de proximidad: el aparato está pegado a la oreja (la pantalla debería apagarse). */
  cercaDeLaOreja: boolean;
}

export const INFO_NATIVA_VACIA: InfoNativaLlamada = { rutasAudio: [], rutaActiva: null, cercaDeLaOreja: false };
