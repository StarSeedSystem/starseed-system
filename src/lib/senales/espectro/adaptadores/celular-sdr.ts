/**
 * celular-sdr — ranura pura del espectrómetro para celular y SDR (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Hoy NINGUNA API del OS ni del navegador entrega la celda ni la banda móvil a la
 * app (`CellInfo`/`TelephonyManager` no se leen en `native/` ni en `src/`). Sin
 * lectura inyectada se devuelve `sinFuente`; nunca se pinta un número inventado.
 * SDR es solo una ranura: `SIN_SDR` no está disponible. Cada valor lleva fuente y hora.
 * Puro: sin React, sin red, sin `node:*`, sin código nativo.
 */
import type { SenalEspectro, SinFuente } from "../tipos";
import {
  LISTA_BANDAS,
  bandaDeFrecuencia,
  etiquetaFrecuencia,
  type BandaConocida,
} from "../bandas";

export const MOTIVO_SIN_CELDA = "este aparato no entrega la celda ni la banda móvil a la app";
export const MOTIVO_SIN_SDR = "no hay un receptor SDR conectado";

export interface FuenteEspectroReal {
  nombre: string;
  disponible(): Promise<boolean>;
  barrer(desdeKhz: number, hastaKhz: number): Promise<{ frecuenciaKhz: number; fuerzaDbm: number }[]>;
}

export const SIN_SDR: FuenteEspectroReal = {
  nombre: "sin SDR",
  disponible: async () => false,
  barrer: async () => [],
};

export interface LecturaCelda { banda?: string; frecuenciaKhz?: number; fuerzaDbm?: number }
export interface LecturaCelular { celda?: LecturaCelda }
export interface RangoEspectro { desdeKhz: number; hastaKhz: number }
export interface ResultadoCelularSdr {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
}
const esNumeroFinito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const esCelular = (banda: BandaConocida) => banda.medio === "celular";

function bandaCelular(celda: LecturaCelda): BandaConocida | null {
  const nombre = (celda.banda ?? "").trim();
  const clave = nombre.toLowerCase().replace(/^celular-/, "");
  if (clave) {
    for (const banda of LISTA_BANDAS) {
      if (!esCelular(banda)) continue;
      if (banda.id.replace(/^celular-/, "") === clave) return banda;
      if (banda.etiqueta.toLowerCase().includes(nombre.toLowerCase())) return banda;
    }
  }
  const khz = celda.frecuenciaKhz;
  if (esNumeroFinito(khz) && khz > 0) {
    for (const banda of LISTA_BANDAS) {
      if (esCelular(banda) && khz >= banda.inicioKhz && khz <= banda.finKhz) return banda;
    }
  }
  return null;
}

function senalCelular(lectura: LecturaCelular, ahora: number): SenalEspectro | null {
  const celda = lectura.celda;
  if (!celda) return null;
  const frecuencia = esNumeroFinito(celda.frecuenciaKhz) && celda.frecuenciaKhz > 0 ? celda.frecuenciaKhz : null;
  const fuerza = esNumeroFinito(celda.fuerzaDbm) ? celda.fuerzaDbm : null;
  const banda = bandaCelular(celda);
  const cruda = typeof celda.banda === "string" ? celda.banda.trim() : "";
  if (frecuencia === null && fuerza === null && !banda && !cruda) return null;
  return {
    id: `celular:${banda?.id ?? "desconocida"}:${ahora}`, medio: "celular",
    banda: banda?.etiqueta ?? (cruda || "Celular (banda desconocida)"),
    frecuenciaKhz: frecuencia, anchoKhz: null, fuerzaDbm: fuerza, calidad: null,
    origen: frecuencia !== null || fuerza !== null ? "medida" : "declarada",
    capa: "propia", fuente: "lectura de la celda del aparato", medidoEn: ahora,
    zona: null, compatibles: [],
  };
}

export function adaptadorCelular(lectura: LecturaCelular | null): ResultadoCelularSdr {
  const senal = lectura ? senalCelular(lectura, Date.now()) : null;
  return senal
    ? { senales: [senal], sinFuente: [] }
    : { senales: [], sinFuente: [{ medio: "celular", motivo: MOTIVO_SIN_CELDA }] };
}

export async function adaptadorSdr(
  fuente: FuenteEspectroReal,
  rango: RangoEspectro,
): Promise<ResultadoCelularSdr> {
  let disponible = false;
  try {
    disponible = await fuente.disponible();
  } catch {
    disponible = false;
  }
  if (!disponible) return { senales: [], sinFuente: [{ medio: "sdr", motivo: MOTIVO_SIN_SDR }] };
  let puntos: { frecuenciaKhz: number; fuerzaDbm: number }[] = [];
  try {
    puntos = await fuente.barrer(rango.desdeKhz, rango.hastaKhz);
  } catch {
    puntos = [];
  }
  const ahora = Date.now();
  const senales: SenalEspectro[] = [];
  for (const [indice, punto] of puntos.entries()) {
    if (!esNumeroFinito(punto.frecuenciaKhz) || punto.frecuenciaKhz <= 0) continue;
    if (!esNumeroFinito(punto.fuerzaDbm)) continue;
    const conocida = bandaDeFrecuencia(punto.frecuenciaKhz);
    senales.push({
      id: `sdr:${indice}:${ahora}`, medio: "sdr",
      banda: conocida?.etiqueta ?? etiquetaFrecuencia(punto.frecuenciaKhz),
      frecuenciaKhz: punto.frecuenciaKhz, anchoKhz: null, fuerzaDbm: punto.fuerzaDbm,
      calidad: null, origen: "medida", capa: "propia", medidoEn: ahora,
      fuente: `SDR conectado: ${fuente.nombre}`, zona: null, compatibles: [],
    });
  }
  return { senales, sinFuente: [] };
}
