"use client";

/**
 * StarSeed OS — Red Mesh Meshtastic · API PÚBLICA (Adenda 97).
 * ============================================================================
 * Punto de entrada ÚNICO del subsistema mesh. Orquesta transporte ↔ codec ↔
 * descubrimiento ↔ router ↔ cola, y publica TODO al store global.
 *
 * SOP: `architecture/astraura-mesh-meshtastic.md`.
 * Regla de oro heredada de Astraura: la malla es una MEJORA — sin radio, sin
 * permisos o sin librería, el OS funciona exactamente igual (coste cero).
 *
 * Uso (UI):
 *   await connectMesh("serial" | "ble" | "daemon" | "simulator")
 *   await disconnectMesh()
 *   sendOverMesh({ type, cls, body, dest?, neuronId? })   // decide ruta él solo
 *   startMeshSubsystem()  // idempotente: health + discovery (sin radio no hace nada más)
 *
 * SSR-safe y defensivo. NUNCA lanza (salvo connectMesh, que propaga el error
 * legible para que la UI lo muestre — un fallo de permiso del navegador ES
 * información para el usuario, no algo que esconder).
 */

import { Reassembler, decodeFrame } from "./codec";
import { initialBudget, NODE_SWEEP_INTERVAL_MS } from "./constants";
import { decideRoute, feedWifiSample } from "./decision-router";
import { feedNode, feedSelfTelemetry, startDiscovery, stopDiscovery } from "./discovery";
import { pushMeshTopologyNow, startMeshFederation, stopMeshFederation } from "./federation";
import { probeWifiNow, refreshMeshHealth, startHealthMonitor, stopHealthMonitor } from "./health";
import { createMeshtasticTransport } from "./meshtastic-adapter";
import { getMeshPrivacy } from "./privacy";
import { getMeshRules, listMeshRules } from "./rules";
import { createSimulatorTransport } from "./simulator";
import {
  getMeshState,
  resetMeshRadio,
  setMeshState,
  subscribeMeshState,
} from "./store";
import {
  airtimeAvailableFor,
  bindSyncTransport,
  deliverInbound,
  enqueueMeshSync,
  estimateChunkAirtimeMs,
  setActiveModemPreset,
  unbindSyncTransport,
} from "./sync";
import type {
  MeshPayloadType,
  MeshTransport,
  MeshTransportEvents,
  MeshTransportKind,
  RouteDecision,
  TrafficClass,
} from "./types";

let transport: MeshTransport | null = null;
let started = false;
const reassembler = new Reassembler();
let unsubscribeHealth: (() => void) | null = null;
let lastWifiScoreFed = -1;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/* ── Ciclo de vida ─────────────────────────────────────────────────────────── */

/**
 * Arranca los monitores pasivos (salud Wi-Fi + sweep de presencia). Idempotente
 * y BARATO: sin radio conectada solo corre la sonda Wi-Fi adaptativa.
 */
export function startMeshSubsystem(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    startHealthMonitor();
    startDiscovery();
    // La histéresis del router se alimenta de cada publicación de salud Wi-Fi.
    unsubscribeHealth = subscribeMeshState((s) => {
      if (s.wifiHealth.at && s.wifiHealth.score !== lastWifiScoreFed) {
        lastWifiScoreFed = s.wifiHealth.score;
        feedWifiSample(s.wifiHealth.score);
      }
    });
    // Barrido de ventanas de reensamblado caducadas (SOP §5.1): sin esto, un
    // trozo perdido dejaba la ventana viva PARA SIEMPRE (fuga + vector DoS).
    if (!sweepTimer) {
      sweepTimer = setInterval(() => {
        try {
          reassembler.sweep(Date.now());
        } catch {
          /* */
        }
      }, NODE_SWEEP_INTERVAL_MS);
    }
    // Federación de topologías entre neuronas de la cuenta (Adenda 98 · v2).
    // Idempotente y best-effort: sin sesión Supabase no hace nada.
    startMeshFederation();
  } catch {
    /* */
  }
}

