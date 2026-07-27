"use client";

/**
 * StarSeed OS — Red Mesh · ADAPTADOR MESHTASTIC (Adenda 97 · SOP §6).
 * ============================================================================
 * Puente entre StarSeed OS y los radios físicos Meshtastic mediante la
 * librería OFICIAL (`@meshtastic/core` + transportes, publicada en JSR y
 * aliada vía npm en package.json). TRES caminos de conexión reales:
 *
 *   · Web Serial      → radio por USB (Chrome/Edge; gesto del usuario)
 *   · Web Bluetooth   → radio por BLE (Chrome/Edge; gesto del usuario)
 *   · HTTP            → nodo con WiFi o `meshtasticd` local (cualquier navegador)
 *
 * La librería se carga con `import()` DINÁMICO: no pesa en el bundle inicial
 * y un fallo de carga degrada limpio a "sin radio" (el simulador sigue
 * disponible). Handshake: create → configure() → volcado de config + NodeDB →
 * `ready`. Watchdog de silencio + reconexión con backoff (solo daemon/http;
 * serial/ble re-piden el permiso SOLO bajo un nuevo gesto del usuario).
 *
 * TX: `sendPacket(bytes, PRIVATE_APP=256, dest, canal, wantAck)` con los
 * frames del codec (≤200 B). RX: `onPrivatePacket` → frames al reensamblador;
 * `onNodeInfoPacket`/`onTelemetryPacket`/`onMeshPacket` → discovery.
 *
 * SSR-safe y defensivo: NUNCA lanza hacia fuera; todos los callbacks van
 * envueltos. Nada se importa en tiempo de módulo salvo tipos propios.
 */

import {
  LINK_SILENCE_DEGRADED_MS,
  LINK_SILENCE_RECONNECT_MS,
  MESH_DAEMON_DEFAULT_URL,
  RECONNECT_BACKOFF_BASE_MS,
  RECONNECT_BACKOFF_MAX_MS,
  STARSEED_PORTNUM,
} from "./constants";
import type {
  MeshLinkStatus,
  MeshNodeInfo,
  MeshSendOptions,
  MeshSendReceipt,
  MeshTransport,
  MeshTransportEvents,
  MeshTransportKind,
} from "./types";

/* ── Tipos mínimos de la librería (duck-typing defensivo: si la versión del
      paquete cambia detalles, degradamos sin romper) ───────────────────────── */

interface DispatcherLike<T> {
  subscribe(handler: (payload: T) => void): void;
}

interface MeshDeviceLike {
  events: {
    onMyNodeInfo?: DispatcherLike<{ myNodeNum?: number }>;
    onNodeInfoPacket?: DispatcherLike<Record<string, unknown>>;
    onTelemetryPacket?: DispatcherLike<{ from?: number; data?: Record<string, unknown> }>;
    onPrivatePacket?: DispatcherLike<{
      from?: number;
      id?: number;
      data?: Uint8Array;
    }>;
    onConfigPacket?: DispatcherLike<{
      payloadVariant?: { case?: string; value?: { region?: unknown; modemPreset?: unknown } };
    }>;
    onMeshPacket?: DispatcherLike<{ from?: number; rxSnr?: number; rxRssi?: number }>;
    onRoutingPacket?: DispatcherLike<{
      // protobuf-es: el error de rutado viaja en un oneof `variant`.
      data?: { variant?: { case?: string; value?: unknown }; errorReason?: unknown } | unknown;
      from?: number;
      id?: number;
      // requestId: el packetId del paquete NUESTRO que este routing confirma.
      requestId?: number;
    }>;
    onDeviceStatus?: DispatcherLike<number>;
  };
  configure(): Promise<number>;
  sendPacket(
    byteData: Uint8Array,
    portNum: number,
    destination: number | "broadcast" | "self",
    channel?: number,
    wantAck?: boolean,
  ): Promise<number>;
  setHeartbeatInterval?(ms: number): void;
  setConfig?(config: unknown): Promise<number>;
  commitEditSettings?(): Promise<number>;
  disconnect(): Promise<void>;
}

interface AdapterOptions {
  kind: Exclude<MeshTransportKind, "simulator">;
  /** URL del daemon/nodo HTTP (solo kind "daemon"). */
  daemonUrl?: string;
  events: MeshTransportEvents;
}

/**
 * Mapa de RegionCode (protobuf) → clave de DUTY_TARGET_BY_REGION (constants.ts).
 * Números tomados del enum Config.LoRaConfig.RegionCode de @meshtastic/protobufs.
 */
