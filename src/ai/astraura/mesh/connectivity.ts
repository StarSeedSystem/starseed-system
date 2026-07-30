"use client";

/**
 * StarSeed OS — CONECTIVIDAD DE LA NEURONA (Adenda 98).
 * ============================================================================
 * Inventario VIVO de todas las vías de conexión del dispositivo (neurona) y
 * sus opciones configurables — la fuente de verdad del Centro de Conexiones
 * (Control Center + barra superior del escritorio):
 *
 *   · RED EXTERNA (Wi-Fi / Ethernet / datos): online, tipo, velocidad efectiva
 *     y RTT vía Network Information API (donde exista) + navigator.onLine.
 *   · BLUETOOTH: disponibilidad de Web Bluetooth (para radios BLE de la malla).
 *   · ANTENAS / PUERTOS SERIE: Web Serial (radios LoRa por USB) + puertos ya
 *     autorizados por el usuario.
 *   · MALLA P2P: estado del subsistema mesh (del store) — resumen para la UI.
 *
 * Además centraliza los AJUSTES de conectividad de esta neurona (persistidos,
 * por DISPOSITIVO): modo dual (malla + red externa a la vez), ruta preferida,
 * y transporte de radio por defecto. El decision-router los respeta.
 *
 * Honestidad radical: el navegador NO expone SSID, MAC ni la lista de redes
 * Wi-Fi cercanas (sería vigilancia — y la plataforma lo prohíbe). Mostramos lo
 * que SÍ es real (online/tipo/velocidad/soporte de cada API) y lo decimos
 * claramente. Lo que el usuario conecta a mano (un radio serie) sí aparece.
 *
 * SSR-safe y defensivo. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const CONNECTIVITY_EVENT = "starseed:connectivity";
const CONNECTIVITY_LS_KEY = "starseed.connectivity.settings.v1";

/* ── Ajustes de conectividad de la neurona (persistidos por dispositivo) ───── */

/** Ruta preferida cuando AMBAS vías están sanas (el router la respeta). */
export type PreferredRoute = "auto" | "wifi" | "mesh";

export interface ConnectivitySettings {
  /**
   * Modo DUAL: la malla P2P y la red externa operan A LA VEZ (Adenda 98). La
   * malla no es solo un fallback: cuando está ON, el tráfico crítico usa ambas
   * y la sincronización elige la mejor por clase. OFF = la malla solo entra si
   * la red externa cae (comportamiento de la Adenda 97).
   */
  dualMode: boolean;
  /** Ruta preferida con ambas sanas: auto (el router decide) · wifi · mesh. */
  preferred: PreferredRoute;
  /** Transporte de radio por defecto al conectar la malla desde la barra. */
  defaultRadio: "serial" | "ble" | "daemon" | "simulator";
  /** URL del daemon/nodo WiFi por defecto. */
  daemonUrl: string;
  /** ¿Reconectar la malla automáticamente al arrancar (solo daemon)? */
  autoConnectMesh: boolean;
  /**
   * ANTENA MESH LOCAL (P2P) encendida. Cuando está ON, esta neurona actúa
   * RECÍPROCAMENTE como antena/relé de la malla StarSeed (da y recibe, bien
   * común). OFF = no participa en la malla local P2P (pero el internet público
   * puede seguir ON de forma independiente). Por defecto ON.
   */
  meshEnabled: boolean;
  /**
   * INTERNET PÚBLICO StarSeed encendido (independiente de la malla local).
   * ON (por defecto) = esta neurona se entrelaza con TODAS las neuronas que
   * usan el servidor público StarSeed para el internet público del OS y la red
   * StarSeed. OFF = SESIÓN PRIVADA (el servidor solo sirve a las neuronas de tu
   * propia cuenta —sync privada— sin feed público ni cruce entre cuentas).
   */
  publicInternet: boolean;
  /**
   * Servidor activo para el internet público / relé. "starseed" = servidor
   * público StarSeed (por defecto, entrelaza a toda la red). Cualquier otro id
   * apunta a un servidor privado o público añadido/editable por la cuenta o el
   * grupo (ver servers.ts). Vacío = solo malla local.
   */
  serverId: string;
}

export const DEFAULT_CONNECTIVITY: ConnectivitySettings = {
  dualMode: true,
  preferred: "auto",
  defaultRadio: "serial",
  daemonUrl: "http://127.0.0.1:4403",
  autoConnectMesh: false,
  // Por defecto: malla local Y internet público StarSeed ENCENDIDOS a la vez,
  // funcionando de forma inteligente según carga/distancia/tamaño/velocidad
  // (el router sináptico decide la mejor vía por clase de mensaje).
  meshEnabled: true,
  publicInternet: true,
  serverId: "starseed",
};