/**
 * RELÉ DE ALERTAS a nivel de app (SOP §7.2): si alguna personalidad de esta
 * neurona (o la neurona-dispositivo) tiene rol "alert-relay", una alerta OÍDA
 * se reemite UNA sola vez — una neurona-antena extiende el alcance más allá
 * del hop limit físico.
 *
 * Anti-bucle (Adenda 97 · fix crítico): el dedupe es por `oid` (ID de ORIGEN
 * ESTABLE de la alerta), NO por msgId local (que cambia en cada reemisión), y
 * respeta `ttl` (saltos de relé restantes). Sin esto, dos neuronas-antena a la
 * vista — o el propio eco del simulador — amplificaban una alerta hasta el
 * infinito. Toda alerta ORIGINADA aquí también registra su `oid` para no
 * reemitir jamás su propio eco.
 */
const seenAlertOids = new Set<string>();
const MAX_SEEN_OIDS = 1000;
/** Saltos de relé por defecto de una alerta recién originada. */
const DEFAULT_ALERT_TTL = 3;

function rememberOid(oid: string): void {
  seenAlertOids.add(oid);
  if (seenAlertOids.size > MAX_SEEN_OIDS) {
    const first = seenAlertOids.values().next().value;
    if (first) seenAlertOids.delete(first);
  }
}

function anyAlertRelayRole(): boolean {
  try {
    // PERMISO DE USO de la malla (privacy.relayUse, Adenda 98) manda sobre los
    // roles: "none" bloquea todo relé de app; "all" lo permite aunque ninguna
    // personalidad tenga el rol; "alerts" (defecto) exige el rol relé.
    const relayUse = getMeshPrivacy().relayUse;
    if (relayUse === "none") return false;
    if (relayUse === "all") return true;
    // El dispositivo o CUALQUIER personalidad con rol relé activan la reemisión.
    if (getMeshRules(null).role === "alert-relay") return true;
    return Object.values(listMeshRules()).some((r) => r.role === "alert-relay");
  } catch {
    return false;
  }
}

const transportEvents: MeshTransportEvents = {
  onStatus: (status, detail) => {
    // Preservar lastError: el adaptador emite "error" e inmediatamente
    // "disconnected" en el mismo tick; si borrásemos el mensaje en cada estado
    // no-error, el usuario nunca lo vería. Solo lo FIJAMOS en "error"; se limpia
    // en el próximo connectMesh. Si viene detail en reconnecting/error, lo usamos.
    if (status === "error") setMeshState({ status, lastError: detail });
    else setMeshState({ status });
    refreshMeshHealth();
  },
  onNode: (node) => feedNode(node),
  onSelfTelemetry: (t) => feedSelfTelemetry(t),
  onLoraConfig: ({ regionKey, presetKey }) => {
    // Autodetección (Adenda 98): la región ajusta el % objetivo de duty cycle;
    // el preset ajusta la estimación de airtime por trozo. IMPORTANTE: solo se
    // RECOMPUTA el presupuesto cuando la región CAMBIA de verdad — así una
    // reconexión del daemon (que re-emite el config) NO borra el saldo/deuda
    // de airtime acumulado (antes lo reseteaba a capacidad/3 en cada reconexión).
    try {
      if (regionKey) {
        const s = getMeshState();
        if (s.region !== regionKey) {
          const fresh = initialBudget(regionKey);
          setMeshState({
            region: regionKey,
            // Nuevo % objetivo de la región, pero CONSERVA el saldo vivo.
            budget: { ...s.budget, targetDutyPct: fresh.targetDutyPct },
          });
        }
      }
      if (presetKey) setActiveModemPreset(presetKey);
    } catch {
      /* */
    }
  },
  onAppPayload: (bytes, meta) => {
    void (async () => {
      try {
        const frame = decodeFrame(bytes);
        if (!frame) return; // no es nuestro / corrupto → silencio
        const msg = await reassembler.push(frame, meta.from, Date.now());
        if (msg) {
          // Alertas: dedupe por OID de origen ANTES de entregar/relé (corta el
          // eco y el bucle de amplificación). Sin oid = alerta legada → se
          // entrega pero no se relé (no hay forma segura de deduplicar).
          if (msg.type === "alert") {
            const body = (msg.body ?? {}) as { oid?: unknown; ttl?: unknown };
            const oid = typeof body.oid === "string" ? body.oid : null;
            if (oid && seenAlertOids.has(oid)) return; // ya vista (incl. nuestro eco)
            if (oid) rememberOid(oid);
            deliverInbound({ type: msg.type, cls: msg.cls, body: msg.body, from: msg.from });
            const ttl = typeof body.ttl === "number" ? body.ttl : 0;
            if (oid && ttl > 0 && anyAlertRelayRole()) {
              // Reemitir con ttl decrementado y el MISMO oid (dedupe estable).
              enqueueMeshSync({
                type: "alert",
                cls: "P0",
                body: { ...(msg.body as object), ttl: ttl - 1 },
                wantAck: false,
              });
            }
            return;
          }
          deliverInbound({ type: msg.type, cls: msg.cls, body: msg.body, from: msg.from });
        }
      } catch {
        /* */
      }
    })();
  },
};

