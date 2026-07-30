/**
 * StarSeed OS — Red Mesh Meshtastic · TIPOS (Adenda 97).
 * ============================================================================
 * Tipos compartidos de todo el subsistema mesh (`src/ai/astraura/mesh/`).
 * SOP: `architecture/astraura-mesh-meshtastic.md` (léelo antes de cambiar nada).
 *
 * Módulo PURO: sin imports de react ni de APIs del navegador. Importarlo es
 * gratis desde cualquier capa (server/client). Nunca lanza.
 */

/** Transportes soportados hacia el radio físico (o virtual). */
export type MeshTransportKind = "serial" | "ble" | "daemon" | "simulator";

/** Estado de la conexión con el radio. */
export type MeshLinkStatus =
  | "disconnected" // sin radio
  | "connecting" // handshake en curso
  | "configuring" // volcado inicial de config + NodeDB
  | "ready" // operativa
  | "degraded" // watchdog: >45 s sin frames
  | "reconnecting" // caída detectada, backoff en curso
  | "error"; // fallo irrecuperable hasta nuevo gesto del usuario

/** Rol Meshtastic del nodo (subset que nos importa; el resto se conserva como string). */
export type MeshNodeRole =
  | "CLIENT"
  | "CLIENT_MUTE"
  | "ROUTER"
  | "REPEATER"
  | "TRACKER"
  | "SENSOR"
  | (string & {});

/** Presencia derivada de lastHeard (sweep perezoso, ver discovery.ts). */
export type MeshNodePresence = "online" | "stale" | "offline";

/** Un nodo de la malla tal y como lo conoce ESTA neurona (NodeDB viva). */
export interface MeshNodeInfo {
  /** Número de nodo Meshtastic (uint32). Identificador primario en la malla. */
  num: number;
  /** ID legible (p.ej. "!a4c138f2"). */
  id?: string;
  longName?: string;
  shortName?: string;
  /** Modelo de hardware ("TBEAM", "HELTEC_V3"…). */
  hwModel?: string;
  role?: MeshNodeRole;
  /** Última vez oído (epoch ms LOCAL — normalizado al recibir). */
  lastHeard: number;
  presence: MeshNodePresence;
  /** Métricas del último paquete oído de este nodo. */
  snr?: number;
  rssi?: number;
  /** Telemetría de dispositivo (si el nodo la emite). */
  batteryLevel?: number; // 0..100 · 101 = enchufado
  voltage?: number;
  channelUtilization?: number; // 0..100 (%)
  airUtilTx?: number; // 0..100 (%)
  /** Posición aproximada (si el nodo la comparte). */
  lat?: number;
  lon?: number;
  /** Saltos estimados hasta este nodo (hopStart - hopLimit del último paquete). */
  hopsAway?: number;
  /** ¿Es el nodo LOCAL (el radio conectado a esta neurona)? */
  isSelf?: boolean;
  /** ¿Favorito del usuario (fijado arriba en la UI)? */
  favorite?: boolean;
}

/** Arista de topología oída (A retransmitió/respondió a B). Best-effort. */
export interface MeshTopologyEdge {
  from: number;
  to: number;
  /** Última vez confirmada (epoch ms). */
  at: number;
  /** SNR de la observación (si viajó en un traceroute). */
  snr?: number;
}

/** Instantánea de topología que consume la UI. */
export interface MeshTopologySnapshot {
  nodes: MeshNodeInfo[];
  edges: MeshTopologyEdge[];
  /** Nodo local (si hay radio). */
  selfNum?: number;
  updatedAt: number;
}

/** Salud de UNA ruta (Wi-Fi o mesh), ya suavizada (EMA). */
export interface LinkHealth {
  /** 0..1 — puntuación compuesta (ver decision-router.ts). */
  score: number;
  /** Latencia EMA en ms (Wi-Fi) o proxy por SNR (mesh). */
  latencyMs?: number;
  /** Pérdida estimada 0..1 (ventana móvil). */
  loss?: number;
  /** Detalle legible para la UI ("3 nodos · SNR 8,5 dB · util 4 %"). */
  detail: string;
  /** Última medición (epoch ms). */
  at: number;
}

