"use client";

/*
 * malla-neuronas — MALLA GLOBAL de neuronas (Ola 366).
 * ---------------------------------------------------------------------------
 * Antes de esto, la detección/auto-vínculo de dispositivos SOLO existía
 * mientras `DeviceNetworkPanel` (`/servidores`) estaba montado, y solo con un
 * botón manual. Este módulo es el MOTOR (sin UI) que:
 *
 *   1. Lee `neuron_devices` (ya heartbeateado globalmente por `ensureThisNeuron`)
 *      como fuente de verdad de "mis dispositivos" — online si visto hace
 *      menos de `ONLINE_WINDOW_MS`.
 *   2. En cuanto ≥2 de mis neuronas están online, abre solo el canal WebRTC
 *      compartido (`lan-sync.ts`) entre ellas — sin ningún botón — usando el
 *      `capabilities.syncDeviceId` que cada neurona ya publica (Adenda 71-bis).
 *   3. Intercambia, por ese canal, una "ficha" firmada por cuenta con cada
 *      peer (nombre · tipo · plataforma · versión · capas de Astraura que
 *      puede servir · clase de RAM) y late cada 30 s.
 *   4. Arranca la CAPA DE FAROS (Adenda 99, `startMeshSubsystem`) para que
 *      las neuronas de OTRAS cuentas también se detecten (radar), sin tocar
 *      la radio LoRa (eso sigue siendo `connectMesh()` explícito).
 *   5. (Ola 375 · RDV13) Comparte el RADAR: como mucho cada 60 s resume las
 *      señales que oyen las antenas LOCALES y se lo envía a cada peer conectado
 *      si cambió la huella (o cada 5 min); los resúmenes recibidos se guardan
 *      en `radar-remoto-store` con vía "p2p".
 *
 * Egress (Supabase) — contrato «consumo» (2026-09-29): reutiliza el latido de neuronas
 * (5 min) y los ciclos de `startMeshSubsystem` (faro+radar 20 min, bandeja 5–15 min,
 * federación 10–30 min); aparte, `listNeurons()` cada 15 min. Todo SOLO en la pestaña líder
 * y nunca con el dispositivo oculto: las demás pestañas reciben la lista por BroadcastChannel
 * (`bucle-fondo.ts`). Antes: `listNeurons()` cada 20 s por pestaña (y cada lectura hacía un
 * upsert + dos `getUser()`). El canal WebRTC no toca Supabase (solo la señalización inicial).
 *
 * Todo lo PURO (decisión de autovínculo, clasificación de RAM, parseo de
 * ficha) está exportado y se prueba sin DOM ni red — ver
 * `__tests__/malla-neuronas.test.ts`.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  listNeurons,
  ONLINE_WINDOW_MS,
  settingsFor,
  thisDeviceId,
  astraura158EndpointOf,
  type Neuron,
  type NeuronKind,
} from "@/lib/neurons/neurons";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import { ensureMesh, getSharedMesh, capaMeshCompartiendo, setupConcienciaSync } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerSnapshot, PeerState } from "@/lib/network/webrtc-mesh";
import { resumirRuta, type RutaEnlace } from "@/lib/network/estadisticas-enlace";
import { preferenciaCapasGuardada, type PreferenciaCapas } from "@/lib/astraura/capas-conciencia";
import { paginaEsLocal } from "@/lib/astraura/destino-local";
import { urlPuenteLocal } from "@/ai/providers/astraura-158";
// (Ola 368) Snapshot BARATO de "qué fuentes están listas ahora" — módulo sin
// dependencias pesadas (ver su cabecera), así que importarlo aquí no crea
// ningún ciclo con `availability.ts` (que es quien lo alimenta).
import { fuentesListasSnapshot } from "@/ai/astraura/ready-sources-snapshot";
import { crearBucle } from "@/lib/network/bucle-fondo";
// (Ola 375 · RDV13) Radar compartido por la malla: piezas pequeñas ya en main.
// Señales locales + resumen + almacén remoto; nada de esto toca el layout raíz
// con módulos nuevos (todo ya cuelga del mismo grafo o es puro y diminuto).
import {
  BLE_FRESH_MS,
  collectDetectedSignals,
  getBleScanState,
  type BleDetection,
} from "@/ai/astraura/mesh/signals";
import { getMeshState } from "@/ai/astraura/mesh/store";
import { senalesRadioLocal } from "@/ai/astraura/mesh/senales-radio-local";
import { obtenerRadioLocal } from "@/lib/network/radio-local-cliente";
import {
  MSG_RADAR,
  construirResumenRadar,
  esMensajeRadar,
  huellaResumen,
  type ResumenRadar,
} from "@/lib/network/radar-por-malla";
import { recibirResumen, setResumenLocal } from "@/lib/network/radar-remoto-store";

/* ------------------------------------------------------------------ */
/* Constantes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Cadencia de `listNeurons()` (pestaña líder, dispositivo visible). El «online» de cada
 * neurona lo decide su latido (5 min, ventana de 12 min), así que releer más a menudo solo
 * gastaría peticiones.
 */