/**
 * Conecta un radio (o el simulador). Serial/BLE deben llamarse desde un
 * GESTO del usuario. Propaga errores LEGIBLES para la UI.
 */
export async function connectMesh(
  kind: MeshTransportKind,
  opts?: { daemonUrl?: string },
): Promise<void> {
  startMeshSubsystem();
  if (transport) await disconnectMesh();
  transport =
    kind === "simulator"
      ? createSimulatorTransport(transportEvents)
      : createMeshtasticTransport(kind, transportEvents, opts);
  setMeshState({ transport: kind, lastError: undefined }); // limpiar error previo
  bindSyncTransport(() => transport);
  await transport.connect();
  refreshMeshHealth();
  pushMeshTopologyNow(); // comparte la malla recién conectada con las otras neuronas
}

export async function disconnectMesh(): Promise<void> {
  const t = transport;
  transport = null;
  unbindSyncTransport();
  if (t) {
    try {
      await t.disconnect();
    } catch {
      /* */
    }
  }
  // Resetea SOLO lo del radio (conserva la salud Wi-Fi ya medida) y fuerza una
  // sonda para que la UI refleje al instante que Wi-Fi sigue viva sin el radio.
  resetMeshRadio();
  probeWifiNow();
  refreshMeshHealth();
}

/** Apaga TODO (pruebas / cierre de app). No resucita nada. */
export function stopMeshSubsystem(): void {
  // Soltar el radio SIN re-arrancar el subsistema (disconnectMesh ya no llama a
  // startMeshSubsystem). Luego parar monitores y timers.
  void (async () => {
    const t = transport;
    transport = null;
    unbindSyncTransport();
    if (t) {
      try {
        await t.disconnect();
      } catch {
        /* */
      }
    }
    resetMeshRadio();
  })();
  stopDiscovery();
  stopHealthMonitor();
  stopMeshFederation();
  unsubscribeHealth?.();
  unsubscribeHealth = null;
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  started = false;
}

/* ── Envío con decisión de ruta ────────────────────────────────────────────── */

export interface SendOverMeshInput {
  type: MeshPayloadType;
  cls: TrafficClass;
  body: unknown;
  /** Nodo de destino (undefined = broadcast del canal). */
  dest?: number;
  /** Personalidad origen (aplica sus reglas mesh). */
  neuronId?: string;
}

export interface SendOverMeshResult {
  decision: RouteDecision;
  /** true si el mensaje quedó ENTREGADO a una ruta (mesh en cola cuenta). */
  accepted: boolean;
}

/**
 * sendOverMesh — punto único de salida hacia la malla. Pregunta al router
 * (O(1)) y actúa: mesh/dual → encola en sync (que respeta duty cycle);
 * wifi → NO hace nada aquí (el llamador sigue su camino normal de red);
 * offline-queue → también encola (se drenará si vuelve la malla).
 *
 * Honesto: esta función NO reimplementa la red Wi-Fi del OS — decide cuándo
 * la malla debe llevar (también) el payload.
 */
