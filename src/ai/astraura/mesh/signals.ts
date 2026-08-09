"use client";

/**
 * StarSeed OS — SEÑALES: inventario VIVO de antenas de la neurona (Adenda 99b).
 * ============================================================================
 * Detecta AUTOMÁTICAMENTE y EN TIEMPO REAL, por cada neurona (dispositivo) de
 * cada sesión de perfil, todas las vías de emisión/recepción que el navegador
 * expone de verdad — y dice con HONESTIDAD RADICAL cuáles controla el OS y
 * cuáles son solo informativas:
 *
 *   · Malla P2P (LoRa)  — el radio conectado emite/recibe SIN operadores. REAL.
 *   · GPS               — navigator.geolocation (posición con permiso). REAL.
 *   · Bluetooth / BLE   — Web Bluetooth (conectar radios/periféricos). REAL.
 *   · Serie / USB       — Web Serial (radios LoRa por USB). REAL.
 *   · NFC               — Web NFC (leer/escribir etiquetas; Android). REAL.
 *   · Wi-Fi             — estado/tipo/velocidad de la conexión (Network Info).
 *                         El navegador NO escanea redes ni cambia de banda.
 *   · Datos celulares   — tipo de conexión (2G–5G) si el SO lo reporta.
 *                         NO controlable desde la web.
 *   · Telefonía (voz)   — NO existe API web: puramente informativo.
 *
 * No fingimos emitir por antenas que la plataforma no expone (sería falso y,
 * para Wi-Fi/celular, vigilancia que la web prohíbe). SSR-safe. NUNCA lanza.
 */

import { estimateDistanceMeters, REGION_BANDS } from "./antennas";
import { bluetoothLink, externalLink, serialLink } from "./connectivity";
import type { MeshState } from "./types";

export type SignalKind =
  | "mesh" | "wifi" | "cellular" | "bluetooth" | "gps" | "nfc" | "serial" | "telephony";

/** active=en uso · available=lista para usar · unsupported=sin API · off=apagada · info=solo informativa. */
export type SignalStatus = "active" | "available" | "unsupported" | "off" | "info";

export interface SignalSource {
  kind: SignalKind;
  label: string;
  status: SignalStatus;
  /** Detalle honesto para la UI (estado real / limitación). */
  detail: string;
  /** ¿El OS emite/recibe de verdad por aquí, o es solo lectura/informativo? */
  controllable: boolean;
  /** Banda(s)/frecuencia real. */
  bands?: string;
  /** Acciones rápidas sugeridas (las resuelve la UI). */
  actions: string[];
  meta?: Record<string, unknown>;
}

