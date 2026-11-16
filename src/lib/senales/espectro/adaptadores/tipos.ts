/**
 * tipos — tipos del adaptador Wi-Fi (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { Medio, CapaRed } from "../modelo";

/** Escaneo nativo de Wi-Fi inyectado (lo que el sistema/daemon puede leer). */
export interface EscaneoWifi {
  /** Canal Wi-Fi (1-14 para 2.4 GHz, 36-177 para 5 GHz, 1-233 para 6 GHz). */
  canal?: number;
  /** Frecuencia central en MHz. */
  frecuenciaMhz?: number;
  /** Ancho de banda en MHz. */
  anchoMhz?: number;
  /** Potencia de señal recibida en dBm. */
  rssi?: number;
  /** BSSID (NO se usa en la señal de salida; solo para deduplicar si hace falta). */
  bssid?: string;
  /** SSID (NO se incluye en la señal de salida por privacidad). */
  ssid?: string;
}

/** Entrada del adaptador: lo que el llamante midió o inyectó. */
export interface EntradaAdaptadorWifi {
  /** Señales de medio medidas por este aparato (internet.tipo, efectivo, mbps). */
  senalesMedio: {
    internet: { enLinea: boolean; tipo?: string; efectivo?: string; mbps?: number };
  } | null;
  /** Enlaces abiertos con medida real (rttMs, capacidadKbps) del transporte. */
  enlacesMedidos: ReadonlyArray<{
    id: string;
    medio: "ble" | "wifi";
    neurona: string;
    rttMs: number | null;
    kbps: number | null;
    t: number;
  }>;
  /** Escaneo nativo de Wi-Fi inyectado (opcional; el navegador no lo da). */
  escaneoNativo?: ReadonlyArray<EscaneoWifi>;
  /** Zona gruesa del aparato (≤5 caracteres, nunca lat,lon). */
  zona?: string | null;
  /** Capa de red a la que pertenecen las señales propias. */
  capa?: CapaRed;
}