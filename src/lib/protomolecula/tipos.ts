/**
 * Protomolécula · TIPOS del núcleo puro.
 * Contrato: `architecture/protomolecula.md`. Módulo PURO: sin React, sin red, sin `node:*`.
 *
 * Molécula = documento vivo con capas. Átomo = una herramienta del catálogo, citada por id
 * (el catálogo vive en `catalogo-herramientas.ts`; aquí NUNCA se importa). Todo lo que
 * cambia un valor es una `Operacion` con autor y origen, y se puede deshacer.
 */
import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import type { RolSala, TransporteSala } from "@/lib/salas/sala";

/** personal › perfil › grupo › pública. Es el mismo orden que la memoria de los cerebros. */
export type Ambito = AlcanceMemoria;
export const AMBITOS: readonly Ambito[] = ["personal", "perfil", "grupo", "publica"];
/** Roles de sala: la Protomolécula no inventa roles, usa los de `salas/sala.ts`. */
export type Rol = RolSala;
export const ROLES: readonly Rol[] = ["dueno", "editor", "comentarista", "observador"];

export const ORIGENES = ["mano", "ia", "dictado", "midi", "gamepad", "hid", "osc", "sensor", "agente"] as const;
export type Origen = (typeof ORIGENES)[number];

export type Unidad =
  | "" | "%" | "dB" | "Hz" | "kHz" | "s" | "ms" | "bpm" | "grados" | "px" | "m" | "cm" | "x"
  | "semitonos" | "fps" | "K" | "lux";

/** Cómo se dice cada unidad al dictar (ya sin tildes ni mayúsculas). */
export const PALABRAS_UNIDAD: Record<Exclude<Unidad, "">, string[]> = {
  "%": ["%", "por ciento", "porciento", "porcentaje"],
  dB: ["db", "decibelios", "decibelio", "decibeles"],
  Hz: ["hz", "hercios", "hercio", "hertz"],
  kHz: ["khz", "kilohercios", "kilohercio"],
  s: ["s", "seg", "segundos", "segundo"],
  ms: ["ms", "milisegundos", "milisegundo"],
  bpm: ["bpm", "pulsos por minuto"],
  grados: ["grados", "grado", "°"],
  px: ["px", "pixeles", "pixel"],
  m: ["m", "metros", "metro"],
  cm: ["cm", "centimetros", "centimetro"],
  x: ["x", "veces"],
  semitonos: ["semitonos", "semitono"],
  fps: ["fps", "fotogramas por segundo"],
  K: ["k", "kelvin"],
  lux: ["lux"],
};

export type ValorParametro = number | boolean | string;
export type TipoParametro = "numero" | "entero" | "booleano" | "opcion" | "disparo";

/** Esquema de UN parámetro que una herramienta expone. Lo mueve la mano, la IA, un mando… */
export interface Parametro {
  /** Estable dentro de la herramienta: «reverb.mezcla». */
  id: string;
  nombre: string;
  /** Otras formas de nombrarlo al dictar («reverb», «eco de sala»). */
  sinonimos?: string[];
  tipo: TipoParametro;
  min?: number;
  max?: number;
  /** Paso de la interfaz y de las órdenes «N pasos». NO se usa para redondear un valor exacto. */
  paso?: number;
  unidad?: Unidad;
  opciones?: string[];
  defecto?: ValorParametro;
}

/** Un parámetro concreto de un átomo concreto (dos instancias de la misma herramienta no se pisan). */
export interface ParametroRef {
  atomoId: string;
  parametroId: string;
}
/** Parámetro + dónde está: lo que el dictado y los vínculos reciben para resolver nombres. */
export interface CandidatoParametro {
  ref: ParametroRef;
  parametro: Parametro;
  /** Nombre legible del átomo («Reverb de la voz»), para desambiguar. */
  atomo?: string;
}

export type ModoRelativo = "delta" | "porcentaje-valor" | "porcentaje-rango" | "pasos";
export type Accion =
  | { tipo: "exacta"; valor: ValorParametro }
  | { tipo: "relativa"; cantidad: number; modo: ModoRelativo }
  | { tipo: "alternar" }
  | { tipo: "disparo" };