/** Estado de permiso de una API que lo expone (geolocalización, etc.). */
async function permissionState(name: string): Promise<string | null> {
  try {
    if (typeof navigator === "undefined") return null;
    const perms = (navigator as Navigator & { permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
    if (!perms?.query) return null;
    const r = await perms.query({ name } as { name: string });
    return r?.state ?? null;
  } catch {
    return null; // algunos navegadores lanzan si el nombre no es soportado
  }
}

/** Malla LoRa: la única telecom real sin operadores (radio conectado). */
function meshSignal(s: MeshState): SignalSource {
  const ready = s.status === "ready" || s.status === "degraded";
  const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
  const band = REGION_BANDS[s.region] ?? REGION_BANDS.UNSET;
  return {
    kind: "mesh",
    label: "Malla P2P (LoRa)",
    status: ready ? "active" : "available",
    detail: ready
      ? `${online} nodo${online === 1 ? "" : "s"} al alcance · telecom sin operadores`
      : "Sin radio conectado — conecta uno (USB/BLE/daemon) para la malla directa",
    controllable: true,
    bands: `${band.freqStartMhz}–${band.freqEndMhz} MHz (${band.key})`,
    actions: ["Abrir Red Mesh", "Conectar radio"],
    meta: { ready, online, region: s.region },
  };
}

/** Wi-Fi: estado de la conexión activa (no escaneo, no control de banda). */
function wifiSignal(): SignalSource {
  const ext = externalLink();
  const m = ext.meta ?? {};
  const type = m.type as string | undefined;
  const online = m.online !== false && ext.availability === "active";
  // Honesto: la Network Information API casi nunca expone `type` (undefined en
  // escritorio, ausente en Safari/Firefox). NO afirmamos "Wi-Fi activa" a menos
  // que el navegador lo confirme; si no, decimos que hay red externa pero que no
  // sabemos si es Wi-Fi (y que jamás escaneamos redes: sería vigilancia).
  const confirmedWifi = type === "wifi";
  // La Wi-Fi SÍ sirve a la malla: lleva el mesh por IP (TCP/HTTP) a un nodo
  // Meshtastic de tu red local. El navegador no controla la antena Wi-Fi, pero
  // "available" = usable como vía de malla. Para Wi-Fi directo/local → app nativa.
  const status: SignalStatus = !online ? "off" : "available";
  return {
    kind: "wifi",
    label: "Wi-Fi",
    status,
    detail: !online
      ? "Sin red externa activa"
      : `${confirmedWifi ? ext.detail : "Red externa activa"} · lleva la malla por IP a un nodo Meshtastic de tu red (TCP); Wi-Fi directo/local → app nativa`,
    controllable: false,
    bands: "2,4 / 5 / 6 GHz",
    actions: online ? ["Conectar nodo Wi-Fi", "App nativa"] : ["App nativa"],
    meta: m,
  };
}

/** Datos celulares: tipo de conexión (2G–5G) si el SO lo reporta. No controlable. */
function cellularSignal(): SignalSource {
  const ext = externalLink();
  const m = ext.meta ?? {};
  const type = m.type as string | undefined;
  const eff = m.effectiveType as string | undefined;
  const isCellular = type === "cellular";
  return {
    kind: "cellular",
    label: "Datos celulares",
    status: isCellular ? "available" : eff ? "info" : "unsupported",
    detail: isCellular
      ? `Datos móviles${eff ? ` (${eff.toUpperCase()})` : ""} · llevan la malla por IP (MQTT/servidor) a larga distancia; antena directa → app nativa`
      : eff
        ? `Conexión ${eff.toUpperCase()} activa · puede llevar la malla por IP; antena de datos directa → app nativa`
        : "El navegador no expone la antena celular · úsala para la malla vía app nativa",
    controllable: false,
    bands: "700 MHz – 3,5 GHz (operador)",
    actions: ["App nativa"],
    meta: m,
  };
}

/** Bluetooth / BLE: Web Bluetooth (conectar radios/periféricos con gesto). */
function bluetoothSignal(): SignalSource {
  const bt = bluetoothLink();
  const supported = bt.availability !== "unsupported";
  return {
    kind: "bluetooth",
    label: "Bluetooth / BLE",
    status: supported ? "available" : "unsupported",
    detail: bt.detail,
    controllable: supported,
    bands: "2,4 GHz",
    actions: supported ? ["Conectar por BLE"] : [],
    meta: bt.meta,
  };
}

/** Serie / USB: Web Serial + puertos autorizados (radios LoRa por USB). */
async function serialSignal(): Promise<SignalSource> {
  const s = await serialLink();
  const supported = s.availability !== "unsupported";
  return {
    kind: "serial",
    label: "Serie / USB",
    status: s.availability,
    detail: s.detail,
    controllable: supported,
    bands: "radio LoRa por USB",
    actions: supported ? ["Conectar radio USB"] : [],
    meta: s.meta,
  };
}

/** GPS: geolocalización del navegador (posición real con permiso). */
async function gpsSignal(): Promise<SignalSource> {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  if (!supported) {
    return { kind: "gps", label: "GPS / Ubicación", status: "unsupported", detail: "Geolocalización no soportada", controllable: false, bands: "GNSS 1,2–1,6 GHz", actions: [], meta: { supported: false } };
  }
  const perm = await permissionState("geolocation");
  const status: SignalStatus = perm === "granted" ? "active" : perm === "denied" ? "off" : "available";
  return {
    kind: "gps",
    label: "GPS / Ubicación",
    status,
    detail:
      perm === "granted" ? "Permiso concedido · ubica los nodos en el mapa/radar"
      : perm === "denied" ? "Permiso denegado (actívalo en el navegador)"
      : "Disponible · pedirá permiso para ubicar",
    controllable: true,
    bands: "GNSS 1,2–1,6 GHz",
    actions: status !== "off" ? ["Ubicar esta neurona"] : [],
    meta: { supported: true, permission: perm },
  };
}

/** NFC: Web NFC (leer/escribir etiquetas; Chrome en Android). */
function nfcSignal(): SignalSource {
  const supported = typeof window !== "undefined" && "NDEFReader" in window;
  return {
    kind: "nfc",
    label: "NFC",
    status: supported ? "available" : "unsupported",
    detail: supported
      ? "Web NFC disponible (leer/escribir etiquetas de proximidad)"
      : "Web NFC no soportado (disponible en Chrome Android)",
    controllable: supported,
    bands: "13,56 MHz",
    actions: supported ? ["Leer etiqueta NFC"] : [],
    meta: { supported },
  };
}

/** Telefonía (voz): no existe API web — puramente informativo. */
function telephonySignal(): SignalSource {
  return {
    kind: "telephony",
    label: "Telefonía (voz)",
    status: "info",
    detail: "Sin API web de telefonía: informativo. La voz soberana viaja por la malla/servidor, no por operador",
    controllable: false,
    bands: "700 MHz – 2,6 GHz (operador)",
    actions: [],
    meta: {},
  };
}

/**
 * detectSignals — inventario completo y VIVO de las antenas de esta neurona.
 * Orden: primero lo que el OS controla de verdad (malla, GPS, BLE, serie, NFC),
 * luego lo informativo (Wi-Fi, celular, telefonía). Nunca lanza.
 */
export async function detectSignals(s: MeshState): Promise<SignalSource[]> {
  const [serial, gps] = await Promise.all([serialSignal(), gpsSignal()]);
  return [
    meshSignal(s),
    gps,
    bluetoothSignal(),
    serial,
    nfcSignal(),
    wifiSignal(),
    cellularSignal(),
    telephonySignal(),
  ];
}

/** Nº de antenas que el OS controla de verdad ahora (para un indicador). */
export function controllableCount(list: SignalSource[]): number {
  return list.filter((x) => x.controllable && (x.status === "active" || x.status === "available")).length;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * INVENTARIO REAL MULTI-ANTENA — señales DETECTADAS (Adenda 150).
 * ═══════════════════════════════════════════════════════════════════════════
 * Lo anterior describe las ANTENAS de esta neurona (qué puede emitir/recibir).
 * Lo que sigue describe las SEÑALES que esas antenas están OYENDO ahora mismo,
 * vengan de donde vengan, sean o no compatibles con StarSeed:
 *
 *   · lora    — nodos Meshtastic del radio conectado (SNR/RSSI/GPS/saltos).
 *   · relay   — faros de la red sináptica (neuronas StarSeed vía servidor).
 *   · account — neuronas registradas de TU cuenta (neuron_devices) + las
 *               instantáneas federadas de su malla (remoteTopologies).
 *   · ip      — la red externa medida (router Wi-Fi/Ethernet/datos).
 *   · ble     — dispositivos Bluetooth LE oídos en un escaneo con gesto.
 *   · serial  — puertos USB ya autorizados por el usuario (radios/adaptadores).
 *
 * HONESTIDAD RADICAL: cada señal declara DE DÓNDE sale cada dato y con QUÉ
 * incertidumbre. Nada se inventa: si no hay posición, se dice y se pinta un
 * halo de precisión GRANDE; si no hay métrica de calidad, `quality` es null.
 * Determinista: el ángulo sin GPS sale de un hash del id (jamás Math.random).
 */

/** Familia de antena por la que llega la señal. */
export type AntennaKind = "lora" | "relay" | "account" | "ip" | "ble" | "serial";

export const ANTENNA_LABEL: Record<AntennaKind, string> = {
  lora: "Malla LoRa (Meshtastic)",
  relay: "Relé StarSeed (red sináptica)",
  account: "Neuronas de tu cuenta",
  ip: "Red IP (router / datos)",
  ble: "Bluetooth LE",
  serial: "Serie / USB",
};

export const ANTENNA_COLOR: Record<AntennaKind, string> = {
  lora: "#34d399",
  relay: "#f472b6",
  account: "#c084fc",
  ip: "#38bdf8",
  ble: "#60a5fa",
  serial: "#94a3b8",
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * SECTOR del radar por familia de antena (radianes; 0 = este, −π/2 = arriba).
 * Sin posición real, una señal se coloca DENTRO del sector de su antena — así
 * el radar se lee como una rosa de antenas y jamás finge un rumbo. Los sectores
 * NO se solapan (si lo hicieran, un blip mentiría sobre por qué antena llega):
 *   lora [−120,−60] · serial [−57,−33] · ble [−12,12] · ip [30,60] ·
 *   relay [70,110] · account [113,157]
 * Los huecos alojan los ejes de las antenas locales sin señales propias
 * (GPS a 180°, NFC a −147°, telefonía a −123°).
 */
export const ANTENNA_SECTOR: Record<AntennaKind, { center: number; half: number }> = {
  lora: { center: rad(-90), half: rad(30) },   // arriba, sector ancho (antena principal)
  serial: { center: rad(-45), half: rad(12) },
  ble: { center: rad(0), half: rad(12) },
  ip: { center: rad(45), half: rad(15) },
  relay: { center: rad(90), half: rad(20) },
  account: { center: rad(135), half: rad(22) },
};

/** Cómo se obtuvo la posición pintada — determina el tamaño del halo. */
export type PlacementMode = "gps" | "rf" | "sector";

export interface SignalPlacement {
  /** Ángulo en el radar (rad). Real solo en modo "gps". */
  angleRad: number;
  /** Distancia al centro como fracción del radio del radar (0..1). */
  radiusFrac: number;
  /** Radio del HALO de incertidumbre, misma escala (0..1). */
  accuracyFrac: number;
  mode: PlacementMode;
  /** Distancia estimada en metros (null si el dato no existe en metros). */
  distanceM: number | null;
  /** Incertidumbre en metros (null si no es medible en metros). */
  accuracyM: number | null;
  /** Explicación honesta de la colocación, para la leyenda y la ficha. */
  detail: string;
}

/** Una métrica REAL con su unidad, tal cual la dio la fuente. */
export interface SignalMetric {
  label: string;
  value: string;
}

/** Acción ejecutable (o explícitamente no ejecutable, con su porqué). */
export interface SignalActionKind {
  id:
    | "open-mesh" | "connect-serial" | "connect-ble" | "connect-daemon" | "connect-wifi-node"
    | "sync-now" | "add-server" | "open-neurons" | "locate-me" | "scan-ble" | "none";
  label: string;
  enabled: boolean;
  /** Por qué NO se puede (o qué hará exactamente). Siempre honesto. */
  hint?: string;
}

/** Datos PÚBLICOS de la cuenta StarSeed vinculada a la señal (nada privado). */
export interface StarseedIdentity {
  /** Fuente VERIFICADA del vínculo (cada una tiene su propio espacio de ids). */
  via: "neuron-registry" | "federation" | "relay-beacon";
  /** Id del registro de origen (opaco). */
  sourceId: string;
  name: string | null;
  /** ¿Pertenece a TU cuenta (verificado por el servidor) o es de otra? */
  ownAccount: boolean;
  platform?: string;
  deviceKind?: string;
  online?: boolean;
  lastSeenMs?: number | null;
  /** Capacidades PÚBLICAS declaradas (etiquetas ya derivadas, sin datos privados). */
  capabilities: string[];
  /** deviceId del motor de sync (destino de peticiones entre neuronas). */
  syncDeviceId?: string;
  /** Región LoRa / preset de módem anunciados (solo faros y federación). */
  region?: string | null;
  preset?: string | null;
  /** Nodos que esa neurona ve en su malla. */
  onlineCount?: number;
  /** Ofrece internet público del OS con sus recursos + puerto anunciado. */
  offersPublic?: boolean;
  port?: number;
}

/** Una señal DETECTADA, con todo lo que se sabe de ella de verdad. */
export interface DetectedSignal {
  /** Id único y estable (prefijo de fuente + id nativo). */
  id: string;
  antenna: AntennaKind;
  antennaLabel: string;
  /** Tipo de señal concreto ("LoRa · Meshtastic", "BLE advertising"…). */
  signalType: string;
  label: string;
  detail: string;
  /** Calidad normalizada 0..1, o null si la fuente NO da ninguna métrica. */
  quality: number | null;
  /** De dónde sale la calidad, con sus números reales. */
  qualityDetail: string;
  /** Métricas crudas reales (dB, dBm, ms, saltos…). */
  metrics: SignalMetric[];
  /** ¿Habla un protocolo que esta neurona puede usar (malla/relé/sync)? */
  compatible: boolean;
  /** Qué significa esa compatibilidad (o su ausencia) en términos prácticos. */
  compatDetail: string;
  starseed: StarseedIdentity | null;
  placement: SignalPlacement;
  /** Última vez oída (epoch ms) o null si la fuente no lo expone. */
  lastHeard: number | null;
  actions: SignalActionKind[];
  /** true SOLO si viene del simulador de la malla (se etiqueta en la UI). */
  simulated: boolean;
  color: string;
}

/* ── Normalizaciones de calidad (reales, con sus rangos declarados) ────────── */

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** SNR LoRa (dB) → 0..1. −20 dB = límite de demodulación · +10 dB = excelente. */
export function qualityFromSnr(snr: number): number {
  return clamp01((snr + 20) / 30);
}

/** RSSI (dBm) → 0..1. −110 dBm = al límite · −40 dBm = pegado. */
export function qualityFromRssi(rssi: number): number {
  return clamp01((rssi + 110) / 70);
}

/** RTT (ms) → 0..1 en escala log. 20 ms = excelente · 1000 ms = pésimo. */
export function qualityFromRtt(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0.5;
  const lo = Math.log10(20), hi = Math.log10(1000);
  return clamp01(1 - (Math.log10(Math.max(20, Math.min(1000, ms))) - lo) / (hi - lo));
}

/** Frescura: oído hace `ageMs` sobre una ventana → 1 (recién) … 0 (caducado). */
export function qualityFromAge(ageMs: number, windowMs: number): number {
  if (!Number.isFinite(ageMs) || windowMs <= 0) return 0;
  return clamp01(1 - ageMs / windowMs);
}

/* ── Colocación en el radar + ANILLO DE PRECISIÓN ──────────────────────────── */

/** Distancia (m) → fracción de radio del radar (log: 30 m→0,16 · 6 km→0,92). */
export function radiusFracForMeters(m: number): number {
  const lo = Math.log10(30), hi = Math.log10(6000);
  const f = (Math.log10(Math.max(30, Math.min(6000, m))) - lo) / (hi - lo);
  return 0.16 + f * 0.76;
}

/** Hash entero determinista (sin Math.random) → 0..1 estable por cadena. */
export function stableHash01(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % 100000) / 100000;
}

/** Ángulo determinista DENTRO del sector de la antena (jitter estable por id). */
function sectorAngle(antenna: AntennaKind, seed: string): number {
  const s = ANTENNA_SECTOR[antenna];
  // −0,84…+0,84 del semiancho: reparte sin pegarse a los bordes del sector.
  return s.center + (stableHash01(seed) * 2 - 1) * s.half * 0.84;
}

/**
 * placeByPosition — POSICIÓN REAL (GPS de ambos extremos): rumbo y distancia
 * verdaderos, halo PEQUEÑO (la incertidumbre del GPS, no del modelo).
 */
function placeByPosition(
  lat: number, lon: number, lat0: number, lon0: number, accuracyM: number,
): SignalPlacement {
  const dx = (lon - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const dz = (lat - lat0) * 110_540;
  const meters = Math.max(10, Math.hypot(dx, dz));
  const rf = radiusFracForMeters(meters);
  const outer = radiusFracForMeters(Math.max(30, meters + accuracyM));
  const inner = radiusFracForMeters(Math.max(30, meters - accuracyM));
  return {
    // El eje Y del SVG crece HACIA ABAJO: sin negar `dz`, un vecino al NORTE se
    // dibujaba al SUR (el radar quedaba espejado en vertical). Se niega aquí para
    // que arriba sea el norte real.
    angleRad: Math.atan2(-dz, dx),
    radiusFrac: rf,
    accuracyFrac: Math.max(0.018, (outer - inner) / 2),
    mode: "gps",
    distanceM: Math.round(meters),
    accuracyM: Math.round(accuracyM),
    detail: `Posición GPS real de ambos extremos · rumbo y distancia verdaderos (±${Math.round(accuracyM)} m)`,
  };
}

/**
 * placeByRf — DISTANCIA real por radiofrecuencia (modelo log-distancia sobre el
 * SNR), RUMBO DESCONOCIDO: se coloca dentro del sector de su antena y el halo
 * crece con la incertidumbre del modelo (peor señal ⇒ halo mayor).
 */
function placeByRf(antenna: AntennaKind, seed: string, meters: number, quality: number | null): SignalPlacement {
  const q = quality == null ? 0.35 : quality;
  // El modelo log-distancia tiene un error de ~×1,6 con buena señal y ~×2,6 con
  // mala. Lo declaramos en metros, no lo escondemos.
  const factor = 1.6 + (1 - q) * 1.0;
  const outer = radiusFracForMeters(Math.min(6000, meters * factor));
  const inner = radiusFracForMeters(Math.max(30, meters / factor));
  return {
    angleRad: sectorAngle(antenna, seed),
    radiusFrac: radiusFracForMeters(meters),
    accuracyFrac: Math.max(0.035, (outer - inner) / 2),
    mode: "rf",
    distanceM: Math.round(meters),
    accuracyM: Math.round(meters * (factor - 1)),
    detail: `Distancia estimada por RF (modelo log-distancia sobre el SNR): entre ${fmtMeters(meters / factor)} y ${fmtMeters(meters * factor)}. El RUMBO es desconocido: se sitúa en el sector de su antena.`,
  };
}

/**
 * placeBySector — SIN posición NI distancia física: se coloca en el sector de su
 * antena a una distancia derivada de la CALIDAD (mejor señal ⇒ más cerca) y con
 * un halo GRANDE, porque la posición real es desconocida.
 */
function placeBySector(antenna: AntennaKind, seed: string, quality: number | null): SignalPlacement {
  const q = quality == null ? 0 : quality;
  const rf = 0.3 + (1 - q) * 0.55;
  return {
    angleRad: sectorAngle(antenna, seed),
    radiusFrac: rf,
    accuracyFrac: 0.16 + (1 - q) * 0.2,
    mode: "sector",
    distanceM: null,
    accuracyM: null,
    detail:
      quality == null
        ? "Sin posición ni métrica de distancia: se sitúa en el sector de su antena con el halo de incertidumbre máximo."
        : "Sin posición: se sitúa en el sector de su antena y la distancia al centro solo refleja la CALIDAD de la señal (no metros).",
  };
}

function fmtMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/* ── Escaneo BLE real (Web Bluetooth · exige gesto del usuario) ────────────── */

export type BleScanSupport = "scan" | "picker" | "unsupported" | "unknown";

/** Un anuncio BLE REAL oído por el navegador. */
export interface BleDetection {
  /** Id opaco del dispositivo (estable por origen; NO es la MAC). */
  id: string;
  name: string | null;
  /** RSSI en dBm si el anuncio lo trae (el selector de dispositivo NO lo da). */
  rssi: number | null;
  txPower: number | null;
  uuids: string[];
  at: number;
  /** true = vino del SELECTOR de dispositivo (sin RSSI), no del escaneo continuo. */
  viaPicker: boolean;
}

export interface BleScanState {
  support: BleScanSupport;
  /** ¿Hay adaptador Bluetooth disponible? (getAvailability). null = no consultado. */
  adapter: boolean | null;
  scanning: boolean;
  detections: BleDetection[];
  error: string | null;
  /** Explicación honesta del estado actual, lista para la UI. */
  detail: string;
}

interface BluetoothLike {
  getAvailability?: () => Promise<boolean>;
  requestLEScan?: (o: Record<string, unknown>) => Promise<{ active: boolean; stop: () => void }>;
  requestDevice?: (o: Record<string, unknown>) => Promise<{ id?: string; name?: string | null }>;
  addEventListener?: (t: string, cb: (e: unknown) => void) => void;
  removeEventListener?: (t: string, cb: (e: unknown) => void) => void;
}

function bt(): BluetoothLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth ?? null;
}

/** Máximo de dispositivos BLE retenidos (el anuncio se repite sin parar). */
const BLE_MAX = 60;
/** Un anuncio más viejo que esto deja de considerarse "oído ahora". */
export const BLE_FRESH_MS = 60_000;

let bleState: BleScanState = {
  support: "unknown",
  adapter: null,
  scanning: false,
  detections: [],
  error: null,
  detail: "Sin escanear · el navegador solo permite oír BLE tras un gesto tuyo",
};
const bleListeners = new Set<(s: BleScanState) => void>();
let bleScanHandle: { stop: () => void } | null = null;
let bleAdListener: ((e: unknown) => void) | null = null;

function setBle(patch: Partial<BleScanState>): void {
  bleState = { ...bleState, ...patch };
  for (const l of bleListeners) {
    try { l(bleState); } catch { /* un listener roto no tumba al resto */ }
  }
}

export function getBleScanState(): BleScanState {
  return bleState;
}

export function subscribeBleScan(cb: (s: BleScanState) => void): () => void {
  bleListeners.add(cb);
  return () => { bleListeners.delete(cb); };
}

/**
 * probeBleSupport — averigua SIN gesto qué se puede hacer de verdad aquí:
 * escaneo continuo (`requestLEScan`), solo selector (`requestDevice`) o nada.
 * También consulta si hay adaptador encendido. Nunca lanza.
 */
export async function probeBleSupport(): Promise<BleScanState> {
  const b = bt();
  if (!b) {
    setBle({
      support: "unsupported", adapter: false, scanning: false,
      detail: "Web Bluetooth no existe en este navegador (Safari y Firefox no lo implementan). Para oír BLE usa Chrome/Edge de escritorio o Android, o la app nativa.",
    });
    return bleState;
  }
  let adapter: boolean | null = null;
  try { adapter = (await b.getAvailability?.()) ?? null; } catch { adapter = null; }
  const support: BleScanSupport = typeof b.requestLEScan === "function"
    ? "scan"
    : typeof b.requestDevice === "function" ? "picker" : "unsupported";
  setBle({
    support,
    adapter,
    detail:
      support === "scan"
        ? adapter === false
          ? "Escaneo BLE disponible, pero el adaptador Bluetooth está apagado o ausente."
          : "Escaneo BLE continuo disponible · pulsa «Escanear BLE» (el navegador exige un gesto tuyo)."
        : support === "picker"
          ? "Este navegador no expone el escaneo continuo (requestLEScan). Solo el SELECTOR de dispositivos: verás el dispositivo que elijas, SIN RSSI. Actívalo en chrome://flags/#enable-experimental-web-platform-features para el escaneo con potencia."
          : "Web Bluetooth presente pero sin API de escaneo ni selector en este navegador.",
  });
  return bleState;
}

/**
 * startBleScan — LLAMAR SIEMPRE DESDE UN GESTO DEL USUARIO. Usa el escaneo
 * continuo si existe (da RSSI real por anuncio); si no, cae al selector de
 * dispositivo (un dispositivo, sin RSSI) y lo DICE. Nunca lanza.
 */
export async function startBleScan(): Promise<BleScanState> {
  const b = bt();
  if (!b) return probeBleSupport();
  if (bleState.scanning) return bleState;
  setBle({ error: null });

  if (typeof b.requestLEScan === "function") {
    try {
      const handle = await b.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true });
      bleScanHandle = handle;
      bleAdListener = (e: unknown) => {
        try {
          const ev = e as {
            device?: { id?: string; name?: string | null };
            rssi?: number; txPower?: number; uuids?: string[];
          };
          const id = String(ev.device?.id ?? "");
          if (!id) return;
          const det: BleDetection = {
            id,
            name: ev.device?.name ?? null,
            rssi: typeof ev.rssi === "number" && Number.isFinite(ev.rssi) ? ev.rssi : null,
            txPower: typeof ev.txPower === "number" && Number.isFinite(ev.txPower) ? ev.txPower : null,
            uuids: Array.isArray(ev.uuids) ? ev.uuids.map(String).slice(0, 8) : [],
            at: Date.now(),
            viaPicker: false,
          };
          const rest = bleState.detections.filter((d) => d.id !== id);
          rest.unshift(det);
          setBle({ detections: rest.slice(0, BLE_MAX) });
        } catch { /* un anuncio malformado no rompe el escaneo */ }
      };
      b.addEventListener?.("advertisementreceived", bleAdListener);
      setBle({
        support: "scan", scanning: true, error: null,
        detail: "Escaneando BLE · cada anuncio trae RSSI real (dBm). El navegador NO da la MAC ni la posición.",
      });
      return bleState;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "escaneo BLE rechazado";
      setBle({ scanning: false, error: msg, detail: `No se pudo iniciar el escaneo BLE: ${msg}` });
      // Sin escaneo continuo intentamos el selector (sí soportado casi siempre).
    }
  }

  if (typeof b.requestDevice === "function") {
    try {
      const dev = await b.requestDevice({ acceptAllDevices: true, optionalServices: [] });
      const id = String(dev?.id ?? "");
      if (id) {
        const det: BleDetection = {
          id, name: dev?.name ?? null, rssi: null, txPower: null, uuids: [],
          at: Date.now(), viaPicker: true,
        };
        const rest = bleState.detections.filter((d) => d.id !== id);
        rest.unshift(det);
        setBle({
          support: bleState.support === "scan" ? "scan" : "picker",
          detections: rest.slice(0, BLE_MAX),
          error: null,
          detail: "Dispositivo elegido en el selector del navegador · SIN RSSI (esa API no lo expone): su distancia en el radar NO es medible.",
        });
      }
      return bleState;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "selección cancelada";
      setBle({ scanning: false, error: msg, detail: `Sin dispositivos BLE: ${msg}` });
      return bleState;
    }
  }
  return probeBleSupport();
}

/** Detiene el escaneo BLE y suelta el listener. Nunca lanza. */
export function stopBleScan(): void {
  try { bleScanHandle?.stop(); } catch { /* */ }
  bleScanHandle = null;
  const b = bt();
  if (b && bleAdListener) {
    try { b.removeEventListener?.("advertisementreceived", bleAdListener); } catch { /* */ }
  }
  bleAdListener = null;
  setBle({
    scanning: false,
    detail: bleState.detections.length
      ? `Escaneo detenido · ${bleState.detections.length} dispositivo(s) oídos (los datos se congelan)`
      : "Escaneo detenido · sin dispositivos oídos",
  });
}

/* ── Puertos serie ya autorizados (radios/adaptadores USB reales) ──────────── */

export interface SerialPortView {
  /** Índice del puerto en la lista autorizada (el navegador no da id estable). */
  index: number;
  usbVendorId: number | null;
  usbProductId: number | null;
}

/** Lee los puertos serie YA autorizados por el usuario. Nunca lanza. */
export async function listAuthorizedSerialPorts(): Promise<SerialPortView[]> {
  try {
    const s = (navigator as Navigator & { serial?: { getPorts?: () => Promise<unknown[]> } }).serial;
    const list = await s?.getPorts?.();
    if (!Array.isArray(list)) return [];
    return list.map((p, index) => {
      let usbVendorId: number | null = null;
      let usbProductId: number | null = null;
      try {
        const info = (p as { getInfo?: () => { usbVendorId?: number; usbProductId?: number } }).getInfo?.();
        if (typeof info?.usbVendorId === "number") usbVendorId = info.usbVendorId;
        if (typeof info?.usbProductId === "number") usbProductId = info.usbProductId;
      } catch { /* algunos navegadores no exponen getInfo */ }
      return { index, usbVendorId, usbProductId };
    });
  } catch {
    return [];
  }
}

/* ── Entradas del agregador (formas mínimas: sin acoplar módulos) ──────────── */

/** Faro de la red sináptica (forma mínima de `RelayBeacon`). */
export interface BeaconView {
  deviceId: string;
  label: string | null;
  region: string | null;
  preset: string | null;
  onlineCount: number;
  at: number;
  own: boolean;
  offersPublic?: boolean;
  port?: number;
}

/** Vista PÚBLICA de una neurona de la cuenta (subconjunto de `Neuron`). */
export interface AccountNeuronView {
  id: string;
  name: string;
  kind: string;
  online: boolean;
  lastSeenMs: number | null;
  platform?: string;
  browser?: string;
  syncDeviceId?: string;
  /** Etiquetas de capacidad ya derivadas (públicas). */
  capabilities: string[];
  isThisDevice: boolean;
}

export interface DetectedSignalsInput {
  mesh: MeshState;
  /** Faros del radar sináptico (`useNearbyBeacons`). */
  beacons?: BeaconView[];
  /** Neuronas de la cuenta (`listNeurons` ya mapeado a vista pública). */
  neurons?: AccountNeuronView[];
  /** Dispositivos BLE oídos en el escaneo con gesto. */
  ble?: BleDetection[];
  /** Puertos serie ya autorizados. */
  serialPorts?: SerialPortView[];
  /** Incluir la red externa medida como señal del router. Por defecto true. */
  includeExternal?: boolean;
  /** Reloj inyectable (pruebas deterministas). */
  now?: number;
}

/* ── Constructores por fuente ──────────────────────────────────────────────── */

function nodeName(n: { shortName?: string; longName?: string; num: number }): string {
  return n.shortName || n.longName || `!${n.num.toString(16)}`;
}

function ageLabel(at: number | null, now: number): string {
  if (!at) return "sin dato";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

/** (a) Nodos del radio LoRa conectado — la fuente con MÁS datos reales. */
function loraSignals(input: DetectedSignalsInput): DetectedSignal[] {
  const s = input.mesh;
  const simulated = s.transport === "simulator";
  const lat0 = s.self?.lat, lon0 = s.self?.lon;
  const selfHasGps = typeof lat0 === "number" && Number.isFinite(lat0) && typeof lon0 === "number" && Number.isFinite(lon0);
  // Neuronas de TU cuenta cuyo radio local coincide con un nodo de esta malla:
  // vínculo VERIFICADO (mismo número de nodo Meshtastic), no una suposición.
  const federatedByNum = new Map<number, { deviceId: string; label: string; onlineCount: number; region?: string; preset?: string; at: number }>();
  for (const r of s.remoteTopologies ?? []) {
    const num = r.snapshot?.self?.num;
    if (typeof num === "number") {
      federatedByNum.set(num, {
        deviceId: r.deviceId, label: r.label, onlineCount: r.onlineCount,
        region: r.snapshot?.region, preset: r.snapshot?.preset, at: r.at,
      });
    }
  }

  return s.nodes.filter((n) => !n.isSelf).map((n) => {
    const qSnr = typeof n.snr === "number" && Number.isFinite(n.snr) ? qualityFromSnr(n.snr) : null;
    const qRssi = typeof n.rssi === "number" && Number.isFinite(n.rssi) ? qualityFromRssi(n.rssi) : null;
    const quality = qSnr != null && qRssi != null ? (qSnr * 0.65 + qRssi * 0.35)
      : qSnr != null ? qSnr : qRssi;
    const qualityDetail = qSnr != null && qRssi != null
      ? `SNR ${n.snr!.toFixed(1)} dB + RSSI ${Math.round(n.rssi!)} dBm (medidos por el radio)`
      : qSnr != null ? `SNR ${n.snr!.toFixed(1)} dB (medido por el radio)`
      : qRssi != null ? `RSSI ${Math.round(n.rssi!)} dBm (medido por el radio)`
      : "El radio aún no ha medido SNR/RSSI de este nodo";

    const hasGps = typeof n.lat === "number" && Number.isFinite(n.lat) && typeof n.lon === "number" && Number.isFinite(n.lon);
    const placement = hasGps && selfHasGps
      ? placeByPosition(n.lat!, n.lon!, lat0!, lon0!, 35)
      : qSnr != null
        ? placeByRf("lora", `lora:${n.num}`, estimateDistanceMeters(n.snr!), quality)
        : placeBySector("lora", `lora:${n.num}`, quality);

    const metrics: SignalMetric[] = [];
    if (typeof n.snr === "number") metrics.push({ label: "SNR", value: `${n.snr.toFixed(1)} dB` });
    if (typeof n.rssi === "number") metrics.push({ label: "RSSI", value: `${Math.round(n.rssi)} dBm` });
    if (typeof n.hopsAway === "number") metrics.push({ label: "Saltos", value: `${n.hopsAway}` });
    if (typeof n.batteryLevel === "number") {
      metrics.push({ label: "Batería", value: n.batteryLevel > 100 ? "enchufado" : `${n.batteryLevel} %` });
    }
    if (typeof n.voltage === "number") metrics.push({ label: "Voltaje", value: `${n.voltage.toFixed(2)} V` });
    if (typeof n.channelUtilization === "number") metrics.push({ label: "Uso de canal", value: `${n.channelUtilization.toFixed(1)} %` });
    if (typeof n.airUtilTx === "number") metrics.push({ label: "Airtime TX", value: `${n.airUtilTx.toFixed(1)} %` });
    if (n.hwModel) metrics.push({ label: "Hardware", value: n.hwModel });
    if (n.role) metrics.push({ label: "Rol", value: String(n.role) });
    if (n.id) metrics.push({ label: "ID de nodo", value: n.id });
    if (hasGps) metrics.push({ label: "Posición", value: `${n.lat!.toFixed(5)}, ${n.lon!.toFixed(5)} (la comparte el nodo)` });

    const fed = federatedByNum.get(n.num);
    const starseed: StarseedIdentity | null = fed
      ? {
          via: "federation", sourceId: fed.deviceId, name: fed.label, ownAccount: true,
          online: true, lastSeenMs: fed.at, capabilities: ["malla LoRa", "federación de topología"],
          region: fed.region ?? null, preset: fed.preset ?? null, onlineCount: fed.onlineCount,
        }
      : null;

    return {
      id: `lora:${n.num}`,
      antenna: "lora" as AntennaKind,
      antennaLabel: ANTENNA_LABEL.lora,
      signalType: simulated ? "LoRa · Meshtastic (SIMULADOR)" : "LoRa · Meshtastic",
      label: nodeName(n),
      detail: simulated
        ? "Nodo generado por el SIMULADOR de la malla (no existe en el aire)"
        : starseed
          ? "Nodo Meshtastic de la malla · vinculado a una neurona de TU cuenta (mismo número de nodo)"
          : "Nodo Meshtastic al alcance del radio · sin cuenta StarSeed declarada",
      quality,
      qualityDetail,
      metrics,
      compatible: true,
      compatDetail: starseed
        ? "Compatible: habla Meshtastic Y pertenece a tu cuenta — sincronización directa disponible."
        : "Compatible con la malla: habla Meshtastic. Puedes enrutarle tráfico StarSeed aunque su dueño no use el OS (verá solo lo del canal).",
      starseed,
      placement,
      lastHeard: n.lastHeard || null,
      actions: [
        { id: "sync-now", label: "Sincronizar por la malla", enabled: true, hint: "Encola un estado StarSeed hacia este nodo por la malla LoRa (unicast con ACK)." },
        { id: "open-mesh", label: "Ver en Red Mesh", enabled: true },
      ],
      simulated,
      color: ANTENNA_COLOR.lora,
    };
  });
}

/** (b) Faros de la red sináptica: neuronas StarSeed vistas por el servidor. */
function beaconSignals(input: DetectedSignalsInput, now: number): DetectedSignal[] {
  return (input.beacons ?? []).map((b) => {
    const age = Math.max(0, now - (b.at || 0));
    // El faro NO tiene RF: su "calidad" es la FRESCURA del anuncio (TTL 5 min).
    const quality = qualityFromAge(age, 5 * 60_000);
    const metrics: SignalMetric[] = [
      { label: "Último faro", value: ageLabel(b.at || null, now) },
      { label: "Nodos que ve", value: `${b.onlineCount}` },
    ];
    if (b.region) metrics.push({ label: "Región LoRa", value: b.region });
    if (b.preset) metrics.push({ label: "Preset de módem", value: b.preset });
    if (b.offersPublic) metrics.push({ label: "Internet público", value: b.port ? `ofrecido · puerto ${b.port}` : "ofrecido" });
    return {
      id: `beacon:${b.deviceId}`,
      antenna: "relay" as AntennaKind,
      antennaLabel: ANTENNA_LABEL.relay,
      signalType: "Faro de presencia · red sináptica (IP)",
      label: b.label || (b.own ? "Neurona de tu cuenta (anónima)" : "Neurona StarSeed (anónima)"),
      detail: b.own
        ? "Otra neurona de TU cuenta anunciándose en el relé StarSeed."
        : "Neurona StarSeed de otra cuenta en el radar público. Su nombre solo aparece si comparte etiqueta.",
      quality,
      qualityDetail: "No hay RF: la calidad mide la FRESCURA del faro (caduca a los 5 min), no la distancia.",
      metrics,
      compatible: true,
      compatDetail: "Compatible: corre el sistema mesh de StarSeed y alcanza el mismo relé — interconexión y sincronización disponibles por IP.",
      starseed: {
        via: "relay-beacon", sourceId: b.deviceId, name: b.label, ownAccount: b.own,
        online: age < 5 * 60_000, lastSeenMs: b.at || null,
        capabilities: [
          "relé StarSeed",
          ...(b.onlineCount > 0 ? [`${b.onlineCount} nodo(s) de malla`] : []),
          ...(b.offersPublic ? ["ofrece internet público"] : []),
        ],
        region: b.region, preset: b.preset, onlineCount: b.onlineCount,
        offersPublic: b.offersPublic, port: b.port,
      },
      // El faro viaja por servidor: NO hay distancia física medible. Sector.
      placement: placeBySector("relay", `beacon:${b.deviceId}`, quality),
      lastHeard: b.at || null,
      actions: [
        { id: "add-server", label: "Añadir como servidor", enabled: !!b.offersPublic && !!b.port,
          hint: b.offersPublic && b.port
            ? `Añade http://<host>:${b.port} como servidor de la cuenta (esta neurona ofrece internet público).`
            : "Esta neurona no anuncia puerto público: no hay endpoint que añadir." },
        { id: "sync-now", label: "Sincronizar por relé", enabled: b.own,
          hint: b.own ? "Encola un estado hacia tus neuronas por el relé cifrado." : "Solo se sincroniza estado con neuronas de TU cuenta." },
      ],
      simulated: false,
      color: ANTENNA_COLOR.relay,
    };
  });
}

/** (c) NEURONAS de la cuenta (neuron_devices): señales StarSeed con datos públicos. */
function accountSignals(input: DetectedSignalsInput, now: number): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const n of input.neurons ?? []) {
    if (n.isThisDevice) continue; // ESTA neurona es el centro del radar, no una señal
    const age = n.lastSeenMs ? Math.max(0, now - n.lastSeenMs) : null;
    // Registro de cuenta: sin RF. La "calidad" es la presencia (ventana 3 min).
    const quality = n.online ? 1 : age != null ? qualityFromAge(age, 24 * 60 * 60_000) * 0.5 : 0;
    const metrics: SignalMetric[] = [
      { label: "Estado", value: n.online ? "en línea" : "desconectada" },
      { label: "Última vez vista", value: ageLabel(n.lastSeenMs, now) },
      { label: "Tipo", value: n.kind },
    ];
    if (n.platform) metrics.push({ label: "Plataforma", value: n.platform });
    if (n.browser) metrics.push({ label: "Navegador", value: n.browser });
    if (n.syncDeviceId) metrics.push({ label: "ID de sync", value: n.syncDeviceId });
    out.push({
      id: `neuron:${n.id}`,
      antenna: "account",
      antennaLabel: ANTENNA_LABEL.account,
      signalType: "Neurona StarSeed · registro de cuenta",
      label: n.name,
      detail: n.online
        ? "Neurona de tu cuenta en línea (latido < 3 min). Se sincroniza por relé cifrado."
        : "Neurona registrada de tu cuenta, ahora desconectada.",
      quality,
      qualityDetail: "No hay RF: la calidad mide la PRESENCIA (latido en el registro de la cuenta), no la distancia.",
      metrics,
      compatible: true,
      compatDetail: "Compatible al 100 %: es una neurona StarSeed de tu cuenta — cómputo, memoria y archivos compartidos según sus permisos.",
      starseed: {
        via: "neuron-registry", sourceId: n.id, name: n.name, ownAccount: true,
        platform: n.platform, deviceKind: n.kind, online: n.online, lastSeenMs: n.lastSeenMs,
        capabilities: n.capabilities, syncDeviceId: n.syncDeviceId,
      },
      placement: placeBySector("account", `neuron:${n.id}`, quality),
      lastHeard: n.lastSeenMs,
      actions: [
        { id: "open-neurons", label: "Abrir panel de neuronas", enabled: true },
        { id: "sync-now", label: "Sincronizar ahora", enabled: n.online,
          hint: n.online
            ? "Sube un latido al relé CIFRADO de tu cuenta. Ojo: el relé direcciona por el id de malla y el registro usa otro id, así que la recogen TODAS tus neuronas, no solo esta."
            : "Sin latido reciente: no hay a quién entregarlo ahora. Vuelve cuando esté en línea." },
      ],
      simulated: false,
      color: ANTENNA_COLOR.account,
    });
  }
  // Instantáneas federadas cuyo radio NO aparece en la malla local: son mallas
  // que ve otra neurona tuya, no nodos que oigas tú. Se declara tal cual.
  const localNums = new Set(input.mesh.nodes.map((n) => n.num));
  for (const r of input.mesh.remoteTopologies ?? []) {
    const selfNum = r.snapshot?.self?.num;
    if (typeof selfNum === "number" && localNums.has(selfNum)) continue; // ya pintado como nodo LoRa
    const quality = qualityFromAge(Math.max(0, now - r.at), 10 * 60_000);
    const metrics: SignalMetric[] = [
      { label: "Nodos que ve", value: `${r.onlineCount}` },
      { label: "Instantánea", value: ageLabel(r.at, now) },
    ];
    if (r.snapshot?.region) metrics.push({ label: "Región LoRa", value: r.snapshot.region });
    if (r.snapshot?.preset) metrics.push({ label: "Preset de módem", value: r.snapshot.preset });
    if (typeof r.snapshot?.self?.snr === "number") metrics.push({ label: "SNR de su radio", value: `${r.snapshot.self.snr.toFixed(1)} dB` });
    out.push({
      id: `federated:${r.deviceId}`,
      antenna: "account",
      antennaLabel: ANTENNA_LABEL.account,
      signalType: "Topología federada · malla de otra neurona tuya",
      label: r.label,
      detail: "Otra neurona de tu cuenta publica la malla que ELLA ve. Tú no oyes esos nodos por RF: llegan por la federación de la cuenta.",
      quality,
      qualityDetail: "No hay RF propia: la calidad mide lo reciente de la instantánea federada (caduca a los 10 min).",
      metrics,
      compatible: true,
      compatDetail: "Compatible: es tu propia cuenta. Sus nodos son alcanzables retransmitiendo a través de esa neurona.",
      starseed: {
        via: "federation", sourceId: r.deviceId, name: r.label, ownAccount: true,
        online: true, lastSeenMs: r.at,
        capabilities: ["malla LoRa", "federación de topología"],
        region: r.snapshot?.region ?? null, preset: r.snapshot?.preset ?? null, onlineCount: r.onlineCount,
      },
      placement: placeBySector("account", `federated:${r.deviceId}`, quality),
      lastHeard: r.at,
      actions: [{ id: "open-mesh", label: "Ver en Red Mesh", enabled: true }],
      simulated: false,
      color: ANTENNA_COLOR.account,
    });
  }
  return out;
}

