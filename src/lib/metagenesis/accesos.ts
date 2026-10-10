"use client";

/*
 * accesos — quién entra en MetaGenesis (2026-10-10).
 * MetaGenesis es el Genesis de los desarrolladores de StarSeed OS (el que edita el código del
 * OS). Solo entran las cuentas de `metagenesis_accesos`; los DUEÑOS dan y quitan acceso desde
 * Ajustes de MetaGenesis. Todo pasa por las RPC de la migración 20261010090000 (RLS: cada cuenta
 * ve su fila; los dueños, todas). Nunca lanza.
 */

import { createClient } from "@/utils/supabase/client";

export type RolMetaGenesis = "dueño" | "desarrollador";

export interface MiembroMetaGenesis {
  account_id: string;
  rol: RolMetaGenesis;
  /** Correo enmascarado («ma…@star.seed»). */
  correo: string;
  handle: string | null;
  nombre: string | null;
  otorgado_por: string | null;
  creado_en: string;
  soy_yo: boolean;
}

export interface Resultado<T = undefined> {
  ok: boolean;
  datos?: T;
  motivo?: string;
}

/** Traduce los errores de las RPC a palabras. */
export function motivoDe(error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "42501") return /dar acceso|quitar acceso/.test(msg) ? "Solo un dueño de MetaGenesis puede dar o quitar acceso." : "Solo para miembros de MetaGenesis.";
  if (code === "P0002") return "No hay ninguna cuenta con ese correo o usuario.";
  if (code === "23514") return "MetaGenesis no puede quedarse sin dueño.";
  if (code === "22023") return "Indica un correo o un @usuario válido.";
  if (code === "PGRST202" || code === "42883") return "La base de datos aún no tiene los accesos de MetaGenesis.";
  return msg || "No se pudo completar.";
}

/** ¿La cuenta con sesión es miembro (y dueño)? `null` si no se puede saber (sin sesión o sin red). */
export async function miAccesoMetaGenesis(): Promise<{ miembro: boolean; dueno: boolean } | null> {
  try {
    const sb = createClient();
    const { data: sesion } = await sb.auth.getSession();
    if (!sesion?.session) return null;
    const [m, d] = await Promise.all([sb.rpc("es_metagenesis"), sb.rpc("es_metagenesis_dueno")]);
    if (m.error || d.error) return null;
    return { miembro: m.data === true, dueno: d.data === true };
  } catch {
    return null;
  }
}

export async function listarMiembros(): Promise<Resultado<MiembroMetaGenesis[]>> {
  try {
    const { data, error } = await createClient().rpc("metagenesis_miembros");
    if (error) return { ok: false, motivo: motivoDe(error) };
    return { ok: true, datos: (data ?? []) as MiembroMetaGenesis[] };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}

export async function darAcceso(identificador: string, rol: RolMetaGenesis = "desarrollador", nota?: string): Promise<Resultado> {
  const ident = identificador.trim();
  if (!ident) return { ok: false, motivo: "Indica un correo o un @usuario." };
  try {
    const { error } = await createClient().rpc("metagenesis_otorgar", { _identificador: ident, _rol: rol, _nota: nota ?? null });
    return error ? { ok: false, motivo: motivoDe(error) } : { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}

export async function quitarAcceso(accountId: string): Promise<Resultado> {
  try {
    const { data, error } = await createClient().rpc("metagenesis_revocar", { _account: accountId });
    if (error) return { ok: false, motivo: motivoDe(error) };
    return data === true ? { ok: true } : { ok: false, motivo: "Esa cuenta ya no tenía acceso." };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}
