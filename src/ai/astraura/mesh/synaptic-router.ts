/**
 * StarSeed OS — RED SINÁPTICA · ENRUTADOR DE TRANSMISIÓN (Adenda 99).
 * ============================================================================
 * El "córtex" de la red sináptica simbiótica: decide, para CADA transmisión,
 * la MEJOR vía combinando privacidad, tamaño, distancia y las bandas/capacidades
 * disponibles — buscando eficiencia y velocidad para cada caso concreto.
 *
 * POLÍTICA (petición de Alex):
 *   · PÚBLICO → se sube a un SERVIDOR PÚBLICO (almacena + retransmite): lo
 *     público vive en la nube para que cualquiera lo alcance.
 *   · PRIVADO + LOCAL (destino alcanzable por la malla, corto alcance) →
 *     DIRECTO entre neuronas (red sináptica local), cifrado, SIN servidor:
 *     cada neurona es transmisor y receptor, respetando su privacidad y sus
 *     capacidades. Ej.: un mensaje a un grupo local va por nodos P2P (o directo)
 *     si el alcance y las bandas lo permiten.
 *   · PRIVADO + LEJANO (destino fuera del alcance de la malla) → SERVIDOR
 *     INTERMEDIO cifrado (relé): la malla no llega, así que la nube hace de
 *     puente — cifrado extremo a extremo, el servidor solo transporta.
 *   · Siempre con FAILOVER: si un nodo/ruta falla, hay alternativas (la entrega
 *     la garantiza `delivery.ts`).
 *
 * Este módulo es PURO y testeable (sin red, sin DOM): produce un PLAN. La
 * ejecución (con recibos y failover) vive en `delivery.ts`. NUNCA lanza.
 */

import { MESH_CLASS_SIZE_LIMIT } from "./constants";
import { recommendPreset, PRESET_SPECS } from "./antennas";
import type { BandGoal } from "./antennas";
import type { MeshState, TrafficClass } from "./types";

/** Ámbito de la información — decide servidor público vs directo privado. */
export type TransmitScope = "public" | "private" | "local-group";

/** Distancia lógica al destino (gobierna directo-vs-servidor). */
export type TransmitDistance = "local" | "far" | "unknown";

/** Vía física concreta de una transmisión. */
export type TransmitVia = "mesh-direct" | "mesh-flood" | "server-public" | "server-relay" | "wifi-direct";

export interface TransmitRequest {
  /** Ámbito: público (servidor) · privado (directo si local) · grupo local. */
  scope: TransmitScope;
  /** Clase de prioridad (P0 alerta … P3 bulk) para el presupuesto de la malla. */
  cls: TrafficClass;
  /** Tamaño estimado del payload (bytes, SIN comprimir). */
  sizeBytes: number;
  /** Destino: broadcast local, un nodo/neurona, un grupo, o una cuenta remota. */
  target: "broadcast" | "node" | "group" | "account";
  /** Distancia lógica (si se conoce): local = alcanzable por radio. */
  distance?: TransmitDistance;
  /** ¿El contenido ya va cifrado extremo a extremo por la capa superior? */
  e2e?: boolean;
  /** Nodo concreto de la malla para unicast (lo usa la ENTREGA, no el plan). */
  destNode?: number;
  /** Destinatario lógico para el relé por servidor (id de neurona/handle). */
  recipient?: string;
}

/** Un paso del plan (vía + por qué), en orden de preferencia. */
export interface TransmitLeg {
  via: TransmitVia;
  reason: string;
  /** Preset/banda recomendada si la vía es de radio. */
  preset?: string;
}

export interface TransmitPlan {
  /** Vía primaria (la más eficiente para este caso). */
  primary: TransmitLeg;
  /** Alternativas en orden (failover). */
  fallbacks: TransmitLeg[];
  /** ¿Enviar por VARIAS vías a la vez (redundancia)? P0/alertas → sí. */
  dual: boolean;
  /** true = no hay ninguna vía viva ahora; el plan es "encolar y reintentar". */
  queuedOnly?: boolean;
  /** Resumen legible para los indicadores de la UI. */
  summary: string;
}

/* ── Contexto de red vivo → capacidades disponibles ────────────────────────── */

export interface NetworkContext {
  meshReady: boolean;
  onlineNodes: number;
  avgSnr: number | null;
  channelUtilPct: number | null;
  region: string;
  activePreset: string;
  /** ¿Hay red externa (router/datos) sana ahora? */
  wifiHealthy: boolean;
  /** ¿Hay sesión de cuenta (para usar servidores)? */
  hasAccount: boolean;
}

/** Deriva el contexto de red del estado mesh + señales externas. Puro. */
export function deriveNetworkContext(
  s: MeshState,
  opts: { wifiHealthy: boolean; hasAccount: boolean; activePreset: string },
): NetworkContext {
  const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online");
  const snrs = online.map((n) => n.snr).filter((v): v is number => typeof v === "number");
  return {
    meshReady: s.status === "ready" || s.status === "degraded",
    onlineNodes: online.length,
    avgSnr: snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null,
    channelUtilPct: s.self?.channelUtilization ?? null,
    region: s.region,
    activePreset: opts.activePreset,
    wifiHealthy: opts.wifiHealthy,
    hasAccount: opts.hasAccount,
  };
}

/* ── El planificador ───────────────────────────────────────────────────────── */

/** ¿Cabe el payload en la malla LoRa para su clase? (troceado incluido). */
function fitsMesh(req: TransmitRequest): boolean {
  return req.sizeBytes <= MESH_CLASS_SIZE_LIMIT[req.cls];
}