export interface Autor {
  tipo: "persona" | "agente" | "sistema";
  id: string;
  nombre?: string;
}

/** Todo cambio es esto: reversible, con autor y con el medio por el que llegó. */
export interface Operacion {
  id: string;
  objetivo: ParametroRef;
  accion: Accion;
  autor: Autor;
  origen: Origen;
  /** Marca de tiempo (ms) en el reloj común de la sesión. */
  t: number;
  /** Fuente concreta si viene de un sensor o un mando («wearable:pulso», «midi:cc7»). */
  fuente?: string;
  /** Frase original si vino por dictado o por un agente (auditoría). */
  texto?: string;
}

/** Valores vivos de una molécula, por `atomoId::parametroId`. */
export type EstadoValores = Record<string, ValorParametro>;

export interface Cambio {
  operacion: Operacion;
  antes: ValorParametro;
  despues: ValorParametro;
  /** El valor pedido se salía del rango y se dejó en el límite. */
  acotado: boolean;
  /** Un disparo no se deshace. */
  reversible: boolean;
  nota?: string;
}

/** Referencia a una Entidad Única: la molécula cita, nunca copia. */
export interface ReferenciaEntidad {
  tipo: string;
  id: string;
  version?: string;
}

export type TipoCapa = "escena3d" | "linea-tiempo" | "grafo-audio" | "lienzo2d" | "codigo" | "datos";
export interface Capa {
  id: string;
  tipo: TipoCapa;
  titulo: string;
  /** glTF/USD, OpenTimelineIO, grafo de audio, SVG/PNG, lenguaje del código, JSON/CSV… */
  formato: string;
  referencia: ReferenciaEntidad | null;
  orden: number;
  visible: boolean;
  bloqueada: boolean;
}

/** Dónde corre un átomo; lo decide la neurona según recursos y permisos. */
export type Computo = "navegador" | "app-nativa" | "neurona-nas" | "neurona-procesador" | "oracle-a1" | "nube";

export interface AtomoEnUso {
  id: string;
  herramientaId: string;
  capaId?: string;
  titulo?: string;
  ejecutaEn?: Computo;
  estado: "activo" | "suspendido";
}

export interface Molecula {
  id: string;
  titulo: string;
  ambito: Ambito;
  capas: Capa[];
  atomos: AtomoEnUso[];
  valores: EstadoValores;
  /** Sube con cada fusión; el desempate lo hace `salas/sincronia-sala.ts`. */
  version: number;
  creadaEn: number;
  actualizadaEn: number;
}

/** Salud de un wearable: solo local por defecto, consentimiento por métrica. */
export const METRICAS_SALUD = [
  "pulso", "variabilidad-cardiaca", "oxigeno", "temperatura", "respiracion", "sueno", "estres", "ecg", "pasos",
] as const;
export type MetricaSalud = (typeof METRICAS_SALUD)[number];

export interface Consentimiento {
  metrica: MetricaSalud;
  /** Hasta qué ámbito puede viajar esa métrica. «publica» exige además `expreso`. */
  ambitoMax: Ambito;
  expreso?: boolean;
  concedidoPor: string;
  concedidoEn: number;
  caducaEn?: number;
}

export interface Sesion {
  id: string;
  moleculaId: string;
  ambito: Ambito;
  anfitrion: string;
  miembros: Record<string, Rol>;
  /** Malla P2P primero: el transporte lo elige `salas/sala.ts#elegirTransporte`. */
  transporte: TransporteSala;
  grupoId?: string;
  consentimientos: Consentimiento[];
  creadaEn: number;
}

export const esOrigen = (x: unknown): x is Origen => ORIGENES.includes(x as Origen);
export const esAmbito = (x: unknown): x is Ambito => AMBITOS.includes(x as Ambito);
export const esMetricaSalud = (x: unknown): x is MetricaSalud => METRICAS_SALUD.includes(x as MetricaSalud);

// Re-export types from registro-atomos to satisfy dependencies on '@/lib/protomolecula/tipos'
export type { DefinicionAtomo } from "./registro-atomos";
export type { VistaProps } from "./registro-atomos";
