/**
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): cursor-agent (concepto).
 * Mausbot · cursor del agente. Módulo puro, sin node:*.
 */
import { permissionsFor, settingsFor } from "@/lib/neurons/neurons";
import type { NivelBot } from "@/lib/astraura-bots/permisos";

export type TipoAccionAgente = "click" | "type" | "scroll" | "otro";

export interface RectanguloAccion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AccionAgente {
  tipo: TipoAccionAgente;
  rect?: RectanguloAccion;
  etiqueta?: string;
}

export const EVENTO_MAUSBOT_AGENTE = "starseed:mausbot-agente";

export function anunciarAccion(accion: AccionAgente): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_MAUSBOT_AGENTE, { detail: accion }));
  } catch {
    /* noop */
  }
}

type OyenteAccionAgente = (accion: AccionAgente) => void;

export function onAccionAgente(cb: OyenteAccionAgente): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent;
    if (ce.detail && typeof ce.detail === "object") {
      cb(ce.detail as AccionAgente);
    }
  };
  try {
    window.addEventListener(EVENTO_MAUSBOT_AGENTE, handler);
  } catch {
    /* noop */
  }
  return () => {
    try {
      window.removeEventListener(EVENTO_MAUSBOT_AGENTE, handler);
    } catch {
      /* noop */
    }
  };
}

export interface PuedeActuarParams {
  deviceId: string;
  nivel: NivelBot;
  reversible?: boolean;
}

export function puedeActuar({ deviceId, nivel, reversible = false }: PuedeActuarParams): boolean {
  try {
    const perms = permissionsFor(deviceId);
    if (perms?.agent === false) return false;
    const sets = settingsFor(deviceId);
    if (sets?.screenVoice === false) return false;
  } catch {
    /* si falla la lectura, por seguridad no bloqueamos por eso */
  }
  if (nivel === "proponer") return false;
  if (nivel === "aplicar-bajo") {
    if (reversible) return true;
    return false;
  }
  if (nivel === "aplicar") return true;
  if (nivel === "nada") return false;
  return false;
}