export const MALLA_NEURONAS_CADA_MS = 15 * 60_000;
/** Late (ficha + heartbeat de latencia) por el canal cada esto (WebRTC: no toca Supabase). */
const CANAL_HEARTBEAT_MS = 30_000;
/**
 * (RDV13) Resume las señales LOCALES del radar como mucho cada esto. El latido
 * va cada 30 s, pero construir el resumen toca más piezas (BLE, radio nativa),
 * así que se hace cada 60 s y nunca más a menudo.
 */
export const RADAR_LOCAL_CADA_MS = 60_000;
/**
 * (RDV13) Reenvía el MISMO resumen tras esto aunque la huella no cambie: el
 * otro lado caduca los resúmenes a los 5 min (`RADAR_RESUMEN_TTL_MS`), así que
 * renovarlo cada 5 min mantiene viva una malla silenciosa pero honesta.
 */
export const RADAR_REENVIO_MS = 5 * 60_000;
/** Un faro más viejo que esto no cuenta como "neurona cercana detectada" (se renueva cada 20 min). */
const BEACON_CONSIDERADO_RECIENTE_MS = 30 * 60_000;
/** Versión estática del OS para la ficha (ver `package.json`; no auto-sincronizada). */
const OS_VERSION = "0.3.0";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type ClaseRam = "≤4 GB" | "8 GB" | "16 GB" | ">16 GB" | "desconocida";

/** Clasifica `navigator.deviceMemory` (o lo que traiga la neurona) en una banda legible. */
export function claseRam(memoryGb?: number): ClaseRam {
  if (typeof memoryGb !== "number" || !Number.isFinite(memoryGb) || memoryGb <= 0) return "desconocida";
  if (memoryGb <= 4) return "≤4 GB";
  if (memoryGb <= 8) return "8 GB";
  if (memoryGb <= 16) return "16 GB";
  return ">16 GB";
}

/** ¿Este origen es loopback/local? (única condición para sondear el backend 1.58 local). */
export function esOrigenLocal(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * sondaBackendLocal — ¿responde el backend Astraura 1.58 local (127.0.0.1:8000)?
 * Solo tiene sentido preguntarlo cuando el propio OS se sirve desde loopback/
 * local (en producción/Vercel, "local" para esta pestaña no significa nada del
 * dispositivo del usuario). 1.5 s de margen, nunca lanza.
 */
export async function sondaBackendLocal(hostname?: string): Promise<boolean> {
  const host = hostname ?? (typeof location !== "undefined" ? location.hostname : "");
  if (!esOrigenLocal(host)) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch("http://127.0.0.1:8000/api/ping", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** Ficha que dos neuronas de la MISMA cuenta se intercambian al conectar. */
export interface FichaDispositivo {
  v: 1;
  syncDeviceId: string;
  neuronDeviceId: string;
  nombre: string;
  tipo: NeuronKind;
  plataforma: string;
  versionOS: string;
  ramClase: ClaseRam;
  backendLocal: boolean;
  capas: PreferenciaCapas["capas"];
  at: number;
  /**
   * (Ola 367) ¿Esta neurona puede relayar Astraura 1.58 a otras por la malla
   * P2P ahora mismo? Ver `puedeServirAstrauraPorMalla()` — same-origin local
   * o endpoint propio declarado, Y capa mesh compartiendo encendida.
   */
  sirveAstraura?: boolean;
  /** Latencia medida por ESTA neurona a SU PROPIO backend Astraura (ms), si se conoce. */
  astrauraLatenciaMs?: number;
  /**
   * (Ola 368) Ids del catálogo (`free-catalog.ts`) que ESTA neurona tiene
   * LISTOS ahora mismo (cualquier modelo configurado con su cuenta/perfil,
   * no solo Astraura) — del snapshot ya calculado por `detectAvailability()`
   * en cualquier parte de la app (`ready-sources-snapshot.ts`): "cheap, no
   * extra probing", nunca dispara una sonda propia. Payload pequeño (solo
   * ids). El relé genérico `ia-por-malla.ts` la usa para elegir peer por
   * fuente pedida.
   */
  fuentesServibles?: string[];
}

/**
 * declaracionAstrauraLocal — ¿ESTE dispositivo declaró tener su propia
 * Astraura 1.58 (un endpoint propio en sus ajustes de neurona)? Duplica a
 * propósito la regla de `localDeclaradoEnDispositivo()`
 * (`ai/astraura/availability.ts`) para que ni ese módulo (pesado) ni el
 * relé de malla (`astraura-por-malla.ts`) tengan que importarse entre sí —
 * ver `architecture/astraura-158-sistema-primario.md` §17.
 */
export function declaracionAstrauraLocal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const s = settingsFor(thisDeviceId()).astraura158;
    if (s && s.enabled !== false && typeof s.endpoint === "string" && s.endpoint.trim()) return true;
  } catch {
    /* defensivo */
  }
  try {
    return window.localStorage.getItem("starseed.astraura.local-en-este-dispositivo") === "1";
  } catch {
    return false;
  }
}

/**
 * puedeServirAstrauraPorMalla — ¿puede ESTA neurona relayar Astraura 1.58 a
 * otros peers de la malla ahora mismo? Same-origin local (`paginaEsLocal()`,
 * se habla por el proxy del OS) o endpoint propio declarado
 * (`declaracionAstrauraLocal()`, se habla directo), Y la capa mesh
 * compartiendo (`capaMeshCompartiendo()`: maestro + capa mesh encendidos).
 */
export function puedeServirAstrauraPorMalla(): boolean {
  return capaMeshCompartiendo() && (paginaEsLocal() || declaracionAstrauraLocal());
}

const MSG_FICHA = "malla:ficha";
const MSG_HB = "malla:hb";
const MSG_HB_ACK = "malla:hb-ack";

interface MensajeFicha {
  t: typeof MSG_FICHA;
  ficha: FichaDispositivo;
}
interface MensajeHb {
  t: typeof MSG_HB;
  at: number;
}
interface MensajeHbAck {
  t: typeof MSG_HB_ACK;
  at: number;
}

/** ¿`x` es un mensaje de ficha válido? (guard puro, sin red). */
export function esMensajeFicha(x: unknown): x is MensajeFicha {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.t !== MSG_FICHA || !o.ficha || typeof o.ficha !== "object") return false;
  const f = o.ficha as Record<string, unknown>;
  return typeof f.syncDeviceId === "string" && typeof f.neuronDeviceId === "string";
}