/** (d) Red externa: el router/portadora que lleva la malla por IP. */
function externalSignal(now: number): DetectedSignal | null {
  // Fuera de un navegador REAL (SSR, Node) no hay portadora que observar: Node
  // ≥21 define un `navigator` sin `onLine`, y afirmar "conectada" por eso sería
  // inventarse una señal. Exigimos `window` antes de mirar nada.
  if (typeof window === "undefined") return null;
  const ext = externalLink();
  if (ext.availability === "unsupported") return null;
  const m = (ext.meta ?? {}) as {
    online?: boolean; effectiveType?: string; downlink?: number; rtt?: number; type?: string; hasApi?: boolean;
  };
  if (m.online === false) {
    return {
      id: "ip:external",
      antenna: "ip", antennaLabel: ANTENNA_LABEL.ip,
      signalType: "Red IP · sin portadora",
      label: "Red externa caída",
      detail: "El navegador reporta que NO hay red externa (navigator.onLine = false). La malla local LoRa sigue funcionando.",
      quality: 0,
      qualityDetail: "Sin conexión: calidad 0 medida por el propio navegador.",
      metrics: [{ label: "Estado", value: "sin conexión" }],
      compatible: false,
      compatDetail: "Sin red IP no hay relé ni servidor: solo la malla LoRa directa.",
      starseed: null,
      placement: placeBySector("ip", "ip:external", 0),
      lastHeard: now,
      actions: [{ id: "none", label: "Sin acciones disponibles", enabled: false, hint: "Restablece la conexión desde el sistema operativo." }],
      simulated: false,
      color: ANTENNA_COLOR.ip,
    };
  }
  const qRtt = typeof m.rtt === "number" ? qualityFromRtt(m.rtt) : null;
  const qDown = typeof m.downlink === "number" ? clamp01(m.downlink / 20) : null;
  const quality = qRtt != null && qDown != null ? qRtt * 0.6 + qDown * 0.4 : qRtt ?? qDown;
  const metrics: SignalMetric[] = [{ label: "Estado", value: "conectada" }];
  if (m.type) metrics.push({ label: "Tipo", value: NET_TYPE_ES[m.type] ?? m.type });
  if (m.effectiveType) metrics.push({ label: "Clase efectiva", value: m.effectiveType.toUpperCase() });
  if (typeof m.downlink === "number") metrics.push({ label: "Bajada estimada", value: `~${m.downlink} Mbps` });
  if (typeof m.rtt === "number") metrics.push({ label: "RTT", value: `${m.rtt} ms` });
  return {
    id: "ip:external",
    antenna: "ip", antennaLabel: ANTENNA_LABEL.ip,
    signalType: m.type === "wifi" ? "Wi-Fi · router local" : m.type === "cellular" ? "Datos móviles · portadora" : "Red IP · portadora activa",
    label: ext.label,
    detail: m.hasApi
      ? "Portadora IP activa medida por la Network Information API. El navegador NO expone SSID, MAC ni redes cercanas (sería vigilancia)."
      : "Portadora IP activa. Este navegador no implementa la Network Information API: solo se sabe que hay conexión, no su tipo ni su velocidad.",
    quality,
    qualityDetail: qRtt != null || qDown != null
      ? `Calidad derivada de ${[typeof m.rtt === "number" ? `RTT ${m.rtt} ms` : null, typeof m.downlink === "number" ? `bajada ~${m.downlink} Mbps` : null].filter(Boolean).join(" y ")} (medidos por el navegador).`
      : "Este navegador no expone métricas de red: solo hay confirmación de que la conexión existe.",
    metrics,
    compatible: true,
    compatDetail: "Compatible como VÍA: lleva la malla por IP a un nodo Meshtastic de tu red (TCP) y al relé StarSeed. No es un nodo en sí.",
    starseed: null,
    placement: placeBySector("ip", "ip:external", quality),
    lastHeard: now,
    actions: [
      { id: "connect-wifi-node", label: "Conectar nodo Wi-Fi", enabled: true, hint: "Conecta por TCP a un nodo Meshtastic de tu red local (IP o host)." },
    ],
    simulated: false,
    color: ANTENNA_COLOR.ip,
  };
}

