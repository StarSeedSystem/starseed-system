/**
 * StarSeed OS — Red Mesh Meshtastic · CONSTANTES Y LÍMITES (Adenda 97).
 * ============================================================================
 * Números que gobiernan el subsistema. TODOS con su porqué. Si cambias uno,
 * actualiza el SOP (`architecture/astraura-mesh-meshtastic.md`) PRIMERO.
 * Módulo PURO (sin react/navegador). Nunca lanza.
 */

import type { AirtimeBudget, MeshRules, TrafficClass } from "./types";

/** PortNum de la app StarSeed en la malla: PRIVATE_APP (256) del protobuf oficial. */
export const STARSEED_PORTNUM = 256;

/**
 * Payload máximo ÚTIL de un MeshPacket Meshtastic ≈ 233–237 B. Dejamos margen
 * (cabecera del sobre StarSeed = 9 B) y fijamos el TROZO NETO en 191 B para no
 * rozar jamás el límite del firmware aunque cambie unos bytes entre versiones.
 */
export const MESH_MAX_FRAME_BYTES = 200; // sobre completo (cabecera + payload)
export const MESH_HEADER_BYTES = 9;
export const MESH_CHUNK_PAYLOAD_BYTES = MESH_MAX_FRAME_BYTES - MESH_HEADER_BYTES; // 191

/** Máximo de trozos por mensaje (191 B × 24 ≈ 4,5 KB comprimidos: tope sano). */
export const MESH_MAX_CHUNKS = 24;

/** Magic + versión del sobre binario StarSeed (SOP §5.1). */
export const MESH_MAGIC = 0xa7;
export const MESH_VERSION = 1;

/** Timeout de reensamblado por mensaje y reintentos de NACK selectivo. */
export const REASSEMBLY_TIMEOUT_MS = 90_000;
export const CHUNK_NACK_MAX_RETRIES = 2;

/**
 * Presupuesto de duty cycle CONSERVADOR por región (fracción del límite legal
 * que StarSeed se permite: la malla es procomún y no la saturamos).
 * LÍMITES LEGALES según el firmware oficial (RadioInterface.cpp, jul-2026):
 * EU_868 (869,4-869,65 MHz) = 10 % · EU_433 = 10 % · TH = 10 % · UA_433 = 10 %
 * · UA_868 = 1 % (la más estricta) · resto (US/ANZ/JP/…) sin duty (reglas
 * propias tipo dwell/LBT). El duty se calcula en ventana móvil de 1 h.
 * Nuestro objetivo SIEMPRE queda MUY por debajo del legal.
 * targetDutyPct = % de airtime propio sobre tiempo real.
 */
export const DUTY_TARGET_BY_REGION: Record<string, number> = {
  EU_868: 2,
  EU_433: 2,
  TH: 2,
  UA_433: 2,
  UA_868: 0.25, // legal 1 % → objetivo 4× por debajo
  US: 4,
  US_915: 4,
  ANZ: 4,
  RU: 2,
  JP: 2,
  TW: 2,
  CN: 2,
  IN: 2,
  // Regiones adicionales del enum RegionCode (Adenda 98): sin duty legal
  // estricto, pero mantenemos un objetivo conservador (la malla es procomún).
  KR: 4,
  NZ_865: 4,
  MY_433: 4,
  MY_919: 4,
  SG_923: 4,
  LORA_24: 4, // 2,4 GHz: más ancho de banda, seguimos siendo prudentes
  UNSET: 1, // región desconocida → lo más prudente
};

/** Capacidad del bucket (ms de airtime acumulables) y reserva P0. */
export const AIRTIME_BUCKET_CAPACITY_MS = 45_000;
export const AIRTIME_P0_RESERVE_MS = 9_000;

/** Presupuesto inicial (antes de conocer la región del radio). */
export function initialBudget(region = "UNSET"): AirtimeBudget {
  const targetDutyPct = DUTY_TARGET_BY_REGION[region] ?? DUTY_TARGET_BY_REGION.UNSET;
  return {
    availableMs: AIRTIME_BUCKET_CAPACITY_MS / 3,
    capacityMs: AIRTIME_BUCKET_CAPACITY_MS,
    reservedP0Ms: AIRTIME_P0_RESERVE_MS,
    targetDutyPct,
  };
}

