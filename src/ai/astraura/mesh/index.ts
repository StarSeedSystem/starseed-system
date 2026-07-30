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
import { initialBudget, NODE_SWEEP_INTERVAL_MS, WIFI_HEALTHY_SCORE } from "./constants";
import { decideRoute, feedWifiSample } from "./decision-router";
import { deliver } from "./delivery";
import { deriveNetworkContext } from "./synaptic-router";
import {
  getConnectivitySettings,
  connectivityFlagsFromConfig,
  connectivityFlagsFromSettings,
  normalizeConnectivityConfig,
  DEFAULT_CONNECTIVITY_CONFIG,
  type ConnectivityConfig,
} from "./connectivity";
import { getMeshServer, STARSEED_PUBLIC_SERVER, type MeshServer } from "./servers";
import { hasAccountSession, uploadPublic, uploadRelay } from "./server-relay";
import { startSynapticLayer, stopSynapticLayer } from "./synaptic";
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
  upsertMeshNode,
} from "./store";
import {
  airtimeAvailableFor,
  bindSyncTransport,
  deliverInbound,
  enqueueMeshSync,
  estimateChunkAirtimeMs,
  getActiveModemPreset,
  setActiveModemPreset,
  unbindSyncTransport,
} from "./sync";
import type { DeliveryPorts, DeliveryReceipt } from "./delivery";
import type { TransmitDistance, TransmitRequest, TransmitScope } from "./synaptic-router";
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
    // RED SINÁPTICA (Adenda 99): auto-descubrimiento por faro + bandeja de relé
    // cifrado. Best-effort: sin sesión/red no hace nada, la malla local sigue igual.
    startSynapticLayer();
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
  stopSynapticLayer();
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

/**
 * Conecta la malla a un NODO MESHTASTIC por Wi-Fi/LAN (mesh por IP): el radio no
 * está en ESTE dispositivo, pero su Wi-Fi lleva la malla por TCP/HTTP hasta un
 * nodo de tu red — así la Wi-Fi SÍ transporta la red mesh sin depender de LoRa
 * local. `host` = IP o hostname (se asume el API HTTP de Meshtastic, puerto 4403).
 */
export async function connectWifiNode(host: string): Promise<void> {
  const h = (host || "").trim();
  const url = /^https?:\/\//i.test(h) ? h : `http://${h}:4403`;
  await connectMesh("daemon", { daemonUrl: url });
}

/**
 * Fija la posición GPS de ESTA neurona (del navegador) en el nodo local, para
 * que el radar/mapa ubique con precisión a los vecinos que comparten GPS.
 * Devuelve false si aún no hay radio (sin nodo local al que anclar la posición).
 */
export function setNeuronPosition(lat: number, lon: number): boolean {
  try {
    const s = getMeshState();
    if (!s.self) return false;
    upsertMeshNode({ num: s.self.num, lat, lon });
    return true;
  } catch {
    return false;
  }
}

/* ── RED SINÁPTICA: transmisión con política + entrega + recibos (Adenda 99) ── */

export interface TransmitInput {
  /** Ámbito: público (servidor) · privado (directo si local) · grupo local. */
  scope: TransmitScope;
  cls: TrafficClass;
  type: MeshPayloadType;
  body: unknown;
  /** Destino lógico: difusión local, un nodo, un grupo o una cuenta remota. */
  target: TransmitRequest["target"];
  distance?: TransmitDistance;
  /** Nodo concreto para unicast por la malla. */
  destNode?: number;
  /** Destinatario lógico para el relé cifrado. */
  recipient?: string;
  e2e?: boolean;
  /**
   * Config de conectividad del CONTEXTO que transmite (entidad/chat/personalidad/
   * cerebro/archivo · Adenda 101). Si se pasa, el router la respeta: malla on/off,
   * público/privado/solo-malla/solo-cuenta y qué servidor usar. Si se omite, se
   * usan los ajustes de la neurona-cuenta (getConnectivitySettings).
   */
  connectivity?: ConnectivityConfig;
}

/**
 * Cablea las VÍAS reales para la entrega: malla → cola de sync (respeta duty
 * cycle); servidor → server-relay (público en claro / relé cifrado). El tipo de
 * payload se captura aquí para el sobre del servidor y el filtro de la malla.
 */
