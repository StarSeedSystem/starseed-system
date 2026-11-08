/**
 * conectores/tipos — contrato `ConectorMedio` (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Capa 1 de `architecture/red-sin-dependencias.md` §4: cada medio por el que viaja un dato (red local
 * nativa, WebRTC local, Bluetooth, Wi‑Fi directo, cuenta, relé, LoRa y el hardware o firmware que
 * venga: Meshtastic por serie nativo, RNode/Reticulum, routers OpenWrt, nodos base) se enchufa con
 * este contrato, sin tocar los sistemas de arriba. NO confundir con `src/lib/mensajeria/medios/`
 * (los medios de un chat): esto son los medios de la RED.
 *
 * Módulo de tipos puros (sin red, sin DOM): lo importan el registro, los adaptadores, el
 * planificador de vías y el «Mapa de vías».
 */

import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";

/** Qué tan escaso es el aire (o el canal) de un medio. */
export type TiempoAire = "escaso" | "normal" | "libre";
/** Gasto de energía del aparato al usar el medio. */
export type Energia = "baja" | "media" | "alta";
/** Quién paga el uso: nadie, el plan de datos de la persona o un servidor. */
export type Coste = "gratis" | "datos" | "servidor";
/** Quién puede ver el tráfico en claro: solo vecinos, solo la cuenta, o un servidor intermedio. */
export type Privacidad = "local" | "cuenta" | "servidor";
/** Estado del cifrado de punta a punta (CIF1108A) o «propio» si el medio ya cifra (WebRTC). */
export type CifradoFicha = "cifrado" | "pendiente" | "sin-cifrar" | "propio" | "no-dice";

/**
 * Ficha de capacidades de un medio. Las cifras medidas (`ancho`, `latencia`) salen del enlace vivo;
 * las de diseño (MTU, alcance, energía…) son del tipo de medio y se marcan en `medida`.
 */
export interface FichaCapacidades {
  /** kbps; null = sin medir (nada se inventa). */
  anchoKbps: number | null;
  /** ms de ida y vuelta; null = sin medir. */
  latenciaMs: number | null;
  /** Tamaño máximo de un envío (bytes); null = sin tope propio. */
  mtu: number | null;
  /** Alcance típico en metros; null = sin límite práctico (internet). */
  alcanceM: number | null;
  energia: Energia;
  tiempoAire: TiempoAire;
  coste: Coste;
  privacidad: Privacidad;
  /** ¿Lleva audio, vídeo, pantalla y transmisiones en vivo? */
  llevaFlujos: boolean;
  cifrado: CifradoFicha;
  /** Permisos que pide al aparato (p. ej. «bluetooth», «red-local»). */
  permisos: string[];
  /** true si ancho o latencia vienen de una medida real del enlace. */
  medida: boolean;
}

/** Cómo se llama el tipo de un conector: los siete de hoy más lo que se enchufe después. */
export type TipoConector = EnlaceDisponible["tipo"] | (string & {});

/** Un medio enchufable. Todas las operaciones son seguras: nunca lanzan hacia arriba. */
export interface ConectorMedio {
  /** Id estable del conector (p. ej. «ble», «meshtastic-serie»). */
  id: string;
  tipo: TipoConector;
  etiqueta: string;
  /** Enlaces vivos de este medio ahora mismo (lee los registros que ya existen). */
  descubrir(): Promise<EnlaceDisponible[]>;
  /** Abre (o prepara) un enlace con ese destino; false si no se pudo. */
  enlazar(destino: string): Promise<boolean>;
  /** Envía por un enlace concreto; false si el medio no puede o el enlace no está. */
  enviar(enlaceId: string, datos: string | ArrayBuffer): Promise<boolean>;
  /** Escucha lo que llega por este medio; devuelve la función que deja de escuchar. */
  alRecibir(cb: (enlaceId: string, datos: string | ArrayBuffer) => void): () => void;
  /** Cierra un enlace (o todos si no se da id). */
  cerrar(enlaceId?: string): void;
  /** Ficha de capacidades; con el enlace vivo, mezcla lo medido. */
  ficha(enlace?: EnlaceDisponible): FichaCapacidades;
}

/** Foto para la interfaz y el planificador: un enlace vivo con la ficha de su conector. */
export interface ViaViva {
  conectorId: string;
  enlace: EnlaceDisponible;
  ficha: FichaCapacidades;
}

/** Tipos de dato que el planificador sabe encaminar. */
export type TipoDato =
  | "mensaje"
  | "archivo"
  | "flujo-audio"
  | "flujo-video"
  | "pantalla"
  | "control"
  | "aviso"
  | "voto"
  | "publicacion";

export type Urgencia = "baja" | "normal" | "alta";
export type PrivacidadDato = "interno" | "privado" | "publico";