/* ------------------------------------------------------------------ */
/* Radar compartido (Ola 375 · RDV13) — piezas PURAS                  */
/* ------------------------------------------------------------------ */

interface MensajeRadar {
  t: typeof MSG_RADAR;
  resumen: ResumenRadar;
}

/**
 * Detecciones BLE oídas hace menos de `ventanaMs` (puro, sin reloj propio).
 * Una detección con `at` en el futuro no cuenta: un dato que este dispositivo
 * aún no ha oído de verdad no es honesto.
 */
export function deteccionesBleRecientes(
  detecciones: BleDetection[],
  ahora: number,
  ventanaMs: number = BLE_FRESH_MS,
): BleDetection[] {
  return detecciones.filter((d) => d.at <= ahora && ahora - d.at < ventanaMs);
}

/** Último resumen de radar que este motor compartió (huella + momento). */
export interface EnvioRadarPrevio {
  huella: string;
  at: number;
}

/**
 * hayQueEnviarRadar — ¿toca compartir el resumen con los peers? Puro:
 *   · Sin envío previo → sí (primera vez que hay alguien conectado).
 *   · Huella distinta → sí (cambió lo que oyen las antenas de esta neurona).
 *   · Misma huella y ≥ `reenvioMs` desde el último envío → sí (renueva frescura).
 *   · En cualquier otro caso → no: no se molesta el canal sin nada nuevo.
 */
export function hayQueEnviarRadar(
  huella: string,
  ultimo: EnvioRadarPrevio | null,
  ahora: number,
  reenvioMs: number = RADAR_REENVIO_MS,
): boolean {
  if (!ultimo) return true;
  if (huella !== ultimo.huella) return true;
  return ahora - ultimo.at >= reenvioMs;
}

/**
 * medirLatenciaAstrauraPropia — ida y vuelta (ms) de ESTE dispositivo a SU
 * PROPIA Astraura 1.58 (proxy same-origin si `paginaEsLocal()`, si no el
 * endpoint declarado). `undefined` si no responde o no aplica — nunca lanza.
 * 1.5 s de margen: es solo para anunciar la ficha, no para servir un turno.
 */
async function medirLatenciaAstrauraPropia(): Promise<number | undefined> {
  try {
    const url = paginaEsLocal() ? urlPuenteLocal("/api/ping") : `${astraura158EndpointOf(thisDeviceId())}/api/ping`;
    const t0 = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return r.ok ? Math.max(0, Date.now() - t0) : undefined;
  } catch {
    return undefined;
  }
}