const REGION_CODE_TO_KEY: Record<number, string> = {
  0: "UNSET", 1: "US", 2: "EU_433", 3: "EU_868", 4: "CN", 5: "JP", 6: "ANZ",
  7: "KR", 8: "TW", 9: "RU", 10: "IN", 11: "NZ_865", 12: "TH", 13: "LORA_24",
  14: "UA_433", 15: "UA_868", 16: "MY_433", 17: "MY_919", 18: "SG_923",
};

/** Mapa de ModemPreset (protobuf) → clave de AIRTIME_MS_PER_CHUNK_BY_PRESET. */
const PRESET_CODE_TO_KEY: Record<number, string> = {
  0: "LONG_FAST", 1: "LONG_SLOW", 3: "MEDIUM_SLOW", 4: "MEDIUM_FAST",
  5: "SHORT_SLOW", 6: "SHORT_FAST", 7: "LONG_MODERATE", 8: "SHORT_TURBO", 9: "LONG_TURBO",
};

/* ── Utilidades ────────────────────────────────────────────────────────────── */

function safeCall<T extends unknown[]>(fn: ((...a: T) => void) | undefined, ...args: T): void {
  if (!fn) return;
  try {
    fn(...args);
  } catch {
    /* */
  }
}

function toNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Normaliza un NodeInfo protobuf (duck-typed) a nuestro MeshNodeInfo parcial. */
function normalizeNodeInfo(raw: Record<string, unknown>): (Partial<MeshNodeInfo> & { num: number }) | null {
  const num = toNum(raw.num);
  if (num === undefined) return null;
  const user = (raw.user ?? {}) as Record<string, unknown>;
  const metrics = (raw.deviceMetrics ?? {}) as Record<string, unknown>;
  const position = (raw.position ?? {}) as Record<string, unknown>;
  const out: Partial<MeshNodeInfo> & { num: number } = { num };
  if (typeof user.id === "string") out.id = user.id;
  if (typeof user.longName === "string") out.longName = user.longName;
  if (typeof user.shortName === "string") out.shortName = user.shortName;
  if (typeof user.hwModel === "string") out.hwModel = user.hwModel;
  else if (typeof user.hwModel === "number") out.hwModel = String(user.hwModel);
  if (typeof user.role === "string") out.role = user.role;
  const snr = toNum(raw.snr);
  if (snr !== undefined) out.snr = snr;
  const lastHeardS = toNum(raw.lastHeard);
  if (lastHeardS !== undefined && lastHeardS > 0) out.lastHeard = lastHeardS * 1000;
  const battery = toNum(metrics.batteryLevel);
  if (battery !== undefined) out.batteryLevel = battery;
  const chUtil = toNum(metrics.channelUtilization);
  if (chUtil !== undefined) out.channelUtilization = chUtil;
  const airTx = toNum(metrics.airUtilTx);
  if (airTx !== undefined) out.airUtilTx = airTx;
  const lat = toNum(position.latitudeI);
  const lon = toNum(position.longitudeI);
  if (lat !== undefined) out.lat = lat / 1e7;
  if (lon !== undefined) out.lon = lon / 1e7;
  const hopsAway = toNum(raw.hopsAway);
  if (hopsAway !== undefined) out.hopsAway = hopsAway;
  return out;
}

/* ── Transporte real ───────────────────────────────────────────────────────── */

class MeshtasticTransport implements MeshTransport {
  readonly kind: MeshTransportKind;
  events: MeshTransportEvents;

  /** Tope de reconexiones automáticas del daemon antes de exigir gesto. */
  static readonly MAX_RECONNECTS = 6;

  private device: MeshDeviceLike | null = null;
  private status: MeshLinkStatus = "disconnected";
  private daemonUrl: string;
  private lastFrameAt = 0;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closedByUser = false;
  /** Última config LoRa cruda oída del radio (base para setModemPreset). */
  private lastLoraConfig: Record<string, unknown> | null = null;

  constructor(opts: AdapterOptions) {
    this.kind = opts.kind;
    this.events = opts.events;
    this.daemonUrl = opts.daemonUrl || MESH_DAEMON_DEFAULT_URL;
  }

  private setStatus(status: MeshLinkStatus, detail?: string): void {
    if (this.status === status) return;
    this.status = status;
    safeCall(this.events.onStatus, status, detail);
  }

