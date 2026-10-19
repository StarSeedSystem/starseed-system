/**
 * ProtoGenesis · Director (PG1013F)
 * Convierte un encargo en un plan validado, con un único intento de reintento.
 * Módulo puro: sin node:, sin Supabase, sin window.
 */
import type { Encargo, Plan, Paso } from "./encargo";
import { validarPlan } from "./encargo";

export interface AtomoInfo {
  id: string;
  nombre: string;
  entrada: string[];
  salida: string[];
}

export function promptDirector(
  encargo: Encargo,
  atomos: AtomoInfo[]
): string {
  return "";
}

export async function planificarEncargo(
  encargo: Encargo,
  atomos: AtomoInfo[],
  llamar: (prompt: string) => Promise<string>,
  ctx: {
    existeAtomo: (id: string) => "si" | "solo-enlace" | "no";
    hayConversion: (de: string, a: string) => boolean;
    formatoDe: (entrada: string) => string | null;
  }
): Promise<{ ok: true; plan: Plan; avisos: string[] } | { ok: false; motivo: string }> {
  return { ok: false, motivo: "no implementado" };
}
