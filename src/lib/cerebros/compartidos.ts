"use client";

import { createClient } from "@/utils/supabase/client";
import { senalEsencial } from "@/lib/consumo/guardian";
import { normalizeBrain, Brain } from "@/lib/brains/brains";

/**
 * Lista los cerebros compartidos contigo (excluyendo los tuyos).
 * Devuelve un objeto con ok y un array de cerebros, cada uno marcado con { compartido: true }.
 * En caso de error, devuelve { ok: false, brains: [] }.
 */
export async function listarCerebrosCompartidos(): Promise<{ ok: boolean; brains: Array<Brain & { compartido: true }> }> {
  try {
    const yo = await getCurrentUserId();
    if (!yo) return { ok: false, brains: [] };

    const sb = createClient();
    const { data, error } = await sb
      .from("brains")
      .select("*")
      .neq("owner", yo)
      .order("created_at", { ascending: true })
      .abortSignal(senalEsencial());

    if (error || !Array.isArray(data)) return { ok: false, brains: [] };

    const brains: Array<Brain & { compartido: true }> = (data as unknown as Brain[])
      .map(normalizeBrain)
      .map(brain => ({ ...brain, compartido: true }));

    return { ok: true, brains };
  } catch {
    return { ok: false, brains: [] };
  }
}

/**
 * Función pura que determina si un cerebro está compartido con el usuario dado.
 * @param b El cerebro a verificar.
 * @param yo El ID del usuario actual.
 * @returns true si el cerebro está compartido (es decir, no pertenece al usuario), false en caso contrario.
 */
export function esCompartido(b: Brain, yo: string | null): boolean {
  if (!yo) return false;
  return !!b.owner && b.owner !== yo;
}

/**
 * Obtiene el ID del usuario actual.
 * Copiado de src/lib/brains/brains.ts para evitar dependencias circulares.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}