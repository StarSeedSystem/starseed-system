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
import type { ControlId } from "./matriz-controles";
import type { MensajeChatVista, ReaccionVista } from "./senales-app";
import type { DispositivosMedios, SeleccionDispositivos } from "@/lib/llamadas/tipos";

export interface ParticipanteVista {
  id: string;
  nombre: string;
  yo?: boolean;
  stream?: MediaStream | null;
  /** VID1110A: canvas del vídeo ligero por enlace de datos (se monta tal cual; sin MediaStream). */
  lienzo?: HTMLCanvasElement | null;
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
  /** (LLA1108G) Aviso pasajero (un error del aparato, el resultado de invitar…). */
  aviso?: string | null;
  local: MediaStream | null;
  remoto: MediaStream | null;
  /** VID1110A: canvas del vídeo ligero del foco (si lo hay, se pinta en lugar de `remoto`). */
  remotoLienzo?: HTMLCanvasElement | null;
  micro: boolean;
  camara: boolean;
  compartiendoPantalla: boolean;
  /** Hay más de una cámara (para mostrar «girar»). */
  camaras?: number;
  /** VID1110A: cámaras, micros y altavoces que ve el aparato y los elegidos; la pista de mi cámara para sus opciones. */
  dispositivos?: DispositivosMedios;
  seleccion?: SeleccionDispositivos;
  pistaCamara?: MediaStreamTrack | null;
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
  /** (LLA1108G) Por qué cada control está desactivado (la matriz de controles); lo que no aparece, funciona. */
  motivos?: Partial<Record<ControlId, string>>;
  /** (LLA1108G) Chat de la llamada y reacciones recientes (las ven todos). */
  chat?: MensajeChatVista[];
  reacciones?: ReaccionVista[];
  /** (LLA1108G) Frase corta de transición («Pasando a red local…», «Cambiando a vídeo…»); null si no hay. */
  chip?: string | null;
  /** (LLA1108G) Quien ha puesto la llamada en espera desde el otro lado. */
  esperaRemota?: string | null;
  /** (LLA1108G) Soy quien empezó la llamada y hay más de dos: puedo terminarla para todos. */
  puedeTerminarParaTodos?: boolean;
  /** (LLA1108G) Hay vídeo remoto (para imagen en imagen). */
  salidaAudioElegida?: string | null;
  /** (LLA1108G) Tope de personas de la llamada (8 con el motor de malla completa). */
  topeInvitar?: number;
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
  /** (LLA1108G) Chat y reacciones de la llamada. */
  enviarChat?: (texto: string) => void;
  reaccionar?: (emoji: string) => void;
  /** (LLA1108G) Terminar la llamada para todos (grupo, quien la empezó). `colgar` solo sale uno. */
  colgarTodos?: () => void;
  /** (LLA1108G) Abre el diálogo de invitar con enlace de la llamada (para quien no está en ningún chat). */
  invitarConEnlace?: () => void;
  /** (LLA1108G) Elige la salida de audio (ruta nativa o `setSinkId`). */
  elegirSalidaAudio?: (id: string) => void;
  /** VID1110A: elige la cámara o el micrófono (se recuerdan en esta neurona) sin cortar la llamada. */
  elegirCamara?: (id: string) => void;
  elegirMicro?: (id: string) => void;
  actualizarDispositivos?: () => void;
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
