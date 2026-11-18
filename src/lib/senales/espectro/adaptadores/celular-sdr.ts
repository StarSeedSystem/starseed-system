/**
 * celular-sdr — adaptadores del espectrómetro para celular y SDR (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Hoy ninguna API del OS ni del navegador entrega la celda a la app: sin lectura
 * inyectada se declara `sinFuente` y no se pinta ningún número. El SDR es solo
 * una ranura: sin `disponible()` verdadero no se barre nada.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente, Medio, OrigenDato } from "../tipos";
import {
  BANDAS_CONOCIDAS,
  LISTA_BANDAS,
  bandaDeFrecuencia,
  etiquetaFrecuencia,
  type BandaConocida,
} from "../bandas";

export interface PuntoMedido { frecuenciaKhz: number; fuerzaDbm: number; }
export interface RangoBarrer { desdeKhz: number; hastaKhz: number; }
export interface FuenteEspectroReal {
  nombre: string;
  disponible(): Promise<boolean>;
  barrer(desdeKhz: number, hastaKhz: number): Promise<PuntoMedido[]>;
}
export interface CeldaLeida { banda?: string; frecuenciaKhz?: number; fuerzaDbm?: number; }
export interface LecturaCelular { celda?: CeldaLeida; }
export interface ResultadoEspectro { senales: SenalEspectro[]; sinFuente: SinFuente[]; }

export const SIN_SDR: FuenteEspectroReal = Object.freeze({
  nombre: "sin-sdr",
  disponible: async () => false,
  barrer: async () => [],
});

const MOTIVO_SIN_CELDA = "este aparato no entrega la celda ni la banda móvil a la app";
const MOTIVO_SIN_SDR = "no hay un receptor SDR conectado";
const MOTIVO_FALLO_SDR = "el receptor SDR está conectado pero no entregó el barrido";

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function crearSenal(datos: {
  id: string; medio: Medio; banda: string; frecuenciaKhz: number | null;
  fuerzaDbm: number | null; origen: OrigenDato; fuente: string; medidoEn: number;
}): SenalEspectro {
  return { anchoKhz: null, calidad: null, capa: "propia", zona: null, compatibles: [], ...datos };
}

function bandaPorTexto(texto: string): BandaConocida | null {
  const clave = texto.trim().toLowerCase();
  if (!clave) return null;
  for (const candidata of [clave, `celular-${clave}`]) {
    const banda = BANDAS_CONOCIDAS[candidata];
    if (banda && banda.medio === "celular") return banda;
  }
  return LISTA_BANDAS.find((b) => b.medio === "celular" && b.etiqueta.toLowerCase() === clave) ?? null;
}

export function adaptadorCelular(lectura: LecturaCelular | null): ResultadoEspectro {
  const celda = lectura?.celda;
  if (!celda || (!celda.banda && !esNumero(celda.frecuenciaKhz) && !esNumero(celda.fuerzaDbm))) {
    return { senales: [], sinFuente: [{ medio: "celular", motivo: MOTIVO_SIN_CELDA }] };
  }
  const frecuencia = esNumero(celda.frecuenciaKhz) && celda.frecuenciaKhz > 0 ? celda.frecuenciaKhz : null;
  const conocida = frecuencia !== null ? bandaDeFrecuencia(frecuencia) : null;
  const banda = (conocida?.medio === "celular" ? conocida : null) ?? (celda.banda ? bandaPorTexto(celda.banda) : null);
  const fuerza = esNumero(celda.fuerzaDbm) ? celda.fuerzaDbm : null;
  const ahora = Date.now();
  return {
    senales: [crearSenal({
      id: `celular:celda:${ahora}`,
      medio: "celular",
      banda: banda?.etiqueta ?? "Celular (sin banda conocida)",
      frecuenciaKhz: frecuencia,
      fuerzaDbm: fuerza,
      origen: fuerza !== null ? "medida" : "estimada",
      fuente: "lectura de celda del aparato",
      medidoEn: ahora,
    })],
    sinFuente: [],
  };
}

export async function adaptadorSdr(
  fuente: FuenteEspectroReal,
  rango: RangoBarrer,
): Promise<ResultadoEspectro> {
  let disponible = false;
  try { disponible = await fuente.disponible(); } catch { disponible = false; }
  if (!disponible) return { senales: [], sinFuente: [{ medio: "sdr", motivo: MOTIVO_SIN_SDR }] };

  let puntos: readonly PuntoMedido[] = [];
  try { puntos = await fuente.barrer(rango.desdeKhz, rango.hastaKhz); }
  catch { return { senales: [], sinFuente: [{ medio: "sdr", motivo: MOTIVO_FALLO_SDR }] }; }

  const ahora = Date.now();
  const nombre = fuente.nombre.trim() || "SDR";
  const senales = puntos
    .filter((p) => esNumero(p.frecuenciaKhz) && p.frecuenciaKhz > 0 && esNumero(p.fuerzaDbm))
    .map((p, i) => crearSenal({
      id: `sdr:${i}:${p.frecuenciaKhz}:${ahora}`,
      medio: "sdr",
      banda: bandaDeFrecuencia(p.frecuenciaKhz)?.etiqueta ?? etiquetaFrecuencia(p.frecuenciaKhz),
      frecuenciaKhz: p.frecuenciaKhz,
      fuerzaDbm: p.fuerzaDbm,
      origen: "medida",
      fuente: `SDR conectado: ${nombre}`,
      medidoEn: ahora,
    }));
  return { senales, sinFuente: [] };
}
