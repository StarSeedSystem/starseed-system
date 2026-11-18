/**
 * leer-senales — lectura de señales publicadas por sus dueños (os_senales_publicas, MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cada fila conserva la capa en la que su dueño la publicó (pública, comunidad o privada):
 * el mapa la necesita para pintar cada capa red-* con lo suyo. Puro: sin React, sin red, sin `node:*`.
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

function filaASenal(row: unknown): SenalEspectro | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const raw = {
    id: r.id,
    medio: r.medio,
    banda: r.banda,
    frecuenciaKhz: r.frecuencia_khz,
    anchoKhz: r.ancho_khz,
    fuerzaDbm: r.fuerza_dbm,
    calidad: r.calidad,
    origen: r.origen,
    capa: r.capa,
    fuente: r.fuente,
    medidoEn: r.medido_en,
    zona: r.zona,
    vinculo: r.vinculo_tipo && r.vinculo_id
      ? { tipo: r.vinculo_tipo, id: r.vinculo_id }
      : undefined,
    compatibles: r.compatibles ?? [],
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
    senales.push({ ...s, fuente: "publicada por su dueño" });
  }

  return { senales, estado: "ok" };
}