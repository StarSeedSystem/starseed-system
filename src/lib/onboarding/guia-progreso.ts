/**
 * Guía completa · retomar donde se quedó (Ola 1025U · GUIA1025U).
 * ═══════════════════════════════════════════════════════════════════════════
 * La introducción de la ventana de acceso y el recorrido de Aurora recorren los mismos pasos
 * (`guia-completa.ts`), así que comparten también el punto por el que iban: quien lee la mitad en la
 * ventana de acceso y abre luego la guía desde Ajustes sigue por el mismo paso.
 *
 * Es un dato LOCAL del aparato (no viaja con la cuenta: sin cuenta tampoco hay a dónde enviarlo) y se
 * guarda por el id del paso, no por su posición, para que añadir pasos al catálogo no desplace a nadie.
 * Llegar al último paso (la cuenta) cuenta como haberla terminado: se borra y la próxima vez se empieza
 * desde el principio.
 *
 * Nunca lanza: sin almacenamiento local simplemente no se recuerda nada.
 */

import { safeGet, safeRemove, safeSet } from "@/lib/safe-storage";
import { PASOS_GUIA, ULTIMO_PASO, acotarIndice, indiceDePaso } from "./guia-completa";

export const CLAVE_PROGRESO_GUIA = "starseed.guia.completa.progreso.v1";

/** El paso por el que se quedó (nunca el primero ni el último), o `null` si no hay nada que retomar. */
export function leerProgresoGuia(): number | null {
  try {
    const crudo = safeGet(CLAVE_PROGRESO_GUIA);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as { paso?: unknown };
    if (typeof dato.paso !== "string") return null;
    const i = indiceDePaso(dato.paso);
    return i > 0 && i < ULTIMO_PASO ? i : null;
  } catch {
    return null;
  }
}

/** Olvida dónde se quedó (la próxima vez empieza desde el principio). */
export function borrarProgresoGuia(): void {
  try {
    safeRemove(CLAVE_PROGRESO_GUIA);
  } catch {
    /* sin almacenamiento: nada que olvidar */
  }
}

/** Apunta el paso que se está leyendo. El primero y el último no se guardan: el último lo borra. */
export function guardarProgresoGuia(indice: number): void {
  try {
    const i = acotarIndice(indice);
    if (i >= ULTIMO_PASO) return borrarProgresoGuia();
    if (i <= 0) return borrarProgresoGuia();
    safeSet(CLAVE_PROGRESO_GUIA, JSON.stringify({ paso: PASOS_GUIA[i].id }));
  } catch {
    /* sin almacenamiento: no se recuerda, no se rompe */
  }
}
