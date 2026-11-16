/**
 * lora-malla — adaptador puro del espectrómetro para LoRa (MAP1116B).
 * ══════════════════════════════════════════════════════════════════════════════
 * Convierte la información real de la radio LoRa (`SenalesMedio.lora`, malla
 * `region`, `transporte`, `nodos`) y los nodos detectados (`DetectedSignal`) en
 * `SenalEspectro` + `SinFuente`.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente, Medio, OrigenDato } from "../tipos";
import { bandaDeFrecuencia, etiquetaFrecuencia } from "../bandas";
import { type DetectedSignal, qualityFromSnr, qualityFromRssi } from "@/ai/astraura/mesh/signals";

export const MEDIO: Medio = "lora";

/** Estado de la radio LoRa medido. */
export interface SenalesMedioLora {
  /** Estado de la conexión ("listo", "degradado", "sin-radio"). */
  estado: "listo" | "degradado" | "sin-radio";
  /** Tipo de transporte ("usb", "ble", "daemon", "simulator"). */
  transporte: "usb" | "ble" | "daemon" | "simulator" | null;
  /** Número de nodos oídos. */
  nodos: number;
  /** Región LoRa declarada por la radio. */
  region?: string | null;
  /** Preset del módem (por ejemplo "lora-868", "lora-915"). */
  preset?: string | null;
}

/** Entrada completa del adaptador LoRa. */
export interface EntradaLora {
  /** Información de la radio LoRa (`SenalesMedio.lora`). */
  senalesMedioLora: SenalesMedioLora;
  /** Señales LoRa detectadas por el radio (`DetectedSignal[]`). */
  sealesDetectadas: readonly DetectedSignal[];
  /** Ahora (epoch ms) para timestamps. */
  ahora: number;
}

/** Resultado del adaptador: señales + fuentes faltantes. */
export interface ResultadoLora {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
}

/** Convierte la calidad desde SNR o RSSI. */
function calidadFromSnrRssi(
  snr?: number | null,
  rssi?: number | null,
): number | null {
  if (snr != null && Number.isFinite(snr)) {
    return Math.max(0, Math.min(1, (snr + 20) / 30));
  }
  if (rssi != null && Number.isFinite(rssi)) {
    return Math.max(0, Math.min(1, (rssi + 110) / 70));
  }
  return null;
}

/** Determina la banda LoRa a partir de la frecuencia en kHz. */
function bandaDeFrecuenciaLoRa(khz: number): string | null {
  if (khz >= 433000 && khz <= 434700) return "LoRa 433 MHz";
  if (khz >= 863000 && khz <= 870000) return "LoRa 868 MHz";
  if (khz >= 902000 && khz <= 928000) return "LoRa 915 MHz";
  return null;
}

/** Obtiene la banda por defecto para una región conocida. */
function bandaPorDefectoRegion(region: string | undefined): string | null {
  if (!region) return null;
  const regiones: Record<string, string> = {
    EU_868: "LoRa 868 MHz",
    US_915: "LoRa 915 MHz",
    AU_433: "LoRa 433 MHz",
  };
  return regiones[region] ?? null;
}

/** Crea una señal LoRa con banda y frecuencia de la región declarada. */
function crearSenalLoRa(
  id: string,
  frecuenciaKhz: number | null,
  anchoKhz: number | null,
  fuerzaDbm: number | null,
  calidad: number | null,
  origen: OrigenDato,
  fuente: string,
  ahora: number,
  region?: string | null,
  preset?: string | null,
): SenalEspectro {
  let banda: string;
  let frecuenciaKhzUsada: number | null = frecuenciaKhz;

  // Determinar banda y frecuencia desde la región declarada (origen "declarada")
  if (region) {
    const bandaRegion = bandaPorDefectoRegion(region);
    if (bandaRegion) {
      banda = bandaRegion;
      // Establecer frecuencia típica para esa región
      switch (region) {
        case "EU_868":
          frecuenciaKhzUsada = 868500;
          break;
        case "US_915":
          frecuenciaKhzUsada = 915000;
          break;
        case "AU_433":
          frecuenciaKhzUsada = 433500;
          break;
        default:
          frecuenciaKhzUsada = null;
      }
    } else {
      // Región desconocida pero declarada
      banda = "LoRa (desconocido)";
      frecuenciaKhzUsada = null;
    }
  } else if (preset) {
    // Si no hay región pero sí preset, deducir banda del preset
    if (preset.includes("915")) {
      banda = "LoRa 915 MHz";
      frecuenciaKhzUsada = 915000;
    } else if (preset.includes("868")) {
      banda = "LoRa 868 MHz";
      frecuenciaKhzUsada = 868500;
    } else if (preset.includes("433")) {
      banda = "LoRa 433 MHz";
      frecuenciaKhzUsada = 433500;
    } else {
      banda = "LoRa (desconocido)";
      frecuenciaKhzUsada = null;
    }
  } else if (frecuenciaKhz != null) {
    // Si hay frecuencia pero no región ni preset, intentar determinar banda
    const bandaCalculada = bandaDeFrecuenciaLoRa(frecuenciaKhz);
    if (bandaCalculada) {
      banda = bandaCalculada;
    } else {
      // Frecuencia conocida pero banda no mapeable
      banda = "LoRa (desconocido)";
      frecuenciaKhzUsada = null;
    }
  } else {
    // Sin frecuencia, sin región, sin preset
    banda = "LoRa (desconocido)";
    frecuenciaKhzUsada = null;
  }

  return {
    id,
    medio: MEDIO,
    banda,
    frecuenciaKhz,
    anchoKhz,
    fuerzaDbm,
    calidad,
    origen,
    capa: "propia",
    fuente,
    medidoEn: ahora,
    zona: null,
    compatibles: [],
  };
}

