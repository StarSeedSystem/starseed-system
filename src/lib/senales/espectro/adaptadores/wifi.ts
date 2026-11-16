/**
 * wifi — adaptador puro del espectrómetro para Wi-Fi (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Un navegador NO escanea Wi-Fi: sin un escaneo nativo inyectado, devuelve
 * sinFuente: [{ medio: "wifi", motivo: "este aparato no deja escanear redes Wi-Fi desde la app" }]
 * y como mucho UNA señal de «tu conexión actual» con origen: "medida" sin frecuencia
 * (no inventes canal ni banda). Si se inyecta un escaneo nativo
 * (EscaneoWifi[] { canal?, frecuenciaMhz?, anchoMhz?, rssi? }), conviértelo con bandas.ts
 * y NUNCA incluyas SSID ni BSSID en la señal.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente, Medio, OrigenDato, CapaRed } from "../modelo";
import { frecuenciaDeCanalWifi, bandaDeFrecuencia } from "../bandas";
import { qualityFromRssi } from "@/ai/astraura/mesh/signals";

const MEDIO: Medio = "wifi";
const MOTIVO_SIN_ESCANEO = "este aparato no deja escanear redes Wi-Fi desde la app";
const FUENTE_CONEXION = "conexión Wi-Fi actual del navegador";
const FUENTE_ESCANEO = "escaneo nativo de Wi-Fi inyectado";

export interface EscaneoWifi {
  id: string;
  canal?: number;
  frecuenciaMhz?: number;
  anchoMhz?: number;
  rssi?: number;
  at?: number;
}

export interface EntradaWifi {
  /** ¿Está conectado por Wi-Fi o red? (de SenalesMedio.internet o navegador). */
  enLinea?: boolean;
  conexionActual?: {
    tipo?: string;
    efectivo?: string;
    downlink?: number;
    at?: number;
  } | null;
  /** Escaneo nativo inyectado opcional (si la plataforma lo provee). */
  escaneoNativo?: readonly EscaneoWifi[];
  capa?: CapaRed;
}

export interface ResultadoWifi {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
}

/**
 * Adaptador puro para Wi-Fi.
 */
export function adaptadorWifi(entrada: EntradaWifi): ResultadoWifi {
  const senales: SenalEspectro[] = [];
  const sinFuente: SinFuente[] = [];

  const capa: CapaRed = entrada.capa ?? "propia";
  const ahora = Date.now();

  // 1. Si no hay escaneo nativo inyectado, se añade el sinFuente y opcionalmente la conexión actual
  if (!entrada.escaneoNativo || entrada.escaneoNativo.length === 0) {
    sinFuente.push({ medio: MEDIO, motivo: MOTIVO_SIN_ESCANEO });

    // Si hay conexión activa (o enLinea true), se añade UNA señal de «tu conexión actual» sin frecuencia ni banda inventada
    if (entrada.enLinea !== false) {
      const c = entrada.conexionActual;
      const calidad = c?.downlink ? Math.min(1, c.downlink / 50) : null;
      senales.push({
        id: "wifi:conexion-actual",
        medio: MEDIO,
        banda: "Wi-Fi (conexión actual)",
        frecuenciaKhz: null,
        anchoKhz: null,
        fuerzaDbm: null,
        calidad,
        origen: "medida",
        capa,
        fuente: FUENTE_CONEXION,
        medidoEn: c?.at ?? ahora,
        zona: null,
        compatibles: [],
      });
    }
  } else {
    // 2. Si hay escaneo nativo inyectado, se procesa cada red sin incluir jamás SSID ni BSSID
    for (const esc of entrada.escaneoNativo) {
      let frecuenciaKhz: number | null = null;
      let bandaNombre = "Wi-Fi (desconocida)";

      if (typeof esc.frecuenciaMhz === "number" && Number.isFinite(esc.frecuenciaMhz) && esc.frecuenciaMhz > 0) {
        frecuenciaKhz = esc.frecuenciaMhz * 1000;
        const b = bandaDeFrecuencia(frecuenciaKhz);
        if (b) {
          bandaNombre = b.etiqueta;
        }
      } else if (typeof esc.canal === "number" && Number.isInteger(esc.canal) && esc.canal > 0) {
        // Intentar deducir banda por canal
        const bTipo = esc.canal <= 14 ? "2.4" : esc.canal <= 177 ? "5" : "6";
        const f = frecuenciaDeCanalWifi(bTipo, esc.canal);
        if (f !== null) {
          frecuenciaKhz = f;
          const b = bandaDeFrecuencia(f);
          if (b) {
            bandaNombre = b.etiqueta;
          }
        }
      }

      const anchoKhz = typeof esc.anchoMhz === "number" && Number.isFinite(esc.anchoMhz) && esc.anchoMhz > 0 ? esc.anchoMhz * 1000 : null;
      const fuerzaDbm = typeof esc.rssi === "number" && Number.isFinite(esc.rssi) ? esc.rssi : null;
      const calidad = fuerzaDbm !== null ? qualityFromRssi(fuerzaDbm) : null;
      const origen: OrigenDato = fuerzaDbm !== null ? "medida" : "estimada";

      senales.push({
        id: `wifi:scan:${esc.id}`,
        medio: MEDIO,
        banda: bandaNombre,
        frecuenciaKhz,
        anchoKhz,
        fuerzaDbm,
        calidad,
        origen,
        capa,
        fuente: FUENTE_ESCANEO,
        medidoEn: esc.at ?? ahora,
        zona: null,
        compatibles: [],
      });
    }
  }

  return { senales, sinFuente };
}
