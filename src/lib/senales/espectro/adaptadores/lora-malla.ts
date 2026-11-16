/**
 * lora-malla — adaptador puro del espectrómetro para LoRa y enlaces de malla (MRE3/MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Convierte SenalesMedio.lora + región + nodos detectados y enlaces de malla EnlaceMapa
 * en SenalEspectro. Puro: sin React, sin red, sin node:*.
 */

import type { SenalEspectro, SinFuente, Medio, CapaRed, OrigenDato } from "../tipos";
import { qualityFromSnr, qualityFromRssi } from "@/ai/astraura/mesh/signals";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { BANDAS_CONOCIDAS } from "../bandas";
import type { EnlaceMapa } from "@/lib/senales/tipos-vivo";

export interface EntradaLora {
  senalesMedio: {
    lora: {
      estado: string;
      transporte?: string | null;
      nodos: number;
    };
    region?: string | null;
    preset?: {
      anchoKhz?: number;
      frecuenciaKhz?: number;
    } | null;
  };
  nodosDetectados: readonly {
    id: string;
    snr?: number | null;
    rssi?: number | null;
    frecuenciaKhz?: number | null;
    medidoEn?: number | null;
  }[];
}

export interface EntradaMalla {
  enlaces: readonly EnlaceMapa[];
}

export function adaptarLora(entrada: EntradaLora): readonly SenalEspectro[] | SinFuente;

export function adaptarMalla(entrada: EntradaMalla): readonly SenalEspectro[] | SinFuente;
