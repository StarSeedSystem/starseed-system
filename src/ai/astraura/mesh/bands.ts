/**
 * StarSeed OS — RED SINÁPTICA · BANDAS SIMULTÁNEAS (Adenda 99).
 * ============================================================================
 * Vista PURA de TODAS las bandas/vías que la neurona usa a la vez — activas por
 * DEFECTO — para que el enrutador sináptico elija la mejor por caso. Alex pidió
 * "uso simultáneo, sincronizado e interconectado de todas las bandas": esto es
 * su representación honesta.
 *
 * HONESTIDAD RADICAL: una sola radio LoRa emite en UNA banda a la vez (hardware);
 * "todas las bandas simultáneas" significa, de verdad, TODOS LOS TRANSPORTES a
 * la vez — malla LoRa + servidor(nube/Wi-Fi) + puente cifrado + BLE — cada uno
 * en su papel, y el mejor PRESET de la LoRa elegido automáticamente por caso.
 * No fingimos emitir por las antenas celulares/Wi-Fi a voluntad (ninguna Web
 * API lo permite). Módulo PURO y testeable. Nunca lanza.
 */

import { PRESET_SPECS, REGION_BANDS } from "./antennas";
import type { MeshState } from "./types";

export type BandKind = "radio" | "internet" | "bridge";

export interface BandMetric {
  key: string;
  value: string;
}

/** Una banda/vía con su estado e info para el radar y las configs rápidas. */
export interface BandStatus {
  id: "lora" | "server" | "relay" | "ble" | "wifi";
  label: string;
  kind: BandKind;
  /** ¿Activa/disponible ahora? (por defecto se busca tener todas activas). */
  active: boolean;
  /** Resumen honesto de para qué sirve / su estado. */
  detail: string;
  /** Métricas breves (freq, kbps, alcance, vecinos…). */
  metrics: BandMetric[];
  /** Sugerencias de configuración rápida (las ejecuta la UI). */
  quick: string[];
}

export interface BandsOpts {
  wifiHealthy: boolean;
  hasAccount: boolean;
  /** Nº de neuronas cercanas descubiertas por faro (para el detalle). */
  nearbyCount: number;
  /** Preset del módem activo (de sync.getActiveModemPreset). */
  activePreset: string;
  /** ¿Hay clave de relé para descifrar? (relay-crypto.hasRelayKey). */
  relayKey: boolean;
}

/**
 * describeBands — el estado vivo de TODAS las bandas de la neurona. Determinista
 * y puro: mismos argumentos → mismo resultado.
 */
export function describeBands(s: MeshState, opts: BandsOpts): BandStatus[] {
  const meshReady = s.status === "ready" || s.status === "degraded";
  const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
  const band = REGION_BANDS[s.region] ?? REGION_BANDS.UNSET;
  const preset = PRESET_SPECS[opts.activePreset] ?? null;

  const bands: BandStatus[] = [];

  // 1) Radio LoRa (malla P2P sin compañías) — la banda de telecom libre.
  bands.push({
    id: "lora",
    label: "Radio LoRa · malla P2P",
    kind: "radio",
    active: meshReady,
    detail: meshReady
      ? "Telecomunicación directa entre neuronas, sin compañías"
      : "Sin radio conectado (conecta uno para la malla directa)",
    metrics: [
      { key: "Banda", value: `${band.freqStartMhz}–${band.freqEndMhz} MHz (${band.key})` },
      { key: "Preset", value: preset ? `${preset.label} · ${preset.kbps} kbps` : "—" },
      { key: "Alcance/Cap.", value: preset ? `${preset.range}/10 · ${preset.capacity}/10` : "—" },
      { key: "Vecinos", value: `${online} en línea` },
    ],
    quick: ["Auto-preset", "Priorizar distancia", "Priorizar velocidad"],
  });

  // 2) Servidor (nube vía Wi-Fi/datos) — almacena y retransmite lo PÚBLICO.
  const serverActive = opts.wifiHealthy && opts.hasAccount;
  bands.push({
    id: "server",
    label: "Servidor · nube pública",
    kind: "internet",
    active: serverActive,
    detail: serverActive
      ? "Alcance global: lo público se sube para que cualquier neurona lo reciba"
      : !opts.hasAccount
        ? "Sin sesión: inicia sesión para usar los servidores"
        : "Red externa no disponible ahora",
    metrics: [
      { key: "Estado", value: opts.wifiHealthy ? "Red externa sana" : "Sin red externa" },
      { key: "Cuenta", value: opts.hasAccount ? "Sesión activa" : "Sin sesión" },
      { key: "Cercanas", value: `${opts.nearbyCount} neuronas por faro` },
    ],
    quick: ["Ver radar", "Privacidad"],
  });

  // 3) Puente cifrado (relé por servidor) — datos privados a larga distancia.
  bands.push({
    id: "relay",
    label: "Puente cifrado · relé",
    kind: "bridge",
    active: opts.hasAccount && opts.relayKey,
    detail: opts.relayKey
      ? "Datos privados a larga distancia: cifrados en tu neurona, el servidor solo transporta"
      : "Genera/vincula la clave de cuenta para el relé cifrado",
    metrics: [
      { key: "Cifrado", value: opts.relayKey ? "AES-GCM (clave de cuenta)" : "sin clave" },
      { key: "Alcance", value: "global (la malla no llega)" },
    ],
    quick: ["Vincular clave", "Exportar clave"],
  });

  // 4) BLE — transporte hacia el radio (no una banda de datos por sí misma).
  bands.push({
    id: "ble",
    label: "Bluetooth / BLE",
    kind: "bridge",
    active: s.transport === "ble",
    detail:
      s.transport === "ble"
        ? "Enlace activo hacia el radio LoRa por BLE"
        : "Transporte disponible hacia radios LoRa por BLE",
    metrics: [{ key: "Banda", value: "2,4 GHz" }],
    quick: ["Conectar por BLE"],
  });

  return bands;
}

/** Nº de bandas activas ahora (para un indicador compacto). */
export function activeBandCount(bands: BandStatus[]): number {
  return bands.filter((b) => b.active).length;
}