export function sendOverMesh(input: SendOverMeshInput): SendOverMeshResult {
  // ORIGEN de alerta: sella un oid ESTABLE + ttl por defecto si faltan, y lo
  // registra como "visto" para no reemitir jamás nuestro propio eco (fix del
  // bucle de relé). El oid identifica la alerta a través de todos los saltos.
  let body = input.body;
  if (input.type === "alert" && body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.oid !== "string") {
      const rnd = globalThis.crypto?.getRandomValues?.(new Uint32Array(2));
      const oid = rnd ? `${rnd[0].toString(36)}${rnd[1].toString(36)}` : `a${Date.now().toString(36)}`;
      body = { ...b, oid, ttl: typeof b.ttl === "number" ? b.ttl : DEFAULT_ALERT_TTL };
      rememberOid(oid);
    } else {
      rememberOid(b.oid);
    }
  }

  const bodyStr = (() => {
    try {
      return JSON.stringify(body ?? null);
    } catch {
      return "null";
    }
  })();
  const rules = getMeshRules(input.neuronId ?? null);
  const decision = decideRoute({
    cls: input.cls,
    sizeBytes: bodyStr.length,
    neuronRules: rules,
    airtimeAvailable: airtimeAvailableFor(input.cls, Math.ceil(bodyStr.length / 180) || 1),
  });
  // Encolar en la malla SOLO cuando la ruta es realmente mesh-recuperable.
  // `offline-queue` significa "ninguna ruta viva / clase prohibida / payload
  // demasiado grande" → NO se encola en la malla (era un bug: encolaba clases
  // prohibidas y fugaba memoria sin radio). `queued-mesh` sí (espera airtime).
  const goesToMesh =
    decision.route === "mesh" || decision.route === "dual" || decision.route === "queued-mesh";
  if (goesToMesh) {
    enqueueMeshSync({
      type: input.type,
      cls: input.cls,
      body,
      dest: input.dest,
      neuronId: input.neuronId,
      wantAck: input.cls === "P0",
    });
  }
  return { decision, accepted: goesToMesh || decision.route === "wifi" };
}

/**
 * (Adenda 98) Aplica un preset de módem al radio ACTIVO (cambio real de
 * banda/velocidad). Devuelve false sin radio o si el transporte no lo soporta.
 */
export async function applyModemPreset(presetKey: string): Promise<boolean> {
  try {
    const t = transport;
    if (!t?.setModemPreset) return false;
    const ok = await t.setModemPreset(presetKey);
    if (ok) setActiveModemPreset(presetKey);
    return ok;
  } catch {
    return false;
  }
}

/* ── Re-exports de la API pública ──────────────────────────────────────────── */

export { getMeshState, subscribeMeshState } from "./store";
export { decideRoute } from "./decision-router";
export { enqueueMeshSync, deliverInbound, setActiveModemPreset } from "./sync";
export {
  getMeshRules,
  setMeshRules,
  clearMeshRules,
  listMeshRules,
  MESH_RULES_EVENT,
  DEVICE_RULES_ID,
  MESH_ROLE_LABELS,
  MESH_PRIORITY_LABELS,
} from "./rules";
export { useMeshState, useNeuronMeshRules, useAllMeshRules } from "./use-mesh";
export { MESH_ALERT_EVENT, MESH_STATE_EVENT, MESH_DAEMON_DEFAULT_URL } from "./constants";
export {
  getConnectivitySettings,
  setConnectivitySettings,
  externalLink,
  bluetoothLink,
  serialLink,
  subscribeConnectivity,
  CONNECTIVITY_EVENT,
  DEFAULT_CONNECTIVITY,
  type ConnectivitySettings,
  type ConnectivityLink,
  type PreferredRoute,
  type LinkKind,
  type LinkAvailability,
} from "./connectivity";
export {
  getMeshPrivacy,
  setMeshPrivacy,
  MESH_PRIVACY_EVENT,
  DEFAULT_MESH_PRIVACY,
  type MeshPrivacySettings,
  type MeshVisibility,
  type MeshRelayUse,
} from "./privacy";
export {
  REGION_BANDS,
  PRESET_SPECS,
  PRESET_ORDER,
  antennaInventory,
  recommendPreset,
  estimateDistanceMeters,
  type BandGoal,
  type BandRecommendation,
  type AntennaInfo,
} from "./antennas";
export { getActiveModemPreset } from "./sync";
export { pushMeshTopologyNow } from "./federation";
export type { RemoteTopology } from "./types";
export type {
  MeshState,
  MeshNodeInfo,
  MeshRules,
  MeshTransportKind,
  NeuronMeshPriority,
  NeuronMeshRole,
  RouteDecision,
  TrafficClass,
  MeshPayloadType,
} from "./types";
export { estimateChunkAirtimeMs };
