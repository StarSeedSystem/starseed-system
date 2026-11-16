/**
 * publicar — upsert de filas elegidas a os_senales_publicas (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin `node:*`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { filasAPublicar, type EntradaPublicacion, type FilaPublicable } from "./publicacion";
export function esFaltaDeEsquema(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string } | null | undefined;
  if (!e) return false;
  const code = String(e.code ?? "");
  if (["42P01", "42883", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache")
  );
}

export const TABLA_SENIALES_PUBLICAS = "public.os_senales_publicas";
export const PERIODO_MS = 45_000;

export const MOTIVO_ESQUEMA_FALTANTE = "las señales públicas aún no están activadas en este servidor";

export interface DepsPublicar {
  cliente: SupabaseClient;
  uid: string;
  filas: FilaPublicable[];
  ahora: number;
}

export interface ResultadoPublicar {
  ok: boolean;
  publicadas: number;
  motivo?: string;
  reintentarEnMs?: number;
}

type FilaDb = {
  id: string;
  owner_id: string;
  device_id: string;
  capa: "publica" | "comunidad" | "privada";
  comunidad: string | null;
  medio: string;
  banda: string;
  frecuencia_khz: number | null;
  ancho_khz: number | null;
  fuerza_dbm: number | null;
  calidad: number | null;
  origen: "medida" | "declarada" | "estimada";
  zona: string | null;
  ficha: string;
  medido_en: number;
  publicada_en: string;
};

function filaAFilaDb(fila: FilaPublicable, uid: string, deviceId: string, ahora: number): FilaDb {
  const ahoraISO = new Date(ahora).toISOString();
  return {
    id: fila.id,
    owner_id: uid,
    device_id: deviceId,
    capa: fila.capa,
    comunidad: fila.comunidad,
    medio: fila.medio,
    banda: fila.banda,
    frecuencia_khz: fila.frecuenciaKhz,
    ancho_khz: fila.anchoKhz,
    fuerza_dbm: fila.fuerzaDbm,
    calidad: fila.calidad,
    origen: fila.origen,
    zona: fila.zona,
    ficha: "",
    medido_en: fila.medidoEn ?? ahora,
    publicada_en: ahoraISO,
  };
}

let esquemaFaltante = false;
let tiempoBloqueadoMs = 0;

export function reiniciarEstadoPublicarParaTests(): void {
  esquemaFaltante = false;
  tiempoBloqueadoMs = 0;
}

export async function publicarSenales(deps: DepsPublicar): Promise<ResultadoPublicar> {
  const { cliente, uid, filas, ahora } = deps;

  if (esquemaFaltante) {
    const ahoraMs = Date.now();
    if (ahoraMs - tiempoBloqueadoMs < PERIODO_MS * (5000 / PERIODO_MS)) {
      return { ok: false, publicadas: 0, motivo: MOTIVO_ESQUEMA_FALTANTE, reintentarEnMs: PERIODO_MS * 300 - (ahoraMs - tiempoBloqueadoMs) };
    }
    esquemaFaltante = false;
  }

  const ahoraMs = Date.now();
  if (tiempoBloqueadoMs > 0 && ahoraMs - tiempoBloqueadoMs < PERIODO_MS) {
    return { ok: false, publicadas: 0, motivo: "En espera de período de 45 s", reintentarEnMs: PERIODO_MS - (ahoraMs - tiempoBloqueadoMs) };
  }

  if (filas.length === 0) {
    return { ok: true, publicadas: 0 };
  }

  const deviceId = filas[0].id.split(":")[0] || "desconocido";
  const filasDb = filas.map((f) => filaAFilaDb(f, uid, deviceId, ahora));

  try {
    const { error } = await cliente.from(TABLA_SENIALES_PUBLICAS).upsert(filasDb, {
      onConflict: "owner_id,device_id,medio,banda,frecuencia_khz",
    });

    if (error) {
      if (esFaltaDeEsquema(error)) {
        esquemaFaltante = true;
        tiempoBloqueadoMs = ahoraMs;
        return { ok: false, publicadas: 0, motivo: MOTIVO_ESQUEMA_FALTANTE, reintentarEnMs: PERIODO_MS * 300 };
      }
      return { ok: false, publicadas: 0, motivo: `Error al publicar: ${error.message ?? "desconocido"}` };
    }

    await eliminarFilasPropias(cliente, uid, deviceId, filas);

    tiempoBloqueadoMs = ahoraMs;

    return { ok: true, publicadas: filasDb.length };
  } catch (e) {
    return { ok: false, publicadas: 0, motivo: e instanceof Error ? e.message : "error inesperado" };
  }
}

async function obtenerFilasPropiasParaEliminar(
  cliente: SupabaseClient,
  uid: string,
  deviceId: string,
  filasActuales: FilaPublicable[]
): Promise<number> {
  const idsFilasActuales = new Set(filasActuales.map((f) => f.id));

  const { data, error } = await cliente
    .from(TABLA_SENIALES_PUBLICAS)
    .select("id, device_id, owner_id")
    .eq("owner_id", uid)
    .eq("device_id", deviceId);

  if (error) return 0;
  if (!data || data.length === 0) return 0;

  let aEliminar = 0;
  for (const fila of data as { id: string; device_id: string; owner_id: string }[]) {
    if (idsFilasActuales.has(fila.id)) continue;
    if (fila.owner_id !== uid) continue;
    aEliminar++;
  }

  return aEliminar;
}

async function eliminarFilasPropias(
  cliente: SupabaseClient,
  uid: string,
  deviceId: string,
  filas: FilaPublicable[]
): Promise<void> {
  const idsFilasActuales = new Set(filas.map((f) => f.id));

  const { data, error } = await cliente
    .from(TABLA_SENIALES_PUBLICAS)
    .select("id, device_id, owner_id")
    .eq("owner_id", uid)
    .eq("device_id", deviceId);

  if (error || !data || data.length === 0) return;

  for (const fila of data as { id: string; device_id: string; owner_id: string }[]) {
    if (idsFilasActuales.has(fila.id)) continue;
    if (fila.owner_id !== uid) continue;

    try {
      await cliente.from(TABLA_SENIALES_PUBLICAS).delete().eq("id", fila.id);
    } catch {
      /* noop: error de borrado se ignora */
    }
  }
}