/**
 * Banda/preset recomendada para ESTE envío: la malla usa un preset por sesión
 * (cambiarlo por mensaje reinicia el radio), así que recomendamos el que mejor
 * sirve al patrón — corto/rápido para grupos densos cercanos, largo para lejos.
 */
function bandFor(req: TransmitRequest, ctx: NetworkContext): string {
  // Envíos grandes o a grupo denso cercano → priorizar capacidad/velocidad.
  const goal: BandGoal =
    req.distance === "far"
      ? "distancia"
      : req.sizeBytes > 400 || (ctx.onlineNodes >= 6 && (ctx.channelUtilPct ?? 0) > 25)
        ? "velocidad"
        : "auto";
  const reco = recommendPreset(goal, {
    avgSnr: ctx.avgSnr,
    onlineNodes: ctx.onlineNodes,
    channelUtilPct: ctx.channelUtilPct,
    region: ctx.region,
  }, ctx.activePreset === "UNSET" ? null : ctx.activePreset);
  return reco.presetKey;
}

/**
 * planTransmission — decide la vía óptima. PURO. Devuelve SIEMPRE un plan
 * (aunque sea "solo cola offline" cuando nada está disponible: la entrega lo
 * reintentará). Nunca lanza.
 */
export function planTransmission(req: TransmitRequest, ctx: NetworkContext): TransmitPlan {
  const legs: TransmitLeg[] = [];
  const preset = bandFor(req, ctx);
  const meshUsable = ctx.meshReady && fitsMesh(req);
  const local = req.distance !== "far"; // 'local' o 'unknown' se tratan como cercano
  const kbps = PRESET_SPECS[preset]?.kbps;

  // 1) PÚBLICO → servidor público (almacena + retransmite). Además, si hay
  //    malla, se ANUNCIA localmente (los vecinos se enteran sin ir a la nube).
  if (req.scope === "public") {
    if (ctx.hasAccount) {
      legs.push({ via: "server-public", reason: "contenido público: se sube a un servidor para que cualquiera lo alcance" });
    }
    if (meshUsable && ctx.onlineNodes > 0) {
      legs.push({ via: "mesh-flood", reason: "aviso local a los vecinos de la malla (sin depender de la nube)", preset });
    }
    if (!legs.length) legs.push({ via: "server-public", reason: "público sin cuenta activa: se encola hasta poder subirlo" });
    const primary = legs[0];
    return {
      primary,
      fallbacks: legs.slice(1),
      dual: legs.length > 1,
      summary: `Público → ${label(primary.via)}${legs.length > 1 ? " + aviso por malla" : ""}`,
    };
  }

  // 2) PRIVADO/GRUPO LOCAL alcanzable por la malla → DIRECTO entre neuronas
  //    (red sináptica: cifrado, sin servidor). Es lo más eficiente y privado.
  if (local && meshUsable && ctx.onlineNodes > 0) {
    const via: TransmitVia = req.target === "node" ? "mesh-direct" : "mesh-flood";
    legs.push({
      via,
      reason:
        req.target === "node"
          ? "privado y local: directo a la neurona por radio (cifrado, sin nube)"
          : "grupo local: difusión sináptica P2P entre neuronas cercanas (cifrado, sin nube)",
      preset,
    });
    // Failover: si la malla falla, relé cifrado por servidor (si hay cuenta).
    if (ctx.hasAccount) {
      legs.push({ via: "server-relay", reason: "respaldo: relé cifrado por servidor si la malla no confirma" });
    }
    return {
      primary: legs[0],
      fallbacks: legs.slice(1),
      dual: req.cls === "P0", // alertas críticas: malla + servidor a la vez
      summary: `Privado local → ${label(legs[0].via)}${kbps ? ` (${preset}, ${kbps} kbps)` : ""}`,
    };
  }

  // 3) PRIVADO + LEJANO (o malla no disponible/insuficiente) → SERVIDOR
  //    INTERMEDIO cifrado: la malla no alcanza; la nube hace de puente E2E.
  if (ctx.hasAccount) {
    legs.push({
      via: "server-relay",
      reason:
        req.distance === "far"
          ? "destino lejano: relé cifrado por servidor intermedio (la malla no alcanza)"
          : !meshUsable
            ? "malla no disponible o payload grande: relé cifrado por servidor"
            : "sin vecinos a la vista: relé cifrado por servidor",
    });
    // Failover local: si además hay malla y cabe, intentarla como refuerzo.
    if (meshUsable && ctx.onlineNodes > 0) {
      legs.push({ via: "mesh-flood", reason: "refuerzo: también por la malla si algún nodo está en el camino", preset });
    }
    return {
      primary: legs[0],
      fallbacks: legs.slice(1),
      dual: false,
      summary: `Privado lejano → ${label(legs[0].via)}`,
    };
  }

  // 4) Nada disponible (sin cuenta y sin malla útil) → cola offline; la entrega
  //    reintentará en cuanto vuelva cualquier vía. Preferimos malla si existe.
  const via: TransmitVia = meshUsable ? "mesh-flood" : "server-relay";
  return {
    primary: { via, reason: "sin vías activas ahora: se encola y se reintenta al recuperar red", preset: meshUsable ? preset : undefined },
    fallbacks: [],
    dual: false,
    queuedOnly: true,
    summary: "En cola → se reintentará al recuperar red",
  };
}

/** Etiqueta legible de una vía (para los indicadores). */
export function label(via: TransmitVia): string {
  switch (via) {
    case "mesh-direct": return "directo P2P";
    case "mesh-flood": return "malla P2P";
    case "server-public": return "servidor público";
    case "server-relay": return "relé cifrado";
    case "wifi-direct": return "red directa";
    default: return via;
  }
}
