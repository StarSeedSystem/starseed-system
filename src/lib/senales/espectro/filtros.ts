/**
 * filtros — filtros del espectrómetro por frecuencia, ancho, capa, medio, origen y compatibilidad (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`. Una señal sin el dato pedido no pasa: no se adivina.
 */

import type { CapaRed, Medio, OrigenDato, SenalEspectro } from "./tipos";
type Rango = { desde?: number; hasta?: number };

/** Criterios combinables del panel de filtros. */
export interface FiltroEspectro {
  frecuenciaKhz?: Rango;
  anchoKhz?: Rango;
  capas?: CapaRed[];
  medios?: Medio[];
  origenes?: OrigenDato[];
  soloCompatibles?: boolean;
  texto?: string;
}

/** Resultado con el recuento de las que quedaron fuera por no tener el dato. */
export interface ResultadoFiltro {
  visibles: SenalEspectro[];
  ocultasSinDato: number;
}

/** Filtro que no filtra nada. */
export const FILTRO_VACIO: FiltroEspectro = {};

function rangoCorregido(rango?: Rango): Rango | null {
  if (!rango) return null;
  let desde = typeof rango.desde === "number" && Number.isFinite(rango.desde) ? rango.desde : undefined;
  let hasta = typeof rango.hasta === "number" && Number.isFinite(rango.hasta) ? rango.hasta : undefined;
  if (desde !== undefined && hasta !== undefined && desde > hasta) [desde, hasta] = [hasta, desde];
  return desde === undefined && hasta === undefined ? null : { desde, hasta };
}

/** Distingue «no hay dato» de «no cumple» contra un rango. */
function pasaRango(valor: number | null, rango: Rango | null): "si" | "no" | "sin-dato" {
  if (!rango) return "si";
  if (valor === null || !Number.isFinite(valor)) return "sin-dato";
  if (rango.desde !== undefined && valor < rango.desde) return "no";
  if (rango.hasta !== undefined && valor > rango.hasta) return "no";
  return "si";
}

function textoDeSenal(s: SenalEspectro): string {
  return [s.id, s.banda, s.medio, s.origen, s.capa, s.fuente, s.zona ?? ""].join(" ").toLowerCase();
}

const NOMBRE_CAPA: Record<CapaRed, string> = { propia: "propia", publica: "pública", comunidad: "comunidad", privada: "privada", externa: "externa" };
const NOMBRE_MEDIO: Record<Medio, string> = { wifi: "Wi-Fi", bluetooth: "Bluetooth", lora: "LoRa", celular: "celular", malla: "malla", internet: "internet", estacion: "estación", sdr: "SDR" };
const NOMBRE_ORIGEN: Record<OrigenDato, string> = { medida: "medida", declarada: "declarada", estimada: "estimada" };

function valorCorto(khz: number): { n: string; u: string } {
  const mhz = khz / 1000;
  if (mhz >= 1000) return { n: String(Math.trunc(mhz / 100) / 10).replace(".", ","), u: "GHz" };
  return { n: String(Math.trunc(mhz * 10) / 10).replace(".", ","), u: "MHz" };
}

function rangoCorto(rango: Rango): string {
  if (rango.desde !== undefined && rango.hasta !== undefined) {
    const a = valorCorto(rango.desde);
    const b = valorCorto(rango.hasta);
    if (a.u === b.u && a.n === b.n) return `${a.n} ${a.u}`;
    if (a.u === b.u) return `${a.n}-${b.n} ${a.u}`;
    return `${a.n} ${a.u}–${b.n} ${b.u}`;
  }
  const uno = valorCorto(rango.desde ?? rango.hasta ?? 0);
  return `${rango.desde !== undefined ? "≥" : "≤"} ${uno.n} ${uno.u}`;
}
export function filtrarSenales(senales: SenalEspectro[], f: FiltroEspectro = FILTRO_VACIO): SenalEspectro[] {
  return filtrarConCuenta(senales, f).visibles;
}

export function filtrarConCuenta(senales: SenalEspectro[], f: FiltroEspectro = FILTRO_VACIO): ResultadoFiltro {
  const frecuencia = rangoCorregido(f.frecuenciaKhz);
  const ancho = rangoCorregido(f.anchoKhz);
  const capas = f.capas?.length ? new Set<CapaRed>(f.capas) : null;
  const medios = f.medios?.length ? new Set<Medio>(f.medios) : null;
  const origenes = f.origenes?.length ? new Set<OrigenDato>(f.origenes) : null;
  const texto = f.texto?.trim().toLowerCase() ?? "";
  const visibles: SenalEspectro[] = [];
  let ocultasSinDato = 0;

  for (const s of senales) {
    if (capas && !capas.has(s.capa)) continue;
    if (medios && !medios.has(s.medio)) continue;
    if (origenes && !origenes.has(s.origen)) continue;
    if (f.soloCompatibles && !s.compatibles.some((c) => c.posible)) continue;
    if (texto && !textoDeSenal(s).includes(texto)) continue;
    const porFrecuencia = pasaRango(s.frecuenciaKhz, frecuencia);
    if (porFrecuencia !== "si") { if (porFrecuencia === "sin-dato") ocultasSinDato++; continue; }
    const porAncho = pasaRango(s.anchoKhz, ancho);
    if (porAncho !== "si") { if (porAncho === "sin-dato") ocultasSinDato++; continue; }
    visibles.push(s);
  }
  return { visibles, ocultasSinDato };
}

export function filtroActivo(f: FiltroEspectro = FILTRO_VACIO): boolean {
  return Boolean(rangoCorregido(f.frecuenciaKhz) || rangoCorregido(f.anchoKhz)
    || (f.capas?.length ?? 0) > 0 || (f.medios?.length ?? 0) > 0
    || (f.origenes?.length ?? 0) > 0 || f.soloCompatibles
    || (f.texto?.trim().length ?? 0) > 0);
}

export function resumenFiltro(f: FiltroEspectro = FILTRO_VACIO): string {
  const partes: string[] = [];
  const frecuencia = rangoCorregido(f.frecuenciaKhz);
  const ancho = rangoCorregido(f.anchoKhz);
  if (frecuencia) partes.push(rangoCorto(frecuencia));
  if (ancho) partes.push(rangoCorto(ancho));
  if (f.capas?.length) partes.push(f.capas.map((c) => NOMBRE_CAPA[c]).join(", "));
  if (f.medios?.length) partes.push(f.medios.map((m) => NOMBRE_MEDIO[m]).join(", "));
  if (f.origenes?.length) partes.push(f.origenes.map((o) => NOMBRE_ORIGEN[o]).join(", "));
  if (f.soloCompatibles) partes.push("solo compatibles");
  const texto = f.texto?.trim();
  if (texto) partes.push(`«${texto}»`);
  return partes.length > 0 ? partes.join(" · ") : "sin filtros";
}