/** Crea un motivo SinFuente para cuando no hay radio LoRa conectada. */
function crearSinFuente(): SinFuente {
  return { medio: MEDIO, motivo: "no hay radio LoRa conectada" };
}

/**
 * Adapta LoRa al espectrómetro.
 * - Sin radio conectada → `sinFuente` («no hay radio LoRa conectada»).
 * - Con radio y región EU → señal LoRa con banda y frecuencia de la REGIÓN según `bandas.ts`
 *   (origen `declarada`: lo que la radio está configurada a usar, no una medida de aire).
 *   y ancho del preset si lo informa.
 * - SNR/RSSI reales de cada nodo oído (`DetectedSignal.quality`, `qualityFromSnr/Rssi`) → señales `medida`.
 */
export function adaptadorLora(entrada: EntradaLora): ResultadoLora {
  const { senalesMedioLora, sealesDetectadas, ahora } = entrada;

  // Si no hay radio conectada, solo devolver sinFuente
  if (senalesMedioLora.estado === "sin-radio") {
    return { senales: [], sinFuente: [crearSinFuente()] };
  }

  const senales: SenalEspectro[] = [];
  const sinFuente: SinFuente[] = [];

  // Procesar cada señal detectada LoRa
  for (const senalDetectada of sealesDetectadas) {
    // Calidad desde SNR/RSSI de la señal detectada
    const calidad = senalDetectada.quality != null
      ? senalDetectada.quality
      : calidadFromSnrRssi(
          typeof senalDetectada.metrics?.find((m) => m.label === "SNR")?.value === "number"
            ? parseFloat((senalDetectada.metrics?.find((m) => m.label === "SNR")?.value as string) as string)
            : undefined,
          typeof senalDetectada.metrics?.find((m) => m.label === "RSSI")?.value === "number"
            ? parseFloat((senalDetectada.metrics?.find((m) => m.label === "RSSI")?.value as string) as string)
            : undefined,
        );

    // Frecuencia: declarar la frecuencia de la región configurada (origen declarado)
    // La región viene de SenalesMedioLora.region (lo que la radio está configurada a usar)
    let frecuenciaKhz: number | null = null;
    let anchoKhz: number | null = null;
    let fuerzaDbm: number | null = null;

    // Determinar frecuencia y banda desde la región declarada por la radio
    if (senalesMedioLora.region) {
      const regionBand = bandaDeFrecuenciaLoRa(0); // Usamos la función para obtener rangos
      // La región define el rango; usamos el centro típico
      switch (senalesMedioLora.region) {
        case "EU_868":
          frecuenciaKhz = 868500;
          anchoKhz = 125000; // preset típico
          break;
        case "US_915":
          frecuenciaKhz = 915000;
          anchoKhz = 125000; // preset típico
          break;
        case "AU_433":
          frecuenciaKhz = 433500;
          anchoKhz = 125000; // preset típico
          break;
        default:
          // Si la región es conocida, usamos el centro de la banda correspondiente
          frecuenciaKhz = 868500; // fallback a EU
          anchoKhz = 125000;
      }
    } else if (senalesMedioLora.preset) {
      // Si no hay región pero sí preset, deducir frecuencia del preset
      if (senalesMedioLora.preset.includes("915")) {
        frecuenciaKhz = 915000;
        anchoKhz = 125000;
      } else if (senalesMedioLora.preset.includes("868")) {
        frecuenciaKhz = 868500;
        anchoKhz = 125000;
      } else if (senalesMedioLora.preset.includes("433")) {
        frecuenciaKhz = 433500;
        anchoKhz = 125000;
      }
    }

    // Extraer RSSI/SNR de la señal detectada para fuerzaDbm y calidad
    if (senalDetectada.metrics) {
      const metricSnr = senalDetectada.metrics.find((m) => m.label === "SNR");
      const metricRssi = senalDetectada.metrics.find((m) => m.label === "RSSI");
      const valorSnr = metricSnr ? Number(metricSnr.value) : NaN;
      const valorRssi = metricRssi ? Number(metricRssi.value) : NaN;
      if (!isNaN(valorSnr)) {
        fuerzaDbm = Math.round(valorSnr - 140); // aproximación: SNR a RSSI
      }
      if (!isNaN(valorRssi)) {
        fuerzaDbm = Math.round(valorRssi);
      }
    }

    // Usar la calidad de la señal detectada si está disponible, sino calcularla
    const calidadFinal = calidad != null ? calidad : (senalDetectada.quality != null ? senalDetectada.quality : null);

    const senal = crearSenalLoRa(
      `lora:${senalDetectada.id}:${ahora}`,
      frecuenciaKhz,
      anchoKhz,
      fuerzaDbm,
      calidadFinal,
      "medida",
      `nodo LoRa detectado: ${senalDetectada.label}`,
      ahora,
      senalesMedioLora.region,
      senalesMedioLora.preset,
    );

    senales.push(senal);
  }

  // Si no hubo señales detectadas pero la radio está conectada, añadimos una señal genérica
  if (senales.length === 0 && senalesMedioLora.nodos > 0) {
    sinFuente.push({ medio: MEDIO, motivo: "nodos LoRa detectados pero sin métricas detalladas" });
  }

  return { senales, sinFuente };
}