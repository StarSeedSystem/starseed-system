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

import { REGION_BANDS } from "./antennas";
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