export function getConnectivitySettings(): ConnectivitySettings {
  try {
    const raw = safeGet(CONNECTIVITY_LS_KEY);
    if (!raw) return { ...DEFAULT_CONNECTIVITY };
    const j = JSON.parse(raw) as Partial<ConnectivitySettings>;
    return {
      dualMode: typeof j.dualMode === "boolean" ? j.dualMode : DEFAULT_CONNECTIVITY.dualMode,
      preferred:
        j.preferred === "wifi" || j.preferred === "mesh" || j.preferred === "auto"
          ? j.preferred
          : DEFAULT_CONNECTIVITY.preferred,
      defaultRadio:
        j.defaultRadio === "ble" ||
        j.defaultRadio === "daemon" ||
        j.defaultRadio === "simulator" ||
        j.defaultRadio === "serial"
          ? j.defaultRadio
          : DEFAULT_CONNECTIVITY.defaultRadio,
      daemonUrl: typeof j.daemonUrl === "string" && j.daemonUrl ? j.daemonUrl : DEFAULT_CONNECTIVITY.daemonUrl,
      autoConnectMesh:
        typeof j.autoConnectMesh === "boolean" ? j.autoConnectMesh : DEFAULT_CONNECTIVITY.autoConnectMesh,
      meshEnabled: typeof j.meshEnabled === "boolean" ? j.meshEnabled : DEFAULT_CONNECTIVITY.meshEnabled,
      publicInternet:
        typeof j.publicInternet === "boolean" ? j.publicInternet : DEFAULT_CONNECTIVITY.publicInternet,
      serverId: typeof j.serverId === "string" ? j.serverId : DEFAULT_CONNECTIVITY.serverId,
    };
  } catch {
    return { ...DEFAULT_CONNECTIVITY };
  }
}

export function setConnectivitySettings(patch: Partial<ConnectivitySettings>): ConnectivitySettings {
  const next = { ...getConnectivitySettings(), ...patch };
  try {
    safeSet(CONNECTIVITY_LS_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CONNECTIVITY_EVENT, { detail: { settings: next } }));
    }
  } catch {
    /* */
  }
  return next;
}

/* ── Config PORTÁTIL de conectividad (contextos no-cuenta) ─────────────────── */

/**
 * Config de conectividad reutilizable en CUALQUIER contexto que no sea la
 * neurona-cuenta: entidades (páginas/grupos/comunidades), chats y personalidades
 * de Astraura. Se guarda en el almacén de cada contexto (entity_state /
 * meta.config / perfil de personalidad). El panel compartido la edita por
 * value/onChange. Por defecto: todo lo público ENCENDIDO (bien común).
 */
export type ConnectivityInternetMode = "public" | "private" | "local" | "account";

export interface ConnectivityConfig {
  /** Antena/malla local P2P participando (da y recibe). */
  meshEnabled: boolean;
  /** Internet público StarSeed encendido (entrelaza con toda la red). */
  publicInternet: boolean;
  /** Servidor activo ("starseed" por defecto, o un id de servidor propio). */
  serverId: string;
  /** Presencia en el radar público de la malla. */
  publicRadar: "visible" | "anonymous" | "off";
  /**
   * Modo de internet de ESTE contexto (para entidades/chats/personalidades):
   *   · "public"  → red pública en servidores StarSeed/editables (por defecto)
   *   · "private" → servidores privados propios (sesión privada)
   *   · "local"   → solo malla local P2P (sin servidor)
   *   · "account" → solo a través de la cuenta y sus permisos/accesos
   */
  internetMode: ConnectivityInternetMode;
}

export const DEFAULT_CONNECTIVITY_CONFIG: ConnectivityConfig = {
  meshEnabled: true,
  publicInternet: true,
  serverId: "starseed",
  publicRadar: "anonymous",
  internetMode: "public",
};

/** Sanea/normaliza una config portátil venida de un almacén cualquiera. */
export function normalizeConnectivityConfig(x: unknown): ConnectivityConfig {
  const j = (x && typeof x === "object" ? x : {}) as Partial<ConnectivityConfig>;
  return {
    meshEnabled: typeof j.meshEnabled === "boolean" ? j.meshEnabled : DEFAULT_CONNECTIVITY_CONFIG.meshEnabled,
    publicInternet:
      typeof j.publicInternet === "boolean" ? j.publicInternet : DEFAULT_CONNECTIVITY_CONFIG.publicInternet,
    serverId: typeof j.serverId === "string" ? j.serverId : DEFAULT_CONNECTIVITY_CONFIG.serverId,
    publicRadar:
      j.publicRadar === "visible" || j.publicRadar === "off" || j.publicRadar === "anonymous"
        ? j.publicRadar
        : DEFAULT_CONNECTIVITY_CONFIG.publicRadar,
    internetMode:
      j.internetMode === "private" || j.internetMode === "local" || j.internetMode === "account" || j.internetMode === "public"
        ? j.internetMode
        : DEFAULT_CONNECTIVITY_CONFIG.internetMode,
  };
}