/** Clases de tráfico (gobiernan prioridad, ruta y presupuesto). SOP §4.2. */
export type TrafficClass = "P0" | "P1" | "P2" | "P3";

/** Tipos de payload StarSeed que viajan por la malla (sobre binario, SOP §5.1). */
export type MeshPayloadType =
  | "alert" // P0 — alerta crítica comunitaria
  | "message" // P1 — mensajería corta cifrada
  | "presence" // P1 — presencia/latido de neurona
  | "post" // P2 — publicación de contenido a la red (feed público/entidad)
  | "state-delta" // P2 — delta de memoria IA / config / entity_state
  | "manifest" // P3 — manifiesto de identidad soberana
  | "chunk-req"; // P2 — NACK selectivo: re-pedir un trozo perdido

/** Ruta elegida para un envío. */
export type MeshRouteChoice = "wifi" | "mesh" | "dual" | "queued-mesh" | "offline-queue";

/** Razones normalizadas de una decisión (UI + telemetría honesta). */
export type MeshRouteReason =
  | "no-radio"
  | "wifi-healthy"
  | "wifi-degraded"
  | "mesh-forced-by-rule"
  | "mesh-unhealthy"
  | "critical-dual-path"
  | "duty-budget-exhausted"
  | "payload-too-large"
  | "all-links-down";

/** Registro de UNA decisión de enrutado (historial visible en Red Mesh). */
export interface RouteDecision {
  route: MeshRouteChoice;
  reason: MeshRouteReason;
  cls: TrafficClass;
  sizeBytes: number;
  /** Puntuaciones en el instante de decidir (para la UI). */
  wifiScore: number;
  meshScore: number;
  at: number;
}

/** Rol de una neurona/personalidad dentro de la malla (SOP §7.2). */
export type NeuronMeshRole =
  | "interactive" // por defecto: envía y recibe según el router
  | "alert-relay" // SOLO reemite alertas P0 (neurona-antena)
  | "listen-only" // jamás transmite; solo escucha
  | "off"; // no participa

/** Prioridad de ancho de banda de una neurona en la cola compartida. */
export type NeuronMeshPriority = "high" | "normal" | "low";

/**
 * Reglas mesh POR NEURONA/personalidad. Campo ADITIVO en el perfil de
 * personalidad (retrocompatible: perfiles sin él usan DEFAULT_MESH_RULES).
 */
export interface MeshRules {
  role: NeuronMeshRole;
  priority: NeuronMeshPriority;
  /** ¿Su voz OmniVoice puede anunciar eventos de malla (alertas oídas, nodos)? */
  voiceAnnounce: boolean;
  /** ¿Sus datos (memoria/estado) pueden sincronizar por mesh (no solo Wi-Fi)? */
  allowStateSync: boolean;
  /** Clases que esta neurona puede ORIGINAR en la malla. */
  allowedClasses: TrafficClass[];
}

/** Elemento de la cola de sincronización multidimensional (sync.ts). */
export interface SyncItem {
  id: string;
  type: MeshPayloadType;
  cls: TrafficClass;
  /** Payload YA filtrado (whitelist por tipo) y listo para el codec. */
  body: unknown;
  /** Destino: número de nodo, o undefined = broadcast del canal. */
  dest?: number;
  /** Pedir ACK de malla (solo unicast; P0 lo fuerza). */
  wantAck?: boolean;
  /** Neurona origen (aplica reglas + prioridad). */
  neuronId?: string;
  createdAt: number;
  attempts: number;
}

/** Recibo de un envío al transporte. */
export interface MeshSendReceipt {
  ok: boolean;
  /** Id de paquete del radio (si el transporte lo da). */
  packetId?: number;
  error?: string;
}

/** Opciones de envío hacia el transporte. */
export interface MeshSendOptions {
  dest?: number; // undefined = broadcast
  wantAck?: boolean;
  channel?: number; // índice de canal (0 = primario)
  /** PortNum de app; StarSeed usa PRIVATE_APP (ver constants.ts). */
  portNum?: number;
}

