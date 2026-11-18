/**
 * filtrar — filtro puro de señales del espectrómetro (AQ03).
 * ══════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, Medio, OrigenDato, CapaRed } from "./tipos";
import type { FiltroSenales, RangoKhz } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales-tipos";

function enRango(valor: number | null, rango: RangoKhz): boolean {
  if (valor === null) return false;
  if (rango.minKhz !== null && valor < rango.minKhz) return false;
  if (rango.maxKhz !== null && valor > rango.maxKhz) return false;
  return true;
}

function coincideCapa(capa: CapaRed, filtroCapas: CapaRed[]): boolean {
  if (filtroCapas.length === 0) return true;
  return filtroCapas.includes(capa);
}

function coincideMedio(medio: Medio, filtroMedios: Medio[]): boolean {
  if (filtroMedios.length === 0) return true;
  return filtroMedios.includes(medio);
}

function coincideOrigen(origen: OrigenDato, filtroOrigenes: OrigenDato[]): boolean {
  if (filtroOrigenes.length === 0) return true;
  return filtroOrigenes.includes(origen);
}

function coincideTexto(senal: SenalEspectro, texto: string): boolean {
  if (!texto.trim()) return true;
  const t = texto.toLowerCase();
  const buscables = [
    senal.medio,
    senal.banda,
    senal.fuente,
    senal.zona ?? "",
    senal.vinculo?.id ?? "",
    senal.vinculo?.tipo ?? "",
  ].join(" ").toLowerCase();
  return buscables.includes(t);
}

export function filtrarSenales(senales: readonly SenalEspectro[], filtro: FiltroSenales): SenalEspectro[] {
  return senales.filter((s) => {
    if (!enRango(s.frecuenciaKhz, filtro.frecuencia)) return false;
    if (!enRango(s.anchoKhz, filtro.ancho)) return false;
    if (!coincideCapa(s.capa, filtro.capas)) return false;
    if (!coincideMedio(s.medio, filtro.medios)) return false;
    if (!coincideOrigen(s.origen, filtro.origenes)) return false;
    if (!coincideTexto(s, filtro.texto)) return false;
    return true;
  });
}

export function contarSinDatoFrecuencia(senales: readonly SenalEspectro[]): number {
  return senales.filter((s) => s.frecuenciaKhz === null).length;
}