const NET_TYPE_ES: Record<string, string> = {
  wifi: "Wi-Fi", ethernet: "Ethernet", cellular: "Datos móviles",
  bluetooth: "Bluetooth (PAN)", wimax: "WiMAX", none: "Sin red", unknown: "Desconocido",
};

/** (e) Dispositivos BLE realmente oídos (RSSI verdadero cuando el anuncio lo da). */
function bleSignals(input: DetectedSignalsInput, now: number): DetectedSignal[] {
  return (input.ble ?? []).map((d) => {
    const quality = d.rssi != null ? qualityFromRssi(d.rssi) : null;
    // BLE a 2,4 GHz: el modelo de trayecto libre da ~1 m a −40 dBm y ~50 m a
    // −90 dBm. Solo lo aplicamos si HAY RSSI; si no, sector puro.
    const meters = d.rssi != null ? clampM(Math.pow(10, (-40 - d.rssi) / 20)) : null;
    const placement = meters != null
      ? {
          ...placeByRf("ble", `ble:${d.id}`, Math.max(30, meters), quality),
          // El modelo BLE es MUCHO más burdo que el LoRa: lo decimos.
          detail: `Distancia orientativa por RSSI BLE (trayecto libre a 2,4 GHz): del orden de ${fmtMeters(Math.max(1, meters))}. Paredes y cuerpos la falsean con facilidad; el rumbo es desconocido.`,
        }
      : placeBySector("ble", `ble:${d.id}`, null);
    const metrics: SignalMetric[] = [
      { label: "Oído", value: ageLabel(d.at, now) },
      { label: "Id del anuncio", value: d.id.slice(0, 24) },
    ];
    if (d.rssi != null) metrics.push({ label: "RSSI", value: `${d.rssi} dBm` });
    if (d.txPower != null) metrics.push({ label: "Potencia TX declarada", value: `${d.txPower} dBm` });
    if (d.uuids.length) metrics.push({ label: "Servicios GATT", value: d.uuids.join(", ") });
    return {
      id: `ble:${d.id}`,
      antenna: "ble" as AntennaKind,
      antennaLabel: ANTENNA_LABEL.ble,
      signalType: d.viaPicker ? "Bluetooth LE · elegido en el selector" : "Bluetooth LE · anuncio (advertising)",
      label: d.name || "Dispositivo BLE sin nombre",
      detail: d.viaPicker
        ? "Dispositivo elegido por ti en el selector del navegador: SIN RSSI (esa API no lo expone)."
        : "Anuncio BLE oído de verdad por esta neurona. El navegador nunca da la MAC ni la posición.",
      quality,
      qualityDetail: d.rssi != null
        ? `RSSI ${d.rssi} dBm medido en el anuncio.`
        : "El selector de dispositivos no expone RSSI: no hay métrica de calidad.",
      metrics,
      compatible: false,
      compatDetail:
        "NO habla el protocolo de la malla: es un dispositivo BLE genérico (auriculares, sensor, wearable…). Solo se puede intentar vincular si es un radio Meshtastic: usa «Conectar radio por BLE» y elígelo en el selector del navegador.",
      starseed: null,
      placement,
      lastHeard: d.at,
      actions: [
        { id: "connect-ble", label: "Probar como radio Meshtastic", enabled: true,
          hint: "Abre el selector BLE del navegador. Solo funcionará si el dispositivo expone el servicio Meshtastic; si no, la conexión fallará y se dirá." },
      ],
      simulated: false,
      color: ANTENNA_COLOR.ble,
    };
  });
}

