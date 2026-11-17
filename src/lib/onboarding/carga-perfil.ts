/**
 * Carga del perfil en la ventana del rito — módulo PURO.
 *
 * El rito cargaba el perfil con un `catch` mudo: si Supabase devolvía un error
 * (o la consulta traía `error` sin lanzar), la ventana se abría en blanco como
 * si la persona no tuviera datos. Nadie sabía por qué. Aquí se decide, sin red
 * ni disco, qué contar al usuario y qué dejar en la consola, distinguiendo
 * fallo de red de servicio indisponible.
 *
 * Regla del rito: nunca dejar al usuario en bucle. Un fallo de carga NUNCA
 * bloquea: el perfil se puede rellenar desde cero y el aviso lo dice.
 */

import { clasificarErrorServicio } from "@/lib/onboarding/onboarding";

export const AVISO_CARGA_PERFIL_RED =
  "No se pudo conectar para cargar tu perfil; puedes rellenarlo desde cero.";
export const AVISO_CARGA_PERFIL_INDISPONIBLE =
  "El perfil no está disponible ahora; puedes rellenarlo desde cero.";

export interface FalloCargaPerfil {
  tipo: "red" | "indisponible";
  /** Texto no bloqueante para la persona. */
  aviso: string;
  /** Línea para la consola del navegador. */
  diagnostico: string;
}

const MAX_MENSAJE = 200;

function mensajeDe(error: unknown): string {
  if (typeof error === "string") return error.trim().slice(0, MAX_MENSAJE);
  if (error && typeof error === "object") {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") return m.trim().slice(0, MAX_MENSAJE);
  }
  return "";
}

/**
 * Un error de PostgREST llega como objeto con `code` (p. ej. PGRST301) y sin
 * `status`; es una respuesta del servicio, no un corte de red.
 */
function clasificarFallo(error: unknown): "red" | "indisponible" {
  if (error && typeof error === "object") {
    const e = error as { status?: unknown; code?: unknown };
    if (typeof e.status === "number" && e.status >= 400) return "indisponible";
    if (typeof e.code === "string" && e.code.trim() !== "") return "indisponible";
  }
  return clasificarErrorServicio(error);
}

/** Describe un fallo de carga del perfil: tipo, aviso para la persona y traza. */
export function describirFalloCargaPerfil(error: unknown): FalloCargaPerfil {
  const tipo = clasificarFallo(error);
  const mensaje = mensajeDe(error);
  return {
    tipo,
    aviso: tipo === "red" ? AVISO_CARGA_PERFIL_RED : AVISO_CARGA_PERFIL_INDISPONIBLE,
    diagnostico: `[perfil] no se pudo cargar el perfil (${tipo})${mensaje ? `: ${mensaje}` : ""}`,
  };
}
