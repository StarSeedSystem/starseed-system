/**
 * wifi — adaptador puro del espectrómetro para Wi-Fi (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Convierte la información real de internet (`SenalesMedio.internet`), los enlaces
 * medidos (`enlacesDisponibles()` vía `fuentes-vivas.ts`) y, opcionalmente,
 * un escaneo nativo inyectado (`EscaneoWifi[]`), en `SenalEspectro` + `SinFuente`.
 * Un navegador NO escanea Wi-Fi: sin escaneo nativo, devuelve `sinFuente` y
 * como mucho UNA señal de «tu conexión actual» con `origen:"medida"` sin frecuencia.
 * Si se inyecta escaneo nativo, lo convierte con `bandas.ts` y NUNCA incluye SSID/BSSID.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente, Medio, OrigenDato, CapaRed, Compatibilidad } from "../tipos";
import { bandaDeFrecuencia, frecuenciaDeCanalWifi, etiquetaFrecuencia } from "../bandas";

export const MEDIO: Medio = "wifi";
const MOTIVO_SIN_ESCANEO = "este aparato no deja escanear redes Wi-Fi desde la app";

/** Información de internet medida por `SenalesMedio.internet` (Network Information API). */
export interface SenalesMedioInternet {
  enLinea: boolean;
  tipo?: string;
  efectivo?: string;
  mbps?: number;
}

/** Enlace medido crudo (lo que devuelve `enlacesDisponibles()` del transporte). */
export interface EnlaceDisponible {
  id: string;
  tipo: string;
  abierto: boolean;
  ruta?: string | null;
  rttMs?: number | null;
  capacidadKbps?: number | null;
  alcanza?: { neuronDeviceId?: string };
}

/** Un resultado de escaneo Wi-Fi nativo inyectado (p. ej. desde app nativa o daemon). */
export interface EscaneoWifi {
  /** Canal Wi-Fi (1-14 para 2.4 GHz, 36-177 para 5 GHz, 1-233 para 6 GHz). */
  canal?: number;
  /** Frecuencia central en MHz. */
  frecuenciaMhz?: number;
  /** Ancho de banda en MHz. */
  anchoMhz?: number;
  /** RSSI en dBm. */
  rssi?: number;
}

/** Entrada completa del adaptador. */
export interface EntradaWifi {
  /** `SenalesMedio.internet` — tipo, efectivo, mbps de la Network Information API. */
  senalesMedioInternet: SenalesMedioInternet;
  /** Enlaces abiertos con medida real ahora mismo (`fuentes-vivas.ts`). */
  enlacesDisponibles: readonly EnlaceDisponible[];
  /** Escaneo nativo inyectado (opcional). Si null/undefined → no hay escaneo. */
  escaneoNativo: readonly EscaneoWifi[] | null | undefined;
}

/** Resultado del adaptador: señales + fuentes faltantes. */
export interface ResultadoWifi {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
}

/** Convierte RSSI a calidad 0..1 (-110 dBm = 0, -40 dBm = 1). */
function calidadDeRssi(rssi: number): number {
  if (rssi <= -110) return 0;
  if (rssi >= -40) return 1;
  return (rssi + 110) / 70;
}

/** Determina la banda Wi-Fi a partir de frecuencia en kHz. */
function bandaDeFrecuenciaKhz(khz: number): string {
  const banda = bandaDeFrecuencia(khz);
  if (banda) return banda.etiqueta;
  if (khz >= 5925000 && khz <= 7125000) return "Wi-Fi 6 GHz (Wi-Fi 6E/7)";
  if (khz >= 5150000 && khz <= 5850000) return "Wi-Fi 5 GHz";
  if (khz >= 2401000 && khz <= 2483000) return "Wi-Fi 2,4 GHz";
  return "Wi-Fi (desconocido)";
}

/** Crea la señal de "tu conexión actual" desde SenalesMedio.internet. */
function crearSenalConexionActual(internet: SenalesMedioInternet, ahora: number): SenalEspectro {
  const enLinea = internet.enLinea;
  const origen: OrigenDato = enLinea ? "medida" : "estimada";
  const fuente = enLinea ? "tu conexión actual (medida)" : "tu conexión actual (estimada)";

  return {
    id: `wifi:conexion-actual:${ahora}`,
    medio: MEDIO,
    banda: "Wi-Fi (conexión actual)",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad: null,
    origen,
    capa: "propia",
    fuente,
    medidoEn: ahora,
    zona: null,
    compatibles: [],
  };
}