function clampM(m: number): number {
  if (!Number.isFinite(m)) return 1;
  return Math.max(0.5, Math.min(300, m));
}

/** (f) Puertos serie autorizados: radios/adaptadores USB conectados de verdad. */
function serialSignals(input: DetectedSignalsInput, now: number): DetectedSignal[] {
  const active = input.mesh.transport === "serial" && (input.mesh.status === "ready" || input.mesh.status === "degraded");
  return (input.serialPorts ?? []).map((p) => {
    const metrics: SignalMetric[] = [];
    if (p.usbVendorId != null) metrics.push({ label: "USB Vendor", value: `0x${p.usbVendorId.toString(16).padStart(4, "0")}` });
    if (p.usbProductId != null) metrics.push({ label: "USB Product", value: `0x${p.usbProductId.toString(16).padStart(4, "0")}` });
    metrics.push({ label: "Autorización", value: "concedida por ti a este origen" });
    return {
      id: `serial:${p.index}`,
      antenna: "serial" as AntennaKind,
      antennaLabel: ANTENNA_LABEL.serial,
      signalType: "Puerto serie USB autorizado",
      label: p.usbVendorId != null
        ? `Radio USB 0x${p.usbVendorId.toString(16).padStart(4, "0")}:${(p.usbProductId ?? 0).toString(16).padStart(4, "0")}`
        : `Puerto serie autorizado #${p.index + 1}`,
      detail: active
        ? "Puerto serie autorizado · la malla está conectada por serie ahora mismo."
        : "Puerto serie ya autorizado por ti. No está conectado: pulsa conectar para abrirlo como radio de la malla.",
      // Un puerto USB no tiene señal de radio: NO inventamos calidad.
      quality: null,
      qualityDetail: "Un puerto USB no tiene métrica de radio: la calidad no aplica.",
      metrics,
      compatible: true,
      compatDetail: "Compatible si el dispositivo es un radio Meshtastic. El navegador no puede saber el modelo hasta abrir el puerto.",
      starseed: null,
      placement: placeBySector("serial", `serial:${p.index}`, active ? 1 : 0.6),
      lastHeard: now,
      actions: [
        { id: "connect-serial", label: active ? "Reconectar por serie" : "Conectar por serie", enabled: true,
          hint: "Abre el puerto con Web Serial y arranca el protocolo Meshtastic." },
      ],
      simulated: false,
      color: ANTENNA_COLOR.serial,
    };
  });
}

