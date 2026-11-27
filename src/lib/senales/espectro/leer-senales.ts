/**
 * leer-senales — lectura de señales publicadas en la capa pública (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarSenal, type SenalEspectro } from "./modelo";

export const MOTIVO_SIN_TABLA = "la tabla os_senales_publicas no existe en este proyecto";

export type EstadoLectura = "ok" | "sin-tabla" | "sin-sesion" | "error";

export interface ResultadoLectura {
  senales: SenalEspectro[];
  estado: EstadoLectura;
  motivo?: string;
}

export interface DepsLectura {
  cliente: SupabaseClient;
  uid: string;
  freno?: FrenoLectura;
  ahora?: () => number;
}

/** Solo columnas que existen en `os_senales_publicas` (una inexistente da 400 en cada sondeo). */
export const CAMPOS_SENAL =
  "id,owner_id,device_id,medio,banda,frecuencia_khz,ancho_khz,fuerza_dbm,calidad,origen,capa,medido_en,zona";

/** Espera entre lecturas tras fallos seguidos: 45 s × 2^(fallos-1), tope 15 min. */
export const ESPERA_BASE_MS = 45_000;
export const ESPERA_TOPE_MS = 15 * 60_000;

export function esperaTrasFallos(fallos: number): number {
  if (fallos <= 0) return 0;
  return Math.min(ESPERA_TOPE_MS, ESPERA_BASE_MS * 2 ** Math.min(fallos - 1, 10));
}

/** Estado del freno; se inyecta en pruebas, por defecto es uno del módulo. */
export interface FrenoLectura {
  fallos: number;
  hastaMs: number;
}

const frenoGlobal: FrenoLectura = { fallos: 0, hastaMs: 0 };

function aMs(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function filaASenal(row: unknown): SenalEspectro | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const raw = {
    id: r.id,
    medio: r.medio,
    banda: r.banda,
    frecuenciaKhz: r.frecuencia_khz ?? null,
    anchoKhz: r.ancho_khz ?? null,
    fuerzaDbm: r.fuerza_dbm ?? null,
    calidad: r.calidad ?? null,
    origen: r.origen,
    capa: r.capa,
    fuente: "publicada por su dueño",
    medidoEn: aMs(r.medido_en),
    zona: r.zona ?? null,
    vinculo: typeof r.device_id === "string" && r.device_id
      ? { tipo: "neurona", id: r.device_id }
      : undefined,
    compatibles: [],
  };
  return normalizarSenal(raw);
}

export async function leerSenalesPublicadas(deps: DepsLectura): Promise<ResultadoLectura> {
  const { cliente, uid } = deps;
  const freno = deps.freno ?? frenoGlobal;
  const ahora = deps.ahora ?? Date.now;

  if (!cliente) {
    return { senales: [], estado: "sin-sesion", motivo: "no hay cliente de Supabase (sesión no iniciada)" };
  }

  // Tras un fallo no se vuelve a preguntar hasta que pase la espera creciente.
  if (freno.fallos > 0 && ahora() < freno.hastaMs) {
    return { senales: [], estado: "error", motivo: "lectura en espera tras un fallo anterior" };
  }

  const fallar = (r: ResultadoLectura): ResultadoLectura => {
    freno.fallos += 1;
    freno.hastaMs = ahora() + esperaTrasFallos(freno.fallos);
    return r;
  };

  const { data, error } = await cliente
    .from("os_senales_publicas")
    .select(CAMPOS_SENAL)
    .order("medido_en", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("relation") && error.message?.includes("does not exist")) {
      return fallar({ senales: [], estado: "sin-tabla", motivo: MOTIVO_SIN_TABLA });
    }
    return fallar({ senales: [], estado: "error", motivo: error.message });
  }

  freno.fallos = 0;
  freno.hastaMs = 0;

  if (!data || data.length === 0) {
    return { senales: [], estado: "ok" };
  }

  const senales: SenalEspectro[] = [];
  for (const row of data) {
    if ((row as Record<string, unknown>).owner_id === uid) continue;
    const s = filaASenal(row);
    if (!s) continue;
    senales.push({ ...s, capa: "publica", fuente: "publicada por su dueño" });
  }

  return { senales, estado: "ok" };
}