function makeTransmitPorts(ptype: MeshPayloadType, serverId = "starseed"): DeliveryPorts {
  return {
    mesh: async (leg, req, payload) => {
      const s = getMeshState();
      const ready = (s.status === "ready" || s.status === "degraded") && transport != null;
      if (!ready) return { ok: false, detail: "sin radio de malla conectado" };
      enqueueMeshSync({
        type: ptype,
        cls: req.cls,
        body: payload,
        dest: req.destNode,
        wantAck: req.cls === "P0",
      });
      const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
      const through =
        leg.via === "mesh-direct" && typeof req.destNode === "number"
          ? `nodo #${req.destNode}`
          : `${online} vecino${online === 1 ? "" : "s"} de la malla`;
      return {
        ok: true,
        confirmed: false, // la malla es best-effort; el ACK (si lo hay) llega aparte
        through,
        detail: `difundido a la malla${leg.preset ? ` (${leg.preset})` : ""}`,
      };
    },
    server: async (leg, req, payload) => {
      const envelope = { cls: req.cls, ptype, body: payload, recipient: req.recipient };
      const isPublic = leg.via === "server-public";
      const r = isPublic ? await uploadPublic(envelope, serverId) : await uploadRelay(envelope, serverId);
      return {
        ok: r.ok,
        // Público almacenado = alcanzable por cualquiera → CONFIRMADO. Relé =
        // subido y cifrado, a la espera de que el destinatario lo extraiga →
        // ENVIADO (honesto: no confirmamos recepción que no podemos verificar).
        confirmed: r.ok && isPublic,
        through: r.ref ? `servidor · fila ${r.ref}` : undefined,
        detail: r.detail,
      };
    },
  };
}

/**
 * transmit — envío por la RED SINÁPTICA. El enrutador decide la vía (público →
 * servidor · privado-local → malla directa · privado-lejano → relé cifrado); la
 * entrega hace FAILOVER y devuelve un RECIBO con la traza (por qué nodos/
 * servidores viajó), que alimenta los indicadores de la UI. Nunca lanza.
 */
export async function transmit(input: TransmitInput): Promise<DeliveryReceipt> {
  const s = getMeshState();
  const bodyStr = (() => {
    try {
      return JSON.stringify(input.body ?? null);
    } catch {
      return "null";
    }
  })();
  const hasAccount = await hasAccountSession();
  // Flags de enrutado: de la config del CONTEXTO si viene, si no de la cuenta.
  // Así el on/off de malla, el modo público/privado y el servidor elegido
  // gobiernan la transmisión REAL (no solo la UI).
  const flags = input.connectivity
    ? connectivityFlagsFromConfig(input.connectivity)
    : connectivityFlagsFromSettings(getConnectivitySettings());
  const ctx = deriveNetworkContext(s, {
    wifiHealthy: s.wifiHealth.score >= WIFI_HEALTHY_SCORE,
    hasAccount,
    activePreset: getActiveModemPreset(),
    meshAllowed: flags.meshAllowed,
    serverAllowed: flags.serverAllowed,
    publicAllowed: flags.publicAllowed,
    serverId: flags.serverId,
  });
  const req: TransmitRequest = {
    scope: input.scope,
    cls: input.cls,
    sizeBytes: bodyStr.length,
    target: input.target,
    distance: input.distance,
    destNode: input.destNode,
    recipient: input.recipient,
    e2e: input.e2e,
  };
  return deliver(req, input.body, ctx, makeTransmitPorts(input.type, flags.serverId));
}

/* ── Resolución de config por CONTEXTO + transmisión contextual (Adenda 101) ── */

/** Referencia de contexto cuya conectividad rige la transmisión REAL. */
export type ConnectivityContext =
  | { kind: "account" }
  | { kind: "entity"; entityKind: string; id: string }
  | { kind: "config"; config: ConnectivityConfig };

/**
 * Resuelve la ConnectivityConfig efectiva de un contexto (cuenta/entidad/config
 * explícita). Sirve para páginas, grupos, comunidades, cerebros, memorias,
 * credenciales, archivos, chats y personalidades: cada uno guarda su config y
 * aquí se lee para regir la transmisión. Nunca lanza; cae a los defaults.
 */
export async function resolveContextConnectivity(context: ConnectivityContext): Promise<ConnectivityConfig> {
  try {
    if (context.kind === "config") return context.config;
    if (context.kind === "entity") {
      const { getEntityState } = await import("@/lib/sync/entity-state");
      const ref = { kind: context.entityKind, id: context.id } as unknown as Parameters<typeof getEntityState>[0];
      const row = await getEntityState(ref, "connectivity");
      return normalizeConnectivityConfig((row as { value?: unknown } | null)?.value);
    }
    // account → deriva una ConnectivityConfig desde los ajustes de la neurona.
    const s = getConnectivitySettings();
    return normalizeConnectivityConfig({
      meshEnabled: s.meshEnabled,
      publicInternet: s.publicInternet,
      serverId: s.serverId,
      internetMode: s.publicInternet ? "public" : "private",
    });
  } catch {
    return { ...DEFAULT_CONNECTIVITY_CONFIG };
  }
}

/**
 * Transmite RESOLVIENDO primero la conectividad del contexto dado — la vía real
 * (malla/servidor, público/privado, servidor elegido) la fija ese contexto.
 */
export async function transmitForContext(
  context: ConnectivityContext,
  input: Omit<TransmitInput, "connectivity">,
): Promise<DeliveryReceipt> {
  const config = await resolveContextConnectivity(context);
  return transmit({ ...input, connectivity: config });
}

/**
 * Servidor efectivo de un contexto de ALMACENAMIENTO/sync (cerebro, memorias,
 * credenciales, cuenta, grupo, comunidad, página, archivo): resuelve su config
 * y devuelve el MeshServer elegido (StarSeed público por defecto, o uno propio
 * privado/público). Úsalo para decidir DÓNDE guardar/sincronizar cada cosa.
 */
export async function resolveContextServer(context: ConnectivityContext): Promise<MeshServer> {
  try {
    const cfg = await resolveContextConnectivity(context);
    return getMeshServer(cfg.serverId) ?? STARSEED_PUBLIC_SERVER;
  } catch {
    return STARSEED_PUBLIC_SERVER;
  }
}

/**
 * Convenience de publicación: transmite el contenido de un contexto con buenos
 * valores por defecto (público P2, difusión). Un solo punto para "publicar a la
 * red" desde cualquier emisor (posts, biblioteca, etc.) respetando su config.
 */
export async function publishForContext(
  context: ConnectivityContext,
  type: MeshPayloadType,
  body: unknown,
  opts?: { scope?: TransmitScope; cls?: TrafficClass; recipient?: string },
): Promise<DeliveryReceipt> {
  return transmitForContext(context, {
    scope: opts?.scope ?? "public",
    cls: opts?.cls ?? "P2",
    type,
    body,
    target: "broadcast",
    distance: "unknown",
    recipient: opts?.recipient,
  });
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
export { useMeshState, useNeuronMeshRules, useAllMeshRules, useNearbyBeacons, useDeliveryReceipts } from "./use-mesh";
export {
  getNetworkInbox,
  subscribeNetworkInbox,
  clearNetworkInbox,
  useNetworkInbox,
  MESH_INBOUND_EVENT,
  type NetworkInboundItem,
} from "./network-inbox";
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
  DEFAULT_CONNECTIVITY_CONFIG,
  normalizeConnectivityConfig,
  connectivityFlagsFromConfig,
  connectivityFlagsFromSettings,
  type ConnectivitySettings,
  type ConnectivityConfig,
  type ConnectivityInternetMode,
  type ContextFlags,
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
  type PublicRadarMode,
} from "./privacy";
export {
  listMeshServers,
  getMeshServer,
  addMeshServer,
  updateMeshServer,
  removeMeshServer,
  newServerId,
  subscribeMeshServers,
  STARSEED_PUBLIC_SERVER,
  MESH_SERVERS_EVENT,
  MESH_SERVERS_LS_KEY,
  type MeshServer,
  type MeshServerKind,
  type MeshServerVisibility,
} from "./servers";
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
/* ── RED SINÁPTICA (Adenda 99) — política, entrega, radar, bandas, cifrado ─── */
export {
  getRecentDeliveries,
  subscribeDeliveries,
  MESH_DELIVERY_EVENT,
} from "./delivery";
export type {
  DeliveryReceipt,
  DeliveryHop,
  DeliveryStatus,
  HopStatus,
} from "./delivery";
export {
  planTransmission,
  label as transmitViaLabel,
} from "./synaptic-router";
export type {
  TransmitPlan,
  TransmitLeg,
  TransmitRequest,
  TransmitScope,
  TransmitVia,
  TransmitDistance,
  NetworkContext,
} from "./synaptic-router";
export {
  getNearbyBeacons,
  subscribeNearby,
  refreshNearbyNow,
  MESH_NEARBY_EVENT,
} from "./synaptic";
export { hasAccountSession, revokeIdentity, currentFingerprint, isRevoked } from "./server-relay";
export type { RelayBeacon } from "./server-relay";
export { describeBands, activeBandCount } from "./bands";
export type { BandStatus } from "./bands";
export { detectSignals, controllableCount } from "./signals";
export type { SignalSource, SignalKind, SignalStatus } from "./signals";
export { detectPlatform, recommendNative, nativeRecommendationNow } from "./native-access";
export type { PlatformInfo, NativeRecommendation, NativeLink, OsKind, BrowserKind } from "./native-access";
export {
  hasRelayKey,
  exportRelayKeyB64,
  importRelayKeyB64,
  getOrCreateRelayKey,
} from "./relay-crypto";
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