/* ── Inventario vivo de vías de conexión ───────────────────────────────────── */

export type LinkKind = "external" | "bluetooth" | "serial" | "mesh";
export type LinkAvailability = "active" | "available" | "unsupported" | "off";

export interface ConnectivityLink {
  kind: LinkKind;
  label: string;
  availability: LinkAvailability;
  /** Detalle legible (tipo de red, velocidad, nº de puertos…). */
  detail: string;
  /** Datos crudos útiles para la UI (opcional). */
  meta?: Record<string, unknown>;
}

interface NetworkInformationLike {
  effectiveType?: string; // "4g" | "3g" | "2g" | "slow-2g"
  downlink?: number; // Mbps estimados
  rtt?: number; // ms
  type?: string; // "wifi" | "cellular" | "ethernet" | "none" | "unknown"
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

function netInfo(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

const NET_TYPE_LABEL: Record<string, string> = {
  wifi: "Wi-Fi",
  ethernet: "Ethernet",
  cellular: "Datos móviles",
  bluetooth: "Bluetooth (PAN)",
  wimax: "WiMAX",
  none: "Sin red",
  unknown: "Red (tipo desconocido)",
};

/** Estado de la RED EXTERNA (Wi-Fi/Ethernet/datos). */
export function externalLink(): ConnectivityLink {
  if (typeof navigator === "undefined") {
    return { kind: "external", label: "Red externa", availability: "unsupported", detail: "no disponible (servidor)" };
  }
  const online = navigator.onLine !== false;
  const info = netInfo();
  const typeLabel = info?.type ? NET_TYPE_LABEL[info.type] ?? info.type : "Red externa";
  const parts: string[] = [];
  if (info?.effectiveType) parts.push(info.effectiveType.toUpperCase());
  if (typeof info?.downlink === "number") parts.push(`~${info.downlink} Mbps`);
  if (typeof info?.rtt === "number") parts.push(`${info.rtt} ms`);
  if (info?.saveData) parts.push("ahorro de datos");
  const detail = online
    ? parts.length
      ? parts.join(" · ")
      : "conectada"
    : "sin conexión";
  return {
    kind: "external",
    label: typeLabel,
    availability: online ? "active" : "off",
    detail,
    meta: {
      online,
      effectiveType: info?.effectiveType,
      downlink: info?.downlink,
      rtt: info?.rtt,
      type: info?.type,
      hasApi: !!info,
    },
  };
}

/** Soporte de Web Bluetooth (radios BLE de la malla / periféricos). */
export function bluetoothLink(): ConnectivityLink {
  const supported = typeof navigator !== "undefined" && "bluetooth" in navigator;
  return {
    kind: "bluetooth",
    label: "Bluetooth",
    availability: supported ? "available" : "unsupported",
    detail: supported
      ? "Web Bluetooth disponible (radios BLE, periféricos)"
      : "Web Bluetooth no soportado en este navegador",
    meta: { supported },
  };
}

/** Web Serial + nº de puertos ya autorizados (antenas/radios LoRa por USB). */
export async function serialLink(): Promise<ConnectivityLink> {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  if (!supported) {
    return {
      kind: "serial",
      label: "Antenas / Serie",
      availability: "unsupported",
      detail: "Web Serial no soportado (usa Chrome/Edge para radios USB)",
      meta: { supported: false, ports: 0 },
    };
  }
  let ports = 0;
  try {
    const list = await (navigator as Navigator & {
      serial?: { getPorts?: () => Promise<unknown[]> };
    }).serial?.getPorts?.();
    ports = Array.isArray(list) ? list.length : 0;
  } catch {
    ports = 0;
  }
  return {
    kind: "serial",
    label: "Antenas / Serie",
    availability: ports > 0 ? "active" : "available",
    detail:
      ports > 0
        ? `${ports} radio${ports === 1 ? "" : "s"} USB autorizado${ports === 1 ? "" : "s"}`
        : "Web Serial disponible (conecta un radio LoRa por USB)",
    meta: { supported: true, ports },
  };
}

/** Suscripción a cambios de la red externa (online/offline + Network Info). */
export function subscribeConnectivity(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const info = netInfo();
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  window.addEventListener(CONNECTIVITY_EVENT, cb);
  info?.addEventListener?.("change", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    window.removeEventListener(CONNECTIVITY_EVENT, cb);
    info?.removeEventListener?.("change", cb);
  };
}