  /**
   * Conecta con el radio. Serial/BLE deben llamarse desde un GESTO del
   * usuario (el navegador muestra su selector de puerto/dispositivo).
   * `isReconnect` lo usa el backoff interno (no resetea `closedByUser`, para
   * no resucitar un transporte que el usuario acaba de cerrar).
   */
  async connect(isReconnect = false): Promise<void> {
    if (typeof window === "undefined") throw new Error("mesh: solo en el navegador");
    if (!isReconnect) this.closedByUser = false;
    if (this.closedByUser) return; // el usuario cerró mientras se programaba
    this.setStatus("connecting");
    try {
      const core = await import("@meshtastic/core");
      let transport: unknown;
      if (this.kind === "serial") {
        if (!("serial" in navigator)) {
          throw new Error("Este navegador no soporta Web Serial (usa Chrome/Edge, o el transporte daemon).");
        }
        const { TransportWebSerial } = await import("@meshtastic/transport-web-serial");
        transport = await TransportWebSerial.create();
      } else if (this.kind === "ble") {
        if (!("bluetooth" in navigator)) {
          throw new Error("Este navegador no soporta Web Bluetooth (usa Chrome/Edge, o el transporte daemon).");
        }
        const { TransportWebBluetooth } = await import("@meshtastic/transport-web-bluetooth");
        transport = await TransportWebBluetooth.create();
      } else {
        const { TransportHTTP } = await import("@meshtastic/transport-http");
        const url = this.daemonUrl.replace(/^https?:\/\//, "");
        transport = await TransportHTTP.create(url, this.daemonUrl.startsWith("https"));
      }

      // El usuario pudo cerrar durante el await de import()/create().
      if (this.closedByUser) {
        try {
          await (transport as { disconnect?: () => Promise<void> })?.disconnect?.();
        } catch {
          /* */
        }
        return;
      }
      const device = new core.MeshDevice(transport as never) as unknown as MeshDeviceLike;
      this.device = device;
      this.wireEvents(device);
      this.setStatus("configuring");
      await device.configure();
      if (this.closedByUser) {
        void this.teardown();
        return;
      }
      try {
        device.setHeartbeatInterval?.(5 * 60_000);
      } catch {
        /* opcional */
      }
      this.lastFrameAt = Date.now();
      this.reconnectAttempt = 0;
      this.startWatchdog();
      this.setStatus("ready");
    } catch (e) {
      this.setStatus("error", e instanceof Error ? e.message : "No se pudo conectar con el radio.");
      this.device = null;
      throw e instanceof Error ? e : new Error("mesh: fallo de conexión");
    }
  }

  private wireEvents(device: MeshDeviceLike): void {
    const ev = device.events || ({} as MeshDeviceLike["events"]);
    try {
      ev.onMyNodeInfo?.subscribe((info) => {
        this.lastFrameAt = Date.now();
        const num = toNum(info?.myNodeNum);
        if (num !== undefined) {
          safeCall(this.events.onNode, { num, isSelf: true, lastHeard: Date.now() });
        }
      });
      ev.onNodeInfoPacket?.subscribe((raw) => {
        this.lastFrameAt = Date.now();
        const node = normalizeNodeInfo(raw || {});
        if (node) safeCall(this.events.onNode, node);
      });
      ev.onTelemetryPacket?.subscribe((pkt) => {
        this.lastFrameAt = Date.now();
        // protobuf-es: Telemetry lleva un oneof `variant` — la telemetría de
        // dispositivo es `variant.case === "deviceMetrics"`. El acceso directo
        // `data.deviceMetrics` NO existe (dejaba batería/utilización siempre
        // vacíos). Duck-typing como fallback para versiones antiguas del bridge.
        const data = pkt?.data as
          | { variant?: { case?: string; value?: unknown }; deviceMetrics?: unknown }
          | undefined;
        const variant = data?.variant;
        const metrics = (
          variant?.case === "deviceMetrics" && variant.value
            ? variant.value
            : (data?.deviceMetrics ?? data ?? {})
        ) as Record<string, unknown>;
        const from = toNum(pkt?.from);
        const patch: Partial<MeshNodeInfo> = {};
        const battery = toNum(metrics.batteryLevel);
        if (battery !== undefined) patch.batteryLevel = battery;
        const chUtil = toNum(metrics.channelUtilization);
        if (chUtil !== undefined) patch.channelUtilization = chUtil;
        const airTx = toNum(metrics.airUtilTx);
        if (airTx !== undefined) patch.airUtilTx = airTx;
        if (from !== undefined) {
          safeCall(this.events.onNode, { num: from, ...patch, lastHeard: Date.now() });
        } else {
          safeCall(this.events.onSelfTelemetry, patch);
        }
      });
      ev.onMeshPacket?.subscribe((pkt) => {
        this.lastFrameAt = Date.now();
        const from = toNum(pkt?.from);
        if (from === undefined) return;
        const patch: Partial<MeshNodeInfo> & { num: number } = { num: from, lastHeard: Date.now() };
        const snr = toNum(pkt?.rxSnr);
        if (snr !== undefined) patch.snr = snr;
        const rssi = toNum(pkt?.rxRssi);
        if (rssi !== undefined) patch.rssi = rssi;
        safeCall(this.events.onNode, patch);
      });
      ev.onPrivatePacket?.subscribe((pkt) => {
        this.lastFrameAt = Date.now();
        const data = pkt?.data;
        const from = toNum(pkt?.from);
        if (!(data instanceof Uint8Array) || from === undefined) return;
        safeCall(this.events.onAppPayload, data, {
          from,
          packetId: toNum(pkt?.id),
        });
      });
      ev.onRoutingPacket?.subscribe((pkt) => {
        this.lastFrameAt = Date.now();
        // ACK/NAK de malla correlacionado: el paquete confirmado es el
        // `requestId` (NO el id del propio routing), y es un NAK si el oneof
        // `variant` trae un errorReason distinto de NONE. Antes se reportaba
        // SIEMPRE ok=true con el id equivocado.
        const reqId = toNum(pkt?.requestId) ?? toNum(pkt?.id);
        if (reqId === undefined) return;
        const data = pkt?.data as
          | { variant?: { case?: string; value?: unknown }; errorReason?: unknown }
          | undefined;
        const variant = data?.variant;
        const errCase = variant?.case === "errorReason" ? variant.value : data?.errorReason;
        const isNak =
          errCase !== undefined &&
          errCase !== 0 &&
          errCase !== "NONE" &&
          errCase !== "ERROR_NONE";
        safeCall(this.events.onAck, reqId, !isNak);
      });
      ev.onConfigPacket?.subscribe((cfg) => {
        this.lastFrameAt = Date.now();
        // El config del radio llega como oneof payloadVariant; solo nos importa
        // el caso "lora" (región + preset del módem) para el presupuesto real.
        const pv = cfg?.payloadVariant;
        if (pv?.case !== "lora" || !pv.value) return;
        this.lastLoraConfig = { ...(pv.value as Record<string, unknown>) };
        const regionNum = toNum((pv.value as { region?: unknown }).region);
        const presetNum = toNum((pv.value as { modemPreset?: unknown }).modemPreset);
        safeCall(this.events.onLoraConfig, {
          regionKey: regionNum !== undefined ? REGION_CODE_TO_KEY[regionNum] ?? null : null,
          presetKey: presetNum !== undefined ? PRESET_CODE_TO_KEY[presetNum] ?? null : null,
        });
      });
      ev.onDeviceStatus?.subscribe(() => {
        this.lastFrameAt = Date.now();
      });
    } catch {
      /* el cableado de eventos jamás debe romper la conexión */
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      try {
        if (!this.device || this.closedByUser) return;
        const silence = Date.now() - this.lastFrameAt;
        if (silence > LINK_SILENCE_RECONNECT_MS) {
          this.setStatus("reconnecting", "silencio prolongado del radio");
          void this.scheduleReconnect();
        } else if (silence > LINK_SILENCE_DEGRADED_MS) {
          this.setStatus("degraded", "sin tramas recientes");
        } else if (this.status === "degraded") {
          this.setStatus("ready");
        }
      } catch {
        /* */
      }
    }, 15_000);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private async scheduleReconnect(): Promise<void> {
    // Solo el transporte daemon/HTTP puede reconectar SOLO (sin gesto). Serial y
    // BLE exigen un nuevo gesto del usuario (no se puede re-abrir el puerto solo).
    if (this.kind !== "daemon") {
      this.setStatus("error", "Conexión perdida. Reconecta el radio (gesto del usuario).");
      await this.teardown();
      return;
    }
    if (this.reconnectTimer || this.closedByUser) return;
    // TOPE de reintentos: cada TransportHTTP nuevo trae su propio polling de 3 s
    // que NO se puede parar (la lib no implementa disconnect() para HTTP), así
    // que un bucle de reconexión infinito acumularía pollers huérfanos. Tras
    // MAX_RECONNECTS pedimos gesto del usuario en vez de seguir creando pollers.
    if (this.reconnectAttempt >= MeshtasticTransport.MAX_RECONNECTS) {
      this.setStatus("error", "No se pudo reconectar tras varios intentos. Reconecta manualmente.");
      await this.teardown();
      return;
    }
    const backoff = Math.min(
      RECONNECT_BACKOFF_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_BACKOFF_MAX_MS,
    );
    const jitter = backoff * (0.8 + Math.random() * 0.4);
    this.reconnectAttempt += 1;
    await this.teardown(false);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUser) return;
      void this.connect(true).catch(() => void this.scheduleReconnect());
    }, jitter);
  }

  private async teardown(clearStatus = true): Promise<void> {
    this.stopWatchdog();
    const device = this.device;
    this.device = null;
    if (device) {
      try {
        await device.disconnect();
      } catch {
        /* */
      }
    }
    if (clearStatus) this.setStatus("disconnected");
  }

  async disconnect(): Promise<void> {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.teardown();
  }

  /**
   * (Adenda 98) Aplica un PRESET DE MÓDEM real al radio: reconstruye la config
   * LoRa cacheada (para no pisar región/potencia) con el nuevo preset y la
   * escribe con setConfig + commitEditSettings. El radio puede reiniciar su
   * enlace unos segundos (el watchdog lo cubre). Best-effort: nunca lanza.
   */
  async setModemPreset(presetKey: string): Promise<boolean> {
    const device = this.device;
    if (!device?.setConfig || (this.status !== "ready" && this.status !== "degraded")) return false;
    const presetNum = Object.entries(PRESET_CODE_TO_KEY).find(([, k]) => k === presetKey)?.[0];
    if (presetNum === undefined) return false;
    try {
      // @meshtastic/protobufs es protobuf-es v2: los mensajes se crean con
      // `create(Schema, init)` de @bufbuild/protobuf — `Config` es SOLO un tipo
      // (el valor runtime es `ConfigSchema`). Partimos de la config LoRa REAL
      // cacheada (onConfigPacket) para NO pisar región/canal/potencia; solo
      // cambia modemPreset (+usePreset). El init es un objeto plano (la lib lo
      // valida contra el schema), así que no necesitamos instanciar un mensaje
      // anidado — pasamos los campos crudos ya normalizados de lastLoraConfig.
      const { create } = await import("@bufbuild/protobuf");
      const core = await import("@meshtastic/core");
      const ConfigSchema = (core as unknown as {
        Protobuf?: { Config?: { ConfigSchema?: unknown } };
      }).Protobuf?.Config?.ConfigSchema;
      if (!ConfigSchema) return false;
      // Copia superficial de la config LoRa cruda (sin metacampos internos de
      // protobuf como $typeName/$unknown, que romperían `create`).
      const base: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(this.lastLoraConfig ?? {})) {
        if (!k.startsWith("$")) base[k] = v;
      }
      base.usePreset = true;
      base.modemPreset = Number(presetNum);
      const cfg = create(ConfigSchema as never, {
        payloadVariant: { case: "lora", value: base },
      } as never);
      await device.setConfig(cfg as never);
      await device.commitEditSettings?.();
      safeCall(this.events.onLoraConfig, {
        regionKey: null, // la región no cambió (solo re-informamos el preset)
        presetKey,
      });
      return true;
    } catch {
      return false;
    }
  }

  async send(bytes: Uint8Array, opts: MeshSendOptions): Promise<MeshSendReceipt> {
    const device = this.device;
    if (!device || (this.status !== "ready" && this.status !== "degraded")) {
      return { ok: false, error: "radio no conectada" };
    }
    try {
      const packetId = await device.sendPacket(
        bytes,
        opts.portNum ?? STARSEED_PORTNUM,
        opts.dest ?? "broadcast",
        opts.channel ?? 0,
        !!opts.wantAck,
      );
      return { ok: true, packetId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fallo de TX" };
    }
  }
}

/** Crea un transporte REAL (serial · ble · daemon). El simulador vive aparte. */
export function createMeshtasticTransport(
  kind: Exclude<MeshTransportKind, "simulator">,
  events: MeshTransportEvents,
  opts?: { daemonUrl?: string },
): MeshTransport {
  return new MeshtasticTransport({ kind, events, daemonUrl: opts?.daemonUrl });
}
