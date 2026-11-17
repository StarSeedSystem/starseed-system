/**
 * Tipos y constantes para PanelFiltrosSenales (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { BandaConocida } from "@/lib/senales/espectro/bandas";
import type { Medio, OrigenDato, CapaRed } from "@/lib/senales/espectro/tipos";

export interface RangoKhz {
  minKhz: number | null;
  maxKhz: number | null;
}

export interface FiltroSenales {
  frecuencia: RangoKhz;
  ancho: RangoKhz;
  capas: CapaRed[];
  medios: Medio[];
  origenes: OrigenDato[];
  soloCompatibles: boolean;
  texto: string;
}

export interface PanelFiltrosSenalesProps {
  filtro: FiltroSenales;
  onCambiar: (filtro: FiltroSenales) => void;
  visibles: number;
  ocultasSinDato: number;
}

export const CAPAS_RED: readonly CapaRed[] = ["propia", "publica", "comunidad", "privada", "externa"] as const;
export const ETIQUETA_CAPA: Record<CapaRed, string> = {
  propia: "Propia",
  publica: "Pública",
  comunidad: "Comunidad",
  privada: "Privada",
  externa: "Externa",
};

export const MEDIOS: readonly Medio[] = ["wifi", "bluetooth", "lora", "celular", "malla", "internet", "estacion", "sdr"];
export const ETIQUETA_MEDIO: Record<Medio, string> = {
  wifi: "Wi-Fi",
  bluetooth: "Bluetooth",
  lora: "LoRa",
  celular: "Celular",
  malla: "Malla",
  internet: "Internet",
  estacion: "Estación",
  sdr: "SDR",
};

export const ORIGENES: readonly OrigenDato[] = ["medida", "declarada", "estimada"];
export const ETIQUETA_ORIGEN: Record<OrigenDato, string> = {
  medida: "Medida",
  declarada: "Declarada",
  estimada: "Estimada",
};

export const UNIDADES_FRECUENCIA = ["kHz", "MHz", "GHz"] as const;
export const UNIDADES_ANCHO = ["kHz", "MHz"] as const;

export type UnidadFrecuencia = (typeof UNIDADES_FRECUENCIA)[number];
export type UnidadAncho = (typeof UNIDADES_ANCHO)[number];

export function khzAValor(khz: number | null, unidad: UnidadFrecuencia): string {
  if (khz === null) return "";
  switch (unidad) {
    case "kHz":
      return String(khz);
    case "MHz":
      return String(khz / 1000);
    case "GHz":
      return String(khz / 1_000_000);
  }
}

export function valorAKhz(valor: string, unidad: UnidadFrecuencia): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  switch (unidad) {
    case "kHz":
      return n;
    case "MHz":
      return Math.round(n * 1000);
    case "GHz":
      return Math.round(n * 1_000_000);
  }
}

export function khzAnchoAValor(khz: number | null, unidad: UnidadAncho): string {
  if (khz === null) return "";
  switch (unidad) {
    case "kHz":
      return String(khz);
    case "MHz":
      return String(khz / 1000);
  }
}

export function valorAnchoAKhz(valor: string, unidad: UnidadAncho): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  switch (unidad) {
    case "kHz":
      return n;
    case "MHz":
      return Math.round(n * 1000);
  }
}

export interface BandaConocidaRef extends BandaConocida {}