/**
 * collectDetectedSignals — AGREGADOR. Junta TODAS las fuentes reales en una sola
 * lista ordenada (mejor calidad primero, sin calidad al final). Función PURA y
 * determinista: mismas entradas ⇒ misma salida (incluida la colocación).
 */
export function collectDetectedSignals(input: DetectedSignalsInput): DetectedSignal[] {
  const now = input.now ?? Date.now();
  const out: DetectedSignal[] = [];
  try { out.push(...loraSignals(input)); } catch { /* una fuente rota no tumba el radar */ }
  try { out.push(...beaconSignals(input, now)); } catch { /* */ }
  try { out.push(...accountSignals(input, now)); } catch { /* */ }
  try { out.push(...bleSignals(input, now)); } catch { /* */ }
  try { out.push(...serialSignals(input, now)); } catch { /* */ }
  if (input.includeExternal !== false) {
    try {
      const ext = externalSignal(now);
      if (ext) out.push(ext);
    } catch { /* */ }
  }
  return out.sort((a, b) => {
    const qa = a.quality == null ? -1 : a.quality;
    const qb = b.quality == null ? -1 : b.quality;
    if (qb !== qa) return qb - qa;
    return a.id.localeCompare(b.id);
  });
}

/** Resumen por antena para las cabeceras y los estados vacíos. */
export interface AntennaSummary {
  antenna: AntennaKind;
  label: string;
  color: string;
  count: number;
  compatible: number;
  withStarseed: number;
  withRealPosition: number;
}

export function summarizeByAntenna(list: DetectedSignal[]): AntennaSummary[] {
  const kinds: AntennaKind[] = ["lora", "relay", "account", "ip", "ble", "serial"];
  return kinds.map((antenna) => {
    const items = list.filter((s) => s.antenna === antenna);
    return {
      antenna,
      label: ANTENNA_LABEL[antenna],
      color: ANTENNA_COLOR[antenna],
      count: items.length,
      compatible: items.filter((s) => s.compatible).length,
      withStarseed: items.filter((s) => s.starseed).length,
      withRealPosition: items.filter((s) => s.placement.mode === "gps").length,
    };
  });
}
