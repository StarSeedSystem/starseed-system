/**
 * lora-malla — adaptador puro del espectrómetro para LoRa y enlaces de la malla propia (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { EnlaceMapa } from "@/lib/senales/tipos-vivo";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { LISTA_BANDAS } from "../bandas";
import type { SenalEspectro, SinFuente, Medio, OrigenDato, CapaRed, Compatibilidad } from "../tipos";
import { qualityFromSnr, qualityFromRssi } from "@/ai/astraura/mesh/signals";

export interface ResultadoLoRa { senalRadio: SenalEspectro | null; senalesNodos: SenalEspectro[]; sinFuente: SinFuente | null; }
export interface ResultadoMalla { senalesEnlaces: SenalEspectro[]; }

export function bandaDeRegion(region: string): string | null {
  const r = region.toUpperCase();
  if (r.includes("433")) return "lora-433";
  if (r.includes("868") || r.includes("865") || r === "RU" || r === "IN") return "lora-868";
  if (r.includes("915") || r.includes("923") || r.includes("919") || r === "US" || r === "ANZ" || r === "KR" || r === "TW" || r === "MY_919" || r === "SG_923" || r === "TH" || r === "JP") return "lora-915";
  if (r === "LORA_24" || r === "24" || r === "2.4") return "lora-2.4";
  return null;
}

export function anchoDePreset(preset: string | null): number | null {
  if (!preset) return null;
  const p = preset.toUpperCase();
  if (p.includes("LONG_FAST") || p.includes("LONG_MODERATE") || p.includes("LONG_SLOW")) return 125000;
  if (p.includes("SHORT_FAST") || p.includes("SHORT_MODERATE") || p.includes("SHORT_SLOW") || p.includes("VERY_SHORT") || p.includes("MID") || p.includes("MEDIUM")) return 250000;
  return null;
}

export function crearSenalRadio(lora: SenalesMedio["lora"], region: string | null, preset: string | null, ahora: number): SenalEspectro | null {
  if (lora.estado === "sin-radio" || !region) return null;
  const bandaId = bandaDeRegion(region);
  if (!bandaId) return null;
  const banda = LISTA_BANDAS.find(b => b.id === bandaId);
  if (!banda) return null;
  return { id: `lora:radio:${region}`, medio: "lora", banda: banda.etiqueta, frecuenciaKhz: banda.centroKhz, anchoKhz: anchoDePreset(preset) ?? banda.anchosTipicosKhz[0] ?? null, fuerzaDbm: null, calidad: null, origen: "declarada", capa: "propia", fuente: `radio Meshtastic · región ${region} · ${lora.transporte ?? "desconocido"}`, medidoEn: ahora, zona: null, vinculo: { tipo: "antena", id: "radio-local" }, compatibles: [] };
}

export function crearSenalesNodos(nodos: DetectedSignal[], ahora: number): SenalEspectro[] {
  return nodos.filter(n => n.antenna === "lora" && !n.simulated).map(n => {
    const snrMetric = n.metrics.find(m => m.label === "SNR");
    const rssiMetric = n.metrics.find(m => m.label === "RSSI");
    const snr = snrMetric ? parseFloat(snrMetric.value.replace(" dB", "")) : null;
    const rssi = rssiMetric ? parseFloat(rssiMetric.value.replace(" dBm", "")) : null;
    const qSnr = snr != null ? qualityFromSnr(snr) : null;
    const qRssi = rssi != null ? qualityFromRssi(rssi) : null;
    const calidad = qSnr != null && qRssi != null ? qSnr * 0.65 + qRssi * 0.35 : qSnr ?? qRssi;
    return { id: n.id, medio: "lora" as Medio, banda: n.antennaLabel, frecuenciaKhz: null, anchoKhz: null, fuerzaDbm: rssi ?? null, calidad, origen: "medida" as OrigenDato, capa: "publica" as CapaRed, fuente: `radio Meshtastic · SNR/RSSI medidos por el chip`, medidoEn: n.lastHeard ?? ahora, zona: null, vinculo: { tipo: "nodo", id: n.id }, compatibles: [] };
  });
}

export function sinFuenteLoRa(lora: SenalesMedio["lora"]): SinFuente | null {
  return lora.estado === "sin-radio" ? { medio: "lora", motivo: "no hay radio LoRa conectada" } : null;
}

export function adaptarLoRa(lora: SenalesMedio["lora"], region: string | null, preset: string | null, nodos: DetectedSignal[], ahora = Date.now()): ResultadoLoRa {
  return { senalRadio: crearSenalRadio(lora, region, preset, ahora), senalesNodos: crearSenalesNodos(nodos, ahora), sinFuente: sinFuenteLoRa(lora) };
}

export function adaptarMalla(enlaces: readonly EnlaceMapa[], ahora = Date.now()): ResultadoMalla {
  const senalesEnlaces: SenalEspectro[] = [];
  for (const enlace of enlaces) {
    if (enlace.clase === "sin-enlace") continue;
    const compatibles: Compatibilidad[] = [];
    if (enlace.ruta) compatibles.push({ con: "wifi", que: "ruta medida", posible: true, motivo: `Latencia ${enlace.latenciaMs ?? "?"} ms · ${enlace.ruta.clase}` });
    senalesEnlaces.push({ id: `malla:${enlace.clase}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, medio: "malla", banda: "malla propia", frecuenciaKhz: null, anchoKhz: null, fuerzaDbm: null, calidad: enlace.latenciaMs != null ? 1 - Math.min(1, enlace.latenciaMs / 1000) : null, origen: "medida", capa: "propia", fuente: `enlace de la malla · ${enlace.etiqueta}`, medidoEn: ahora, zona: null, compatibles });
  }
  return { senalesEnlaces };
}