"use client";
/**
 * Almacén de bots personales (BOT1011A): localStorage + espejo best-effort a
 * la cuenta con `mergeUserPrefs`. Solo bots de PERFIL; los de entidad tienen
 * su tabla. SSR-safe, try/catch en todos lados: el espejo nunca lanza ni bloquea.
 */
import type { Bot } from "../tipos";
import { VERSION_BOTS, migrarBots } from "../predeterminado";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

const CLAVE = "starseed.astraura.bots.v1";
export const EVENTO_BOTS = "starseed:astraura-bots";

interface Envoltorio {
  version: number;
  bots: Bot[];
  actualizado: Record<string, number>;
}

function leerEnvoltorio(perfilId: string, cuentaId: string): Envoltorio {
  if (typeof window === "undefined") {
    return { version: VERSION_BOTS, bots: migrarBots([], perfilId, cuentaId), actualizado: {} };
  }
  try {
    const bruto = window.localStorage.getItem(CLAVE);
    const crudo: unknown = bruto === null ? null : JSON.parse(bruto);
    const bots = migrarBots(crudo, perfilId, cuentaId);
    const actualizado =
      crudo && typeof crudo === "object" && !Array.isArray(crudo)
        ? ((crudo as { actualizado?: Record<string, number> }).actualizado ?? {})
        : {};
    return { version: VERSION_BOTS, bots, actualizado };
  } catch {
    return { version: VERSION_BOTS, bots: migrarBots([], perfilId, cuentaId), actualizado: {} };
  }
}

/** Bots del perfil, con el predeterminado garantizado el primero. */
export function leerBots(perfilId: string, cuentaId: string): Bot[] {
  return leerEnvoltorio(perfilId, cuentaId).bots;
}

/** Guarda marcando con `ahora` los bots que cambian, emite el evento y espeja. */
export function guardarBots(bots: readonly Bot[], ahora: number): void {
  if (typeof window === "undefined") return;
  const envoltorio: Envoltorio = { version: VERSION_BOTS, bots: [...bots], actualizado: {} };
  let anterior: Record<string, { json: string; actualizado: number }> = {};
  try {
    const bruto = window.localStorage.getItem(CLAVE);
    const crudo: unknown = bruto === null ? null : JSON.parse(bruto);
    const lista = Array.isArray(crudo)
      ? crudo
      : crudo && typeof crudo === "object"
        ? ((crudo as { bots?: unknown[] }).bots ?? [])
        : [];
    const marcas =
      crudo && typeof crudo === "object" && !Array.isArray(crudo)
        ? ((crudo as { actualizado?: Record<string, number> }).actualizado ?? {})
        : {};
    for (const b of lista as Bot[]) {
      if (b && typeof b.id === "string") {
        anterior[b.id] = { json: JSON.stringify(b), actualizado: marcas[b.id] ?? 0 };
      }
    }
  } catch {
    anterior = {};
  }
  for (const b of envoltorio.bots) {
    const previo = anterior[b.id];
    envoltorio.actualizado[b.id] =
      previo && previo.json === JSON.stringify(b) ? previo.actualizado : ahora;
  }
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(envoltorio));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_BOTS));
  } catch {
    /* sin observadores no pasa nada */
  }
  void mergeUserPrefs({ [CLAVE]: envoltorio }).catch(() => undefined);
}

/** Suscripción a cambios del almacén (mismo documento). Devuelve desuscripción. */
export function suscribirBots(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_BOTS, cb);
  return () => window.removeEventListener(EVENTO_BOTS, cb);
}