/** Construye la ficha de ESTE dispositivo (best-effort, nunca lanza). */
export async function construirFicha(neuron: Neuron | null): Promise<FichaDispositivo> {
  const ids = identidadDispositivo();
  const memoryGb = (neuron?.capabilities as { memoryGb?: number } | undefined)?.memoryGb;
  let backendLocal = false;
  try {
    backendLocal = await sondaBackendLocal();
  } catch {
    /* honesto: sin sonda, false */
  }
  // (Ola 367) ¿Puede esta neurona relayar Astraura 1.58 a la malla? Solo se
  // mide la latencia si de verdad puede servir — nunca se sonda de más.
  // Solo se anuncia si SU Astraura responde de verdad ahora: una neurona local con el
  // backend caído no debe atraer los turnos de la malla para devolverlos en error.
  const puedeServir = puedeServirAstrauraPorMalla();
  const astrauraLatenciaMs = puedeServir ? await medirLatenciaAstrauraPropia() : undefined;
  const sirveAstraura = puedeServir && astrauraLatenciaMs !== undefined;
  // (Ola 368) Solo se anuncia si la capa mesh está compartiendo (misma regla
  // que Astraura arriba): una neurona que no comparte no debe atraer turnos
  // del relé genérico para devolverlos en error.
  const fuentesServibles = capaMeshCompartiendo() ? fuentesListasSnapshot().ids : [];
  return {
    v: 1,
    syncDeviceId: ids.syncDeviceId,
    neuronDeviceId: ids.neuronDeviceId,
    nombre: neuron?.name || "Dispositivo",
    tipo: neuron?.kind || "other",
    plataforma: neuron?.capabilities?.platform || "desconocida",
    versionOS: OS_VERSION,
    ramClase: claseRam(memoryGb),
    backendLocal,
    capas: preferenciaCapasGuardada().capas,
    at: Date.now(),
    sirveAstraura,
    astrauraLatenciaMs,
    fuentesServibles,
  };
}

/* ------------------------------------------------------------------ */
/* Decisión de auto-vínculo (PURA)                                   */
/* ------------------------------------------------------------------ */

/** Vista mínima de una neurona para decidir el auto-vínculo (sin I/O). */
export interface NeuronaParaMalla {
  neuronId: string;
  /** `capabilities.syncDeviceId` — el id que usa el canal WebRTC. Puede faltar
   *  en una neurona vieja que no ha vuelto a latir desde antes de esta ola. */
  syncDeviceId?: string;
  online: boolean;
  isThisDevice: boolean;
}

/** Vista mínima de un peer conocido por el mesh compartido (sin I/O). */
export interface PeerEstadoLite {
  state: PeerState;
}

/**
 * decidirAutovinculo — a qué `syncDeviceId` hay que llamar `connectToDevice`
 * AHORA MISMO. Pura y determinista:
 *   · Si con ESTE dispositivo incluido hay MENOS de 2 neuronas online, no hay
 *     nadie con quien vincularse: lista vacía (no llama nunca en solitario).
 *   · Nunca a mí mismo; nunca a una neurona sin `syncDeviceId` publicado
 *     (aún no puede aceptar el canal).
 *   · Deduplica por `syncDeviceId` (dos filas de `neuron_devices` no deberían
 *     compartir id, pero un dato corrupto no debe duplicar la oferta).
 *   · Se SALTA un peer ya 'connected' o 'connecting' (no relanza una oferta
 *     redundante); SÍ reintenta uno 'failed'/'closed' o desconocido — el
 *     backoff de `webrtc-mesh.ts` ya decide cuándo es prudente.
 */
export function decidirAutovinculo(
  neuronas: NeuronaParaMalla[],
  peers: Record<string, PeerEstadoLite | undefined>,
): string[] {
  const online = neuronas.filter((n) => n.online);
  if (online.length < 2) return [];
  const objetivos: string[] = [];
  const vistos = new Set<string>();
  for (const n of online) {
    if (n.isThisDevice) continue;
    if (!n.syncDeviceId) continue;
    if (vistos.has(n.syncDeviceId)) continue;
    vistos.add(n.syncDeviceId);
    const peer = peers[n.syncDeviceId];
    if (peer && (peer.state === "connected" || peer.state === "connecting")) continue;
    objetivos.push(n.syncDeviceId);
  }
  return objetivos;
}

/* ------------------------------------------------------------------ */
/* Resumen para el indicador de capas (usePeersMalla)                */
/* ------------------------------------------------------------------ */

export interface ResumenMalla {
  /** Peers de la MISMA cuenta con el canal WebRTC abierto ahora mismo. */
  propios: number;
  /** Faros recientes de OTRAS cuentas (radar de la red sináptica). */
  otrasCuentas: number;
}