/** Estado del presupuesto de airtime (token bucket, SOP §5.1). */
export interface AirtimeBudget {
  /** Tokens disponibles ahora mismo (ms de airtime). */
  availableMs: number;
  /** Capacidad máxima del bucket (ms). */
  capacityMs: number;
  /** Reserva intocable para P0 (ms). */
  reservedP0Ms: number;
  /** % de duty cycle objetivo (conservador, < límite legal de la región). */
  targetDutyPct: number;
}

/** Instantánea de topología de OTRA neurona de la cuenta (federación v2). */
export interface RemoteTopology {
  deviceId: string;
  label: string;
  onlineCount: number;
  snapshot: {
    self?: {
      num: number;
      name: string | null;
      snr: number | null;
      /** Solo con opt-in de privacidad (sharePosition). */
      lat?: number;
      lon?: number;
    } | null;
    nodes?: Array<{ num: number; name: string | null; snr: number | null }>;
    region?: string;
    /** Preset del módem de esa neurona (datos de antena del peer). */
    preset?: string;
  };
  /** epoch ms de la última actualización de esa neurona. */
  at: number;
}

/** Estado GLOBAL del subsistema mesh (lo publica store.ts). */
export interface MeshState {
  status: MeshLinkStatus;
  transport: MeshTransportKind | null;
  /** Info del radio local (si hay). */
  self?: MeshNodeInfo;
  nodes: MeshNodeInfo[];
  edges: MeshTopologyEdge[];
  wifiHealth: LinkHealth;
  meshHealth: LinkHealth;
  decisions: RouteDecision[]; // últimas N (historial)
  queue: { pending: number; byClass: Record<TrafficClass, number> };
  budget: AirtimeBudget;
  /** Región LoRa activa (para el presupuesto): "EU_868", "US_915"… */
  region: string;
  /** Topologías federadas de OTRAS neuronas de la cuenta (Adenda 98 · v2). */
  remoteTopologies?: RemoteTopology[];
  /** Último error legible (best-effort, para la UI). */
  lastError?: string;
  updatedAt: number;
}

/** Eventos que emite un transporte hacia el adaptador/discovery. */
export interface MeshTransportEvents {
  onStatus?: (status: MeshLinkStatus, detail?: string) => void;
  /** Frame de app decodificado (payload de PRIVATE_APP ya extraído). */
  onAppPayload?: (bytes: Uint8Array, meta: { from: number; snr?: number; rssi?: number; packetId?: number }) => void;
  /** NodeInfo/actualización de nodo (normalizado a MeshNodeInfo parcial). */
  onNode?: (node: Partial<MeshNodeInfo> & { num: number }) => void;
  /** Telemetría del NODO LOCAL (utilización de canal, batería…). */
  onSelfTelemetry?: (t: Partial<MeshNodeInfo>) => void;
  /** ACK/NAK de malla para un packetId nuestro. */
  onAck?: (packetId: number, ok: boolean) => void;
  /**
   * Config LoRa leída del radio al conectar (Adenda 98): región (para el
   * presupuesto de duty cycle) y preset del módem (para estimar airtime). Las
   * claves ya vienen normalizadas a las de constants.ts, o null si desconocidas.
   */
  onLoraConfig?: (cfg: { regionKey: string | null; presetKey: string | null }) => void;
}

/** Contrato de un transporte físico o virtual (SOP §8). */
export interface MeshTransport {
  readonly kind: MeshTransportKind;
  /** Conecta (serial/ble exigen gesto del usuario; daemon/simulator no). */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Envía bytes de app (el adaptador los envuelve en MeshPacket). */
  send(bytes: Uint8Array, opts: MeshSendOptions): Promise<MeshSendReceipt>;
  /**
   * (Adenda 98) Aplica un PRESET DE MÓDEM real al radio (cambio de banda/
   * velocidad: SHORT_FAST · LONG_FAST · LONG_MODERATE…). Best-effort: true si
   * el radio aceptó la escritura (puede reiniciar su enlace). Opcional: el
   * simulador lo emula; los transportes sin soporte lo omiten.
   */
  setModemPreset?(presetKey: string): Promise<boolean>;
  events: MeshTransportEvents;
}