/** Crea una señal a partir de un enlace medido. */
function crearSenalEnlaceMedido(enlace: EnlaceDisponible, ahora: number): SenalEspectro | null {
  if (!enlace.abierto) return null;
  const rttMs = typeof enlace.rttMs === "number" && Number.isFinite(enlace.rttMs) && enlace.rttMs > 0 ? enlace.rttMs : null;
  const kbps = typeof enlace.capacidadKbps === "number" && Number.isFinite(enlace.capacidadKbps) && enlace.capacidadKbps > 0 ? enlace.capacidadKbps : null;
  if (rttMs === null && kbps === null) return null;

  const neuronaId = enlace.alcanza?.neuronDeviceId;
  if (!neuronaId) return null;

  // Calidad: por RTT si hay, si no por capacidad (20 Mbps = 1)
  let calidad: number | null = null;
  if (rttMs !== null) {
    // RTT: < 20ms = 1, > 200ms = 0, lineal en log
    calidad = Math.max(0, Math.min(1, 1 - Math.log10(rttMs / 20) / Math.log10(10)));
  } else if (kbps !== null) {
    calidad = Math.max(0, Math.min(1, kbps / 20_000));
  }

  return {
    id: `wifi:enlace:${enlace.id}`,
    medio: MEDIO,
    banda: "Wi-Fi (enlace medido)",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad,
    origen: "medida",
    capa: "propia",
    fuente: `enlace ${enlace.tipo} medido`,
    medidoEn: ahora,
    zona: null,
    vinculo: { tipo: "neurona", id: neuronaId },
    compatibles: [],
  };
}

/** Convierte un escaneo nativo a SenalEspectro. */
function crearSenalDeEscaneo(escaneo: EscaneoWifi, indice: number, ahora: number): SenalEspectro {
  let frecuenciaKhz: number | null = null;
  let anchoKhz: number | null = null;
  let banda = "Wi-Fi (desconocido)";

  // Frecuencia: prioridad a frecuenciaMhz, si no canal
  if (typeof escaneo.frecuenciaMhz === "number" && escaneo.frecuenciaMhz > 0) {
    frecuenciaKhz = Math.round(escaneo.frecuenciaMhz * 1000);
    banda = bandaDeFrecuenciaKhz(frecuenciaKhz);
  } else if (typeof escaneo.canal === "number" && escaneo.canal > 0) {
    // Intentar deducir banda del canal
    let bandaCanal: "2.4" | "5" | "6" | null = null;
    if (escaneo.canal >= 1 && escaneo.canal <= 14) bandaCanal = "2.4";
    else if (escaneo.canal >= 36 && escaneo.canal <= 177) bandaCanal = "5";
    else if (escaneo.canal >= 1 && escaneo.canal <= 233) bandaCanal = "6";

    if (bandaCanal) {
      const freq = frecuenciaDeCanalWifi(bandaCanal, escaneo.canal);
      if (freq) {
        frecuenciaKhz = freq;
        banda = bandaDeFrecuenciaKhz(freq);
      }
    }
  }

  // Ancho
  if (typeof escaneo.anchoMhz === "number" && escaneo.anchoMhz > 0) {
    anchoKhz = Math.round(escaneo.anchoMhz * 1000);
  }

  // RSSI y calidad
  let fuerzaDbm: number | null = null;
  let calidad: number | null = null;
  let origen: OrigenDato = "estimada";

  if (typeof escaneo.rssi === "number" && Number.isFinite(escaneo.rssi)) {
    fuerzaDbm = escaneo.rssi;
    calidad = calidadDeRssi(escaneo.rssi);
    origen = "medida";
  }

  return {
    id: `wifi:escaneo:${indice}:${ahora}`,
    medio: MEDIO,
    banda,
    frecuenciaKhz,
    anchoKhz,
    fuerzaDbm,
    calidad,
    origen,
    capa: "publica",
    fuente: "escaneo Wi-Fi nativo inyectado",
    medidoEn: ahora,
    zona: null,
    compatibles: [],
  };
}

/**
 * Adapta Wi-Fi al espectrómetro.
 * - Sin `escaneoNativo` → una señal de "tu conexión actual" + enlaces medidos + `sinFuente` (no se puede escanear).
 * - Con `escaneoNativo` → convierte cada escaneo (con banda/frecuencia correctas, sin SSID/BSSID).
 *   El escaneo nativo REEMPLAZA la señal de conexión y los enlaces; no hay sinFuente.
 */
export function adaptadorWifi(entrada: EntradaWifi): ResultadoWifi {
  const ahora = Date.now();
  const senales: SenalEspectro[] = [];
  const sinFuente: SinFuente[] = [];

  const escaneos = entrada.escaneoNativo ?? null;
  const hayEscaneoNativo = escaneos && escaneos.length > 0;

  if (hayEscaneoNativo) {
    // Con escaneo nativo: SOLO las señales del escaneo
    for (let i = 0; i < escaneos.length; i++) {
      senales.push(crearSenalDeEscaneo(escaneos[i], i, ahora));
    }
  } else {
    // Sin escaneo nativo: señal de conexión + enlaces medidos + sinFuente
    senales.push(crearSenalConexionActual(entrada.senalesMedioInternet, ahora));

    for (const enlace of entrada.enlacesDisponibles) {
      const senalEnlace = crearSenalEnlaceMedido(enlace, ahora);
      if (senalEnlace) senales.push(senalEnlace);
    }

    sinFuente.push({ medio: MEDIO, motivo: MOTIVO_SIN_ESCANEO });
  }

  return { senales, sinFuente };
}