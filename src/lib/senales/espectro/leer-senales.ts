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
}

const CAMPOS_SENAL = `
  id,
  medio,
  banda,
  frecuencia_khz,
  ancho_khz,
  fuerza_dbm,
  calidad,
  origen,
  capa,
  fuente,
  medido_en,
  zona,
  vinculo_tipo,
  vinculo_id,
  compatibles
`.trim();

function filaASenal(row: Record<string, unknown>): SenalEspectro | null {
  const raw = {
    id: row.id,
    medio: row.medio,
    banda: row.banda,
    frecuenciaKhz: row.frecuencia_khz,
    anchoKhz: row.ancho_khz,
    fuerzaDbm: row.fuerza_dbm,
    calidad: row.calidad,
    origen: row.origen,
    capa: row.capa,
    fuente: row.fuente,
    medidoEn: row.medido_en,
    zona: row.zona,
    vinculo: row.vinculo_tipo && row.vinculo_id
      ? { tipo: row.vinculo_tipo, id: row.vinculo_id }
      : undefined,
    compatibles: row.compatibles ?? [],
  };
  return normalizarSenal(raw);
}

export async function leerSenalesPublicadas(deps: DepsLectura): Promise<ResultadoLectura> {
  const { cliente, uid } = deps;

  if (!cliente) {
    return { senales: [], estado: "sin-sesion", motivo: "no hay cliente de Supabase (sesión no iniciada)" };
  }

  const { data, error } = await cliente
    .from("os_senales_publicas")
    .select(CAMPOS_SENAL)
    .order("medido_en", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("relation") && error.message?.includes("does not exist")) {
      return { senales: [], estado: "sin-tabla", motivo: MOTIVO_SIN_TABLA };
    }
    return { senales: [], estado: "error", motivo: error.message };
  }

  if (!data || data.length === 0) {
    return { senales: [], estado: "ok" };
  }

  const senales: SenalEspectro[] = [];
  for (const row of data) {
    const s = filaASenal(row);
    if (!s) continue;
    if (s.vinculo?.id === uid) continue;
    senales.push({ ...s, capa: "publica", fuente: "publicada por su dueño" });
  }

  return { senales, estado: "ok" };
}