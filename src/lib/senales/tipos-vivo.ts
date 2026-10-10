/**
 * tipos-vivo — el CONTRATO de lo que el Mapa 3D de señales reales añade a la lista de
 * `DetectedSignal` (2026-10-10): aparatos con su estado en vivo, medios abiertos, el ENLACE real
 * entre aparatos, cuentas, fichas con la fuente de cada valor y anillos de alcance honestos.
 *
 * Solo tipos y tablas de texto. El cálculo vive en `escalas.ts`, `cuentas.ts`, `enlaces.ts`,
 * `aparatos.ts` y `fichas.ts` (puros: sin React, sin red, sin `node:*`); el dibujo en
 * `src/components/mesh/mapa-senales/`.
 *
 * Regla del mapa: CADA elemento y CADA valor sale de algo medido y dice de dónde. Lo que no se
 * pudo medir se llama «no medido» y se explica; nunca se rellena con un número bonito.
 */

import type { AntennaKind, DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { MeshLinkStatus, MeshTransportKind } from "@/ai/astraura/mesh/types";
import type { ClaseRuta, RutaEnlace } from "@/lib/network/estadisticas-enlace";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import type { FotoEnlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import type { TipoMedio } from "@/lib/neurons/medio";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";

/* ── Cuentas ────────────────────────────────────────────────────────────────── */

/** A quién pertenece lo que se dibuja. `ninguna` = no declara cuenta StarSeed (BLE, Wi-Fi, LoRa ajeno…). */
export type Cuenta = "propia" | "otra" | "ninguna";
export type FiltroCuenta = "todas" | Cuenta;

export const FILTROS_CUENTA: readonly FiltroCuenta[] = ["todas", "propia", "otra", "ninguna"];

export const ETIQUETA_CUENTA: Record<FiltroCuenta, string> = {
  todas: "Todas",
  propia: "Mi cuenta",
  otra: "Otras cuentas",
  ninguna: "Sin cuenta StarSeed",
};

/* ── Ficha: cada valor con su fuente ────────────────────────────────────────── */

/**
 * medido    — lo midió un instrumento (SNR del chip LoRa, RTT del canal, bytes de getStats…).
 * declarado — lo dice el propio aparato o nodo de sí mismo (modelo, plataforma, versión…).
 * estimado  — se calculó con un modelo (distancia por RF) y se marca como tal.
 * no-medido — no hay dato; la nota dice por qué.
 */
export type EstadoDato = "medido" | "declarado" | "estimado" | "no-medido";

export interface Dato {
  etiqueta: string;
  valor: string;
  /** De dónde sale, en una frase que entienda una persona. */
  fuente: string;
  estado: EstadoDato;
  /** Aclaración (por qué no se midió, qué error tiene el modelo…). */
  nota?: string;
}

export interface SeccionFicha {
  id: string;
  titulo: string;
  datos: Dato[];
}

export interface FichaMapa {
  titulo: string;
  subtitulo: string;
  /** Una frase que resume qué es y qué hay que saber. */
  resumen: string;
  secciones: SeccionFicha[];
}

/* ── Enlaces ────────────────────────────────────────────────────────────────── */

/**
 * Cómo llega de verdad un elemento hasta ti (según lo medido):
 *   p2p-red-local         — canal WebRTC directo, ambos en la misma red local
 *   p2p-internet          — canal WebRTC directo atravesando NAT por internet
 *   p2p-turn              — canal WebRTC reenviado por un servidor TURN
 *   p2p                   — canal WebRTC abierto, ruta aún sin medir
 *   directo-sin-internet  — enlace emparejado sin internet (código/QR) abierto ahora
 *   rele                  — sin canal P2P, pero hay faro suyo en el relé cifrado de la cuenta
 *   rf-lora               — nodo LoRa que el radio de esta neurona oye de verdad
 *   sin-enlace            — no hay camino medido (se dice el motivo)
 */
export type ClaseEnlace =
  | "p2p-red-local"
  | "p2p-internet"
  | "p2p-turn"
  | "p2p"
  | "directo-sin-internet"
  | "rele"
  | "rf-lora"
  | "sin-enlace";

export interface EnlaceMapa {
  clase: ClaseEnlace;
  /** Texto corto para leyenda y ficha («P2P · misma red local»). */
  etiqueta: string;
  /** Latencia medida (ms); null si el canal no la ha medido. */
  latenciaMs: number | null;
  /** Por qué no hay enlace (o qué le falta). */
  motivo?: string;
  /** Detalle medido que acompaña (p. ej. «SNR −7,5 dB · RSSI −98 dBm» en un enlace LoRa). */
  detalle?: string;
  ruta?: RutaEnlace | null;
  /** Clase de ruta medida de un enlace directo sin internet (el canal solo la da así). */
  claseRuta?: ClaseRuta | null;
}

/* ── Aparatos y medios ──────────────────────────────────────────────────────── */

/** Estado en vivo de un aparato: la presencia manda; sin ella solo hay latido. */
export type EstadoAparato = "activa" | "segundo-plano" | "en-linea" | "desconectada";

/** Un medio abierto (una forma de abrir el OS) que orbita a su aparato. */
export interface MedioMapa {
  /** `medio:<id del medio>`. */
  id: string;
  /** Id del medio. */
  m: string;
  neuronaId: string;
  /** Id del elemento al que orbita: el id de la señal del aparato (`neuron:<id>`) o `yo`. */
  padreId: string;
  etiqueta: string;
  tipo: TipoMedio;
  /** La pestaña o la app está a la vista (false = en segundo plano). */
  visible: boolean;
  /** true = es un medio de ESTE aparato (órbita alrededor de «Tú»). */
  propio: boolean;
  /** Desde cuándo está abierto (ISO). */
  desde: string;
  /** Es el medio cuyo id de sincronización es el del canal P2P conectado con su aparato. */
  enlazado?: boolean;
  ficha: FichaMapa;
}

/** Lo que el hook reúne de las fuentes en vivo para clasificar enlaces y medios. */
export interface ContextoVivo {
  /** `useMallaNeuronasEstado().misDispositivos`. */
  filas: readonly DispositivoMallaRow[];
  /** `usePresenciaNeuronas()`. */
  presencia: { conectado: boolean; medios: readonly PresenciaMedio[] };
  /** `useEnlacesLocales()`: aparatos emparejados SIN internet abiertos ahora. */
  locales: readonly FotoEnlaceLocal[];
  /** Id de ESTE medio (`idMedio()`), para separar «Tú» de los otros aparatos. */
  miMedioId: string | null;
  /** Cuenta actual (para saber si un enlace directo declara ser tuyo); null si no se sabe. */
  miUid: string | null;
  ahora: number;
}

export interface VivoMapa {
  /** Enlace real por id de señal de aparato (`neuron:<id>` y `local:<id>`). */
  enlaces: ReadonlyMap<string, EnlaceMapa>;
  /** Estado en vivo por id de señal de aparato. */
  estados: ReadonlyMap<string, EstadoAparato>;
  /** Medios abiertos (de los otros aparatos y de ESTE). */
  medios: readonly MedioMapa[];
  /**
   * Enlaces directos sin internet que NO son un aparato del registro de la cuenta: se añaden
   * a la lista de señales como familia «account» (`id: local:<id>`, `starseed.via: "direct-link"`).
   */
  extras: readonly DetectedSignal[];
  /** Cuántas señales oye cada aparato (radar compartido por la malla), por id de señal de aparato. */
  oidas: ReadonlyMap<string, number>;
  /** La presencia en vivo está suscrita (la lista de medios es de verdad en vivo). */
  presenciaConectada: boolean;
}

/** Lo que se sabe de «Tú» (este aparato y este medio). */
export interface EntradaYo {
  neuronaId: string | null;
  nombre: string;
  plataforma?: string;
  /** Este medio: desde dónde se abre el OS ahora. */
  medio: { id: string; tipo: TipoMedio; etiqueta: string } | null;
  /** Antenas de este medio, medidas ahora (`medirSenales`). */
  senales: SenalesMedio | null;
  radio: {
    estado: MeshLinkStatus | "sin-radio";
    transporte: MeshTransportKind | null;
    nodos: number;
    region: string | null;
    /** El radio local conoce su propia posición GPS. */
    gps: boolean;
    simulador: boolean;
  };
}

/* ── Anillos de alcance ─────────────────────────────────────────────────────── */

/** largo = LoRa (30 m–6 km); corto = Bluetooth y Wi-Fi (1–200 m). */
export type EscalaId = "largo" | "corto";

/**
 * Un anillo de distancia. SOLO existe donde la distancia existe:
 *   · `real: true`  — algún elemento se colocó con GPS de ambos extremos → círculo completo;
 *   · `real: false` — solo distancia ESTIMADA por RF → arco limitado al sector de su familia.
 */
export interface AnilloAlcance {
  id: string;
  escala: EscalaId;
  metros: number;
  /** «100 m», «1 km»; las estimadas llevan «≈». */
  etiqueta: string;
  /** Radio como fracción del radio del mapa (0..1). */
  fraccion: number;
  real: boolean;
  /** Familia cuyo sector acota el arco (null = círculo completo). */
  familia: AntennaKind | null;
  desdeRad: number | null;
  hastaRad: number | null;
}