const RESUMEN_VACIO: ResumenMalla = { propios: 0, otrasCuentas: 0 };

let resumenActual: ResumenMalla = RESUMEN_VACIO;
const resumenListeners = new Set<() => void>();

function publicarResumen(next: ResumenMalla): void {
  if (next.propios === resumenActual.propios && next.otrasCuentas === resumenActual.otrasCuentas) return;
  resumenActual = next;
  for (const l of resumenListeners) {
    try {
      l();
    } catch {
      /* noop */
    }
  }
}

/**
 * usePeersMalla — hook LIGERO para el indicador de capas (`use-estado-capas.ts`,
 * cableado por el lead más adelante): `{ propios, otrasCuentas }`. NO arranca
 * nada por sí mismo — lee el resumen que publica el motor (`useMallaNeuronas`,
 * montado globalmente por `MallaNeuronasMount`). Sin el motor montado, degrada
 * a `{ propios: 0, otrasCuentas: 0 }` (honesto, nunca inventa presencia).
 */
/** Lectura SÍNCRONA del mismo resumen (sin hook): la usa la presencia en vivo de las neuronas. */
export function resumenMallaActual(): ResumenMalla {
  return resumenActual;
}

/** Se suscribe a los cambios del resumen (sin React). Devuelve la baja. */
export function alCambiarResumenMalla(cb: () => void): () => void {
  resumenListeners.add(cb);
  return () => {
    resumenListeners.delete(cb);
  };
}

export function usePeersMalla(): ResumenMalla {
  return useSyncExternalStore(
    (cb) => {
      resumenListeners.add(cb);
      return () => resumenListeners.delete(cb);
    },
    () => resumenActual,
    () => RESUMEN_VACIO,
  );
}

/* ------------------------------------------------------------------ */
/* Filas de UI                                                       */
/* ------------------------------------------------------------------ */

export type EstadoEnlace = "conectado" | "conectando" | "fallido" | "sin-vinculo";

export interface DispositivoMallaRow {
  neuronId: string;
  syncDeviceId?: string;
  nombre: string;
  plataforma: string;
  tipo: NeuronKind;
  online: boolean;
  esEsteDispositivo: boolean;
  ultimoVisto?: string;
  enlace: { estado: EstadoEnlace; motivo?: string; latenciaMs?: number; ruta?: RutaEnlace };
  ficha?: FichaDispositivo;
}

export interface NeuronaCercanaRow {
  deviceId: string;
  etiqueta: string;
  detectadaHaceMs: number;
  ofreceInternetPublico: boolean;
  /**
   * `syncDeviceId` publicado en el faro (Ola 366 `etiquetaFaroPropio()`),
   * si lo incluyó (`RelayBeacon.syncId`). Es el id que hace falta para
   * `solicitarVinculo()` (Ola 370) — sin él, «Solicitar vínculo» se
   * deshabilita para esta fila (la neurona aún no publica su identidad de
   * sincronización, p. ej. una versión anterior a la Ola 366).
   */
  syncId?: string;
}

function estadoEnlaceDe(peer: PeerSnapshot | undefined): DispositivoMallaRow["enlace"] {
  if (!peer) return { estado: "sin-vinculo" };
  if (peer.state === "connected") return { estado: "conectado" };
  if (peer.state === "connecting") return { estado: "conectando" };
  if (peer.state === "failed") return { estado: "fallido", motivo: peer.reason };
  return { estado: "sin-vinculo" };
}

/* ------------------------------------------------------------------ */
/* Motor (hook con efectos) — montado UNA vez por MallaNeuronasMount */
/* ------------------------------------------------------------------ */

export interface MallaNeuronasState {
  misDispositivos: DispositivoMallaRow[];
  cercanas: NeuronaCercanaRow[];
  loading: boolean;
}

const ESTADO_VACIO: MallaNeuronasState = { misDispositivos: [], cercanas: [], loading: true };
let estadoActual: MallaNeuronasState = ESTADO_VACIO;
const estadoListeners = new Set<() => void>();

function publicarEstadoMalla(next: MallaNeuronasState): void {
  estadoActual = next;
  for (const l of estadoListeners) {
    try {
      l();
    } catch {
      /* noop */
    }
  }
}

/**
 * useMallaNeuronasEstado — hook de SOLO LECTURA para la UI (panel del Centro
 * de Conexiones, /red-mesh): lee el estado que publica el motor ÚNICO
 * (`useMallaNeuronas`, montado una vez por `MallaNeuronasMount`) en vez de
 * arrancar un segundo motor (segundo poll de `listNeurons`, segundo mesh…).
 * Sin el motor montado (p. ej. en /mando, donde se excluye), degrada a listas
 * vacías — honesto, nunca inventa dispositivos.
 */
export function useMallaNeuronasEstado(): MallaNeuronasState {
  return useSyncExternalStore(
    (cb) => {
      estadoListeners.add(cb);
      return () => estadoListeners.delete(cb);
    },
    () => estadoActual,
    () => ESTADO_VACIO,
  );
}

/**
 * snapshotMallaNeuronas — lectura SÍNCRONA (sin hook) del mismo estado que
 * publica el motor único. Para código NO-React que necesita el estado ya
 * publicado ahora mismo (p. ej. `astraura-por-malla.ts` eligiendo con qué
 * peer hablar) — nunca arranca el motor: sin `MallaNeuronasMount` montado
 * degrada a listas vacías, igual que `useMallaNeuronasEstado()`.
 */
export function snapshotMallaNeuronas(): MallaNeuronasState {
  return estadoActual;
}

/** Beacon mínimo que este módulo necesita de `RelayBeacon` (evita el import pesado del barrel del mesh en cada consumidor). */
export interface FaroCercano {
  deviceId: string;
  label: string | null;
  at: number;
  own: boolean;
  offersPublic?: boolean;
  /** `syncDeviceId` del emisor, si lo incluyó (Ola 366 → Ola 370: lo usa `solicitarVinculo()`). */
  syncId?: string;
}

/**
 * useMallaNeuronas — EL MOTOR. Se monta UNA sola vez (ver `MallaNeuronasMount`,
 * hermano de `SovereignSyncMount`/`RealtimeSyncProvider` en el layout raíz).
 * Cualquier otra superficie (Centro de Conexiones, /red-mesh) LEE este mismo
 * estado — no vuelve a arrancar el motor ni el mesh (usa `getSharedMesh()`).
 *
 * `deps` inyecta las piezas que tocan red/DOM (mesh, faros, neuronas) para que
 * la lógica de arriba se pueda probar sin ellas; en producción se usan los
 * valores por defecto reales.
 */
