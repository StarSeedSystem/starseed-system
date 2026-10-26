"use client";
/**
 * Almacén de los sueños del mundo (Ola 1025U · U4). Solo en este aparato (no viaja con la cuenta: lo soñado puede
 * llevar el tema que escribió la persona), acotado y saneado:
 *   · `starseed.mundo.suenos.<escenario>.v1` → los últimos `TOPES_SUENO.guardadosPorEscenario` sueños y el ajuste de
 *     sueños automáticos de ese escenario (apagado por defecto);
 *   · `starseed.mundo.suenos.uso.v1`        → las marcas de la última hora para los topes (ver `sueno.ts`).
 * Toda lectura sanea y nunca lanza; toda escritura pasa por `safeSet`, que degrada a memoria si el disco está lleno.
 */
import { safeGet, safeRemove, safeSet } from "@/lib/safe-storage";
import {
  AJUSTES_SUENOS_DEFECTO, TOPES_SUENO, sanearSuenos, sanearUso, usoVacio,
  type AjustesSuenos, type Sueno, type UsoSuenos,
} from "./sueno";

export const PREFIJO_SUENOS = "starseed.mundo.suenos.";
export const CLAVE_USO_SUENOS = `${PREFIJO_SUENOS}uso.v1`;
export const claveSuenos = (escenarioId: string) => `${PREFIJO_SUENOS}${escenarioId}.v1`;

export interface DatosSuenos extends AjustesSuenos {
  /** Del más antiguo al más reciente. */
  suenos: Sueno[];
}

function leerJSON(clave: string): unknown {
  try {
    const crudo = safeGet(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

export function leerSuenos(escenarioId: string): DatosSuenos {
  const o = leerJSON(claveSuenos(escenarioId));
  const dato = typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  return {
    automaticos: dato.automaticos === true ? true : AJUSTES_SUENOS_DEFECTO.automaticos,
    suenos: sanearSuenos(dato.suenos),
  };
}

/** Guarda los últimos sueños. Devuelve `false` si no cupo en el disco (quedó en memoria) para que la interfaz lo diga. */
export function guardarSuenos(escenarioId: string, datos: DatosSuenos): boolean {
  // El sueño que corre ahora se guarda «en curso»: si la pestaña se cierra, al leerlo pasa a «interrumpido».
  const recientes = sanearSuenos(datos.suenos, TOPES_SUENO.guardadosPorEscenario, true);
  return safeSet(claveSuenos(escenarioId), JSON.stringify({ v: 1, automaticos: datos.automaticos === true, suenos: recientes }));
}

/** Borra los sueños de un escenario (al borrar el escenario). */
export function olvidarSuenos(escenarioId: string): void {
  safeRemove(claveSuenos(escenarioId));
}

export function leerUso(ahora: number = Date.now()): UsoSuenos {
  const o = leerJSON(CLAVE_USO_SUENOS);
  return o ? sanearUso(o, ahora) : usoVacio();
}

export function guardarUso(uso: UsoSuenos, ahora: number = Date.now()): void {
  safeSet(CLAVE_USO_SUENOS, JSON.stringify(sanearUso(uso, ahora)));
}