/**
 * Airtime ESTIMADO por trozo según el preset del módem (ms por frame de
 * ~200 B). Aproximación honesta por preset (LongFast ≈ 1,07 kbps brutos →
 * un frame completo ronda 1,5–2,5 s con preámbulo). Solo para presupuestar:
 * preferimos sobreestimar (proteger la malla) a quedarnos cortos.
 */
export const AIRTIME_MS_PER_CHUNK_BY_PRESET: Record<string, number> = {
  SHORT_TURBO: 250,
  SHORT_FAST: 400,
  SHORT_SLOW: 600,
  MEDIUM_FAST: 900,
  MEDIUM_SLOW: 1_200,
  LONG_FAST: 2_000,
  LONG_MODERATE: 3_200,
  LONG_SLOW: 4_500,
  UNSET: 2_000, // asumimos LongFast (preset por defecto de Meshtastic)
};

/** Presencia: umbrales del sweep perezoso de discovery (SOP §3). */
export const NODE_STALE_MS = 15 * 60_000;
export const NODE_OFFLINE_MS = 60 * 60_000;
export const NODE_SWEEP_INTERVAL_MS = 30_000;

/** Watchdog del enlace con el radio (SOP §6). */
export const LINK_SILENCE_DEGRADED_MS = 45_000;
export const LINK_SILENCE_RECONNECT_MS = 90_000;

/** Backoff de reconexión: 1→2→4→…→60 s con jitter ±20 %. */
export const RECONNECT_BACKOFF_BASE_MS = 1_000;
export const RECONNECT_BACKOFF_MAX_MS = 60_000;

/** Sondas de salud Wi-Fi (health.ts): adaptativas. */
export const WIFI_PROBE_HEALTHY_MS = 60_000;
export const WIFI_PROBE_DEGRADED_MS = 20_000;
export const WIFI_PROBE_TIMEOUT_MS = 3_500;
export const HEALTH_EMA_ALPHA = 0.3;

/** Umbrales del router (SOP §4.3) — con histéresis anti-aleteo. */
export const WIFI_HEALTHY_SCORE = 0.55;
export const WIFI_RECOVER_SCORE = 0.65; // volver a Wi-Fi exige MÁS que quedarse
export const WIFI_RECOVER_PROBES = 2;
export const MESH_USABLE_SCORE = 0.35;

/** Límite de tamaño (bytes SIN comprimir) que cada clase acepta por mesh. */
export const MESH_CLASS_SIZE_LIMIT: Record<TrafficClass, number> = {
  P0: 256, // una alerta SIEMPRE cabe en 1–2 trozos
  P1: 1_024,
  P2: 3_072,
  P3: 4_096, // y solo bajo orden explícita (SOP §4.2)
};

/** Historial de decisiones que conserva el store (UI). */
export const DECISION_HISTORY_LIMIT = 60;

/** Reglas mesh por defecto de una neurona (SOP §7.2). */
export const DEFAULT_MESH_RULES: MeshRules = {
  role: "interactive",
  priority: "normal",
  voiceAnnounce: true,
  allowStateSync: true,
  allowedClasses: ["P0", "P1", "P2"],
};

/** Claves de persistencia (patrón de la casa: localStorage + SYNCED_KEYS futura). */
export const MESH_RULES_LS_KEY = "starseed.mesh.rules.v1";
export const MESH_SETTINGS_LS_KEY = "starseed.mesh.settings.v1";

/** Evento global de cambio de estado mesh (lo emite store.ts). */
export const MESH_STATE_EVENT = "starseed:mesh-state";
/** Evento de alerta P0 recibida (lo escuchan voz/notificaciones). */
export const MESH_ALERT_EVENT = "starseed:mesh-alert";

/** Daemon local por defecto (meshtasticd HTTP o nodo WiFi). */
export const MESH_DAEMON_DEFAULT_URL = "http://127.0.0.1:4403";
