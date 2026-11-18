/**
 * filtros — filtrado puro de señales del espectrómetro (AUD1117).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro } from "../espectro/tipos";
import type { FiltroSenales, RangoKhz } from "@/components/mesh/mapa-senales/geo/panel-filtros-senales-tipos";

/** Filtra una lista de señales según el estado del filtro. Devuelve las que pasan el filtro. */
export function filtrarSenales(senales: readonly SenalEspectro[], filtro: FiltroSenales): SenalEspectro[] {
  return senales.filter((s) => pasaFiltro(s, filtro));
}

/** Cuenta cuántas señales pasan el filtro y cuántas no (incluyendo las sin dato de frecuencia). */
export function contarFiltradas(senales: readonly SenalEspectro[], filtro: FiltroSenales): { visibles: number; ocultasSinDato: number } {
  let visibles = 0;
  let ocultasSinDato = 0;
  for (const s of senales) {
    if (pasaFiltro(s, filtro)) {
      visibles++;
    } else {
      if (s.frecuenciaKhz === null) ocultasSinDato++;
    }
  }
  return { visibles, ocultasSinDato };
}

function pasaFiltro(s: SenalEspectro, f: FiltroSenales): boolean {
  if (!pasaRango(s.frecuenciaKhz, f.frecuencia)) return false;
  if (!pasaRango(s.anchoKhz, f.ancho)) return false;
  if (f.capas.length > 0 && !f.capas.includes(s.capa)) return false;
  if (f.medios.length > 0 && !f.medios.includes(s.medio)) return false;
  if (f.origenes.length > 0 && !f.origenes.includes(s.origen)) return false;
  if (f.texto.trim() && !coincideTexto(s, f.texto.trim().toLowerCase())) return false;
  if (f.soloCompatibles && !s.compatibles.some((c) => c.posible)) return false;
  return true;
}

function pasaRango(valor: number | null, rango: RangoKhz): boolean {
  if (valor === null) return false;
  if (rango.minKhz !== null && valor < rango.minKhz) return false;
  if (rango.maxKhz !== null && valor > rango.maxKhz) return false;
  return true;
}

function coincideTexto(s: SenalEspectro, texto: string): boolean {
  const haystack = [
    s.id,
    s.medio,
    s.banda,
    s.fuente,
    s.zona ?? "",
    s.vinculo?.tipo ?? "",
    s.vinculo?.id ?? "",
    ...s.compatibles.map((c) => `${c.con} ${c.que} ${c.motivo}`),
  ].join(" ").toLowerCase();
  return haystack.includes(texto);
}

/** Estado inicial del filtro (todo abierto). */
export const FILTRO_INICIAL: FiltroSenales = {
  frecuencia: { minKhz: null, maxKhz: null },
  ancho: { minKhz: null, maxKhz: null },
  capas: [],
  medios: [],
  origenes: [],
  soloCompatibles: false,
  texto: "",
};

/** True si el filtro no está filtrando nada (estado inicial). */
export function filtroEsVacio(f: FiltroSenales): boolean {
  return (
    f.frecuencia.minKhz === null &&
    f.frecuencia.maxKhz === null &&
    f.ancho.minKhz === null &&
    f.ancho.maxKhz === null &&
    f.capas.length === 0 &&
    f.medios.length === 0 &&
    f.origenes.length === 0 &&
    !f.soloCompatibles &&
    f.texto.trim() === ""
  );
}