export function useMallaNeuronas(deps?: {
  listNeurons?: typeof listNeurons;
  ensureMesh?: typeof ensureMesh;
  startBeaconLayer?: () => void;
  subscribeNearby?: (cb: (b: FaroCercano[]) => void) => () => void;
  getNearbyNow?: () => FaroCercano[];
}): MallaNeuronasState {
  const listNeuronsFn = deps?.listNeurons ?? listNeurons;
  const ensureMeshFn = deps?.ensureMesh ?? ensureMesh;

  const [neuronas, setNeuronas] = useState<Neuron[]>([]);
  const [peers, setPeers] = useState<Record<string, PeerSnapshot>>({});
  const [fichas, setFichas] = useState<Record<string, FichaDispositivo>>({});
  const [latencias, setLatencias] = useState<Record<string, number>>({});
  const [rutas, setRutas] = useState<Record<string, RutaEnlace>>({});
  const [cercanas, setCercanas] = useState<FaroCercano[]>(deps?.getNearbyNow?.() ?? []);
  const [loading, setLoading] = useState(true);

  const meshRef = useRef<MeshHandle | null>(null);
  const concienciaRef = useRef<(() => void) | null>(null);
  const hbSentAtRef = useRef<Map<string, number>>(new Map());
  // (RDV13) Control del radar compartido: cuándo se construyó el último resumen
  // local y qué se compartió al final (huella + momento).
  const radarConstruidoAtRef = useRef(0);
  const radarEnviadoRef = useRef<EnvioRadarPrevio | null>(null);

  /* ---- 1) neuronas de la cuenta: bucle de la pestaña líder, difundido al resto ---- */
  useEffect(() => {
    let cancelado = false;
    const aplicar = (lista: Neuron[]) => {
      if (cancelado || !Array.isArray(lista)) return;
      setNeuronas(lista);
      setLoading(false);
    };
    const bucle = crearBucle<Neuron[]>({
      nombre: "malla · neuronas de la cuenta",
      consulta: "select neuron_devices",
      intervaloMs: MALLA_NEURONAS_CADA_MS,
      difundir: true,
      tarea: async () => {
        const lista = await listNeuronsFn({ fresco: true });
        aplicar(lista);
        return { datos: lista };
      },
      alRecibirDatos: aplicar,
    });
    bucle.iniciar();
    // Pinta ya lo que haya (caché compartida de listNeurons: sin red si está vigente).
    void listNeuronsFn()
      .then(aplicar)
      .catch(() => {
        /* deja la lista anterior: nunca rompe la UI */
      });

    return () => {
      cancelado = true;
      bucle.detener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 2) capa de faros (radar de otras cuentas) + mesh propio ---- */
  useEffect(() => {
    deps?.startBeaconLayer?.();

    let cancelado = false;
    (async () => {
      const ids = identidadDispositivo();
      if (!ids.syncDeviceId) return;
      const mesh = await ensureMeshFn({
        id: ids.syncDeviceId,
        label: "",
        platform: "",
        userAgent: "",
        publicIp: null,
        lastSeen: Date.now(),
      });
      if (cancelado || !mesh) return;
      meshRef.current = mesh;

      const unsubPeer = mesh.onPeer({
        onState: (snap) => {
          setPeers((prev) => ({ ...prev, [snap.deviceId]: snap }));
        },
        onMessage: (deviceId, data) => {
          let msg: unknown;
          try {
            msg = JSON.parse(data);
          } catch {
            return;
          }
          if (esMensajeFicha(msg)) {
            setFichas((prev) => ({ ...prev, [deviceId]: msg.ficha }));
            return;
          }
          // (RDV13) Radar de la otra neurona: guarda su resumen como oído "p2p".
          // El guard descarta basura y el almacén caduca lo viejo solo.
          if (esMensajeRadar(msg)) {
            recibirResumen(msg.resumen, "p2p");
            return;
          }
          if (!msg || typeof msg !== "object") return;
          const o = msg as Record<string, unknown>;
          const tipo = o.t;
          const at = typeof o.at === "number" ? o.at : null;
          if (tipo === MSG_HB && at !== null) {
            mesh.sendToPeer(deviceId, JSON.stringify({ t: MSG_HB_ACK, at } satisfies MensajeHbAck));
            return;
          }
          if (tipo === MSG_HB_ACK && at !== null) {
            const sentAt = hbSentAtRef.current.get(deviceId);
            if (sentAt === at) {
              setLatencias((prev) => ({ ...prev, [deviceId]: Math.max(0, Date.now() - sentAt) }));
            }
          }
        },
      });

      const conciencia = capaMeshCompartiendo() ? setupConcienciaSync(mesh, {}) : null;
      concienciaRef.current = () => {
        unsubPeer();
        conciencia?.unsubscribe();
      };
    })();

    const nearbyUnsub = deps?.subscribeNearby?.((b) => setCercanas(b));

    return () => {
      cancelado = true;
      concienciaRef.current?.();
      concienciaRef.current = null;
      nearbyUnsub?.();
      // NO cerramos el mesh compartido aquí: otras superficies (el panel
      // manual de /servidores) lo siguen usando. `teardownMesh()` solo lo
      // llama quien de verdad cierra sesión/app.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 3) decisión de auto-vínculo: cada vez que cambian neuronas/peers ---- */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const misIds = identidadDispositivo();
    const ligero: NeuronaParaMalla[] = neuronas.map((n) => ({
      neuronId: n.id,
      syncDeviceId: (n.capabilities as { syncDeviceId?: string } | undefined)?.syncDeviceId,
      online: !!n.online,
      isThisDevice: n.id === misIds.neuronDeviceId || !!n.isThisDevice,
    }));
    const peersLite: Record<string, PeerEstadoLite> = {};
    for (const [id, snap] of Object.entries(peers)) peersLite[id] = { state: snap.state };
    const objetivos = decidirAutovinculo(ligero, peersLite);
    for (const target of objetivos) void mesh.connectToDevice(target);
  }, [neuronas, peers]);

  /* ---- 4) heartbeat (ficha inicial + late cada 30s) por cada peer conectado ---- */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const conectados = Object.values(peers).filter((p) => p.state === "connected" && p.channelOpen);
    if (conectados.length === 0) return;

    let cancelado = false;
    const enviarFichaYLatido = async () => {
      const misNeuronas = neuronas.find((n) => n.isThisDevice) ?? null;
      const ficha = await construirFicha(misNeuronas);
      if (cancelado) return;
      for (const p of conectados) {
        mesh.sendToPeer(p.deviceId, JSON.stringify({ t: MSG_FICHA, ficha } satisfies MensajeFicha));
        const at = Date.now();
        hbSentAtRef.current.set(p.deviceId, at);
        mesh.sendToPeer(p.deviceId, JSON.stringify({ t: MSG_HB, at } satisfies MensajeHb));
        try {
          const stats = await mesh.getStats?.(p.deviceId);
          if (stats) {
            const ruta = resumirRuta(stats, Date.now());
            setRutas((prev) => ({ ...prev, [p.deviceId]: ruta }));
          }
        } catch {
          /* conserva la última medición real si este sondeo falla */
        }
      }

      // (RDV13 · Ola 375) Radar compartido: como mucho cada 60 s resume lo que
      // oyen las antenas LOCALES de esta neurona (malla LoRa del radio conectado,
      // BLE oído con gesto, radio nativa de la Mac si el Genesis local la sirve) y
      // lo comparte con los peers conectados. Solo se envía si la huella cambió
      // o pasaron 5 min del último envío. Nunca lanza: un radar roto no puede
      // tumbar el latido de la malla.
      const ahoraRadar = Date.now();
      if (ahoraRadar - radarConstruidoAtRef.current < RADAR_LOCAL_CADA_MS) return;
      radarConstruidoAtRef.current = ahoraRadar;
      try {
        const ble = deteccionesBleRecientes(getBleScanState().detections, ahoraRadar);
        const senales = [
          ...collectDetectedSignals({
            mesh: getMeshState(),
            ble,
            includeExternal: true,
            now: ahoraRadar,
          }),
          ...senalesRadioLocal(await obtenerRadioLocal({ ahora: ahoraRadar }), ahoraRadar),
        ];
        if (cancelado) return;
        const resumen = construirResumenRadar(
          senales,
          {
            neuronId: identidadDispositivo().neuronDeviceId,
            nombre: misNeuronas?.name || "Dispositivo",
          },
          ahoraRadar,
        );
        // Siempre se publica en el almacén (lo pintará el radar de esta neurona
        // y lo usará la federación); el envío a peers es lo que se dosifica.
        setResumenLocal(resumen);
        const huella = huellaResumen(resumen);
        if (hayQueEnviarRadar(huella, radarEnviadoRef.current, ahoraRadar)) {
          radarEnviadoRef.current = { huella, at: ahoraRadar };
          for (const p of conectados) {
            mesh.sendToPeer(p.deviceId, JSON.stringify({ t: MSG_RADAR, resumen } satisfies MensajeRadar));
          }
        }
      } catch {
        /* el radar se reintenta en el siguiente latido; el latido ya fue */
      }
    };
    void enviarFichaYLatido();
    const timer = setInterval(() => void enviarFichaYLatido(), CANAL_HEARTBEAT_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(peers).filter((k) => peers[k]?.state === "connected").join(",")]);

  /* ---- 5) publica el resumen para usePeersMalla() ---- */
  useEffect(() => {
    const propios = Object.values(peers).filter((p) => p.state === "connected" && p.channelOpen).length;
    const cutoff = Date.now() - BEACON_CONSIDERADO_RECIENTE_MS;
    const otras = cercanas.filter((b) => !b.own && b.at >= cutoff).length;
    publicarResumen({ propios, otrasCuentas: otras });
  }, [peers, cercanas]);

  /* ---- filas para la UI ---- */
  const misIds = identidadDispositivo();
  const misDispositivos = useMemo<DispositivoMallaRow[]>(() => {
    return neuronas.map((n) => {
      const syncId = (n.capabilities as { syncDeviceId?: string } | undefined)?.syncDeviceId;
      const esEste = n.id === misIds.neuronDeviceId || !!n.isThisDevice;
      const peer = syncId ? peers[syncId] : undefined;
      const enlace = esEste ? { estado: "conectado" as const } : estadoEnlaceDe(peer);
      if (enlace.estado === "conectado" && syncId) {
        enlace.ruta = rutas[syncId];
        enlace.latenciaMs = latencias[syncId] ?? rutas[syncId]?.rttMs ?? undefined;
      }
      return {
        neuronId: n.id,
        syncDeviceId: syncId,
        nombre: n.name,
        plataforma: n.capabilities?.platform || "desconocida",
        tipo: n.kind,
        online: !!n.online,
        esEsteDispositivo: esEste,
        ultimoVisto: n.last_seen_at,
        enlace,
        ficha: syncId ? fichas[syncId] : undefined,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neuronas, peers, fichas, latencias, rutas]);

  const cercanasRows = useMemo<NeuronaCercanaRow[]>(() => {
    const cutoff = Date.now() - BEACON_CONSIDERADO_RECIENTE_MS;
    return cercanas
      .filter((b) => !b.own && b.at >= cutoff)
      .map((b) => ({
        deviceId: b.deviceId,
        etiqueta: b.label || "Neurona anónima",
        detectadaHaceMs: Math.max(0, Date.now() - b.at),
        ofreceInternetPublico: !!b.offersPublic,
        syncId: b.syncId,
      }));
  }, [cercanas]);

  const estado: MallaNeuronasState = { misDispositivos, cercanas: cercanasRows, loading };

  // Publica para `useMallaNeuronasEstado()` (UI de solo lectura) — este hook es
  // el ÚNICO motor: publica en cada render con datos nuevos, sin volver a
  // arrancar nada por leerlo desde otra superficie.
  useEffect(() => {
    publicarEstadoMalla(estado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [misDispositivos, cercanasRows, loading]);

  return estado;
}
