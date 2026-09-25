/**
 * personalidades-todas — lógica PURA del chip «Todas» de la bandeja
 * «Personalidades activas» (`src/components/agent/chat-personality-tray.tsx`).
 *
 * Decide si están todas las personalidades del catálogo 1.58 activas para el
 * chat y cómo alternar ese estado de forma clara y REVERSIBLE:
 *   · si no están todas activas, «Todas» las activa todas — y si el modo
 *     era «Individual» lo sube a «Diálogo grupal» (en modo individual solo
 *     se menciona a la primera activa — `astraura158MentionHint` — así que
 *     quedarse en "single" con 2+ activas sería engañoso: parecería que
 *     todas van a hablar y solo hablaría una).
 *   · si ya están todas activas, «Todas» actúa como «Solo una»: vuelve a la
 *     selección que había justo ANTES de activarlas todas (o, si no hay
 *     nada que recordar, a una personalidad de respaldo en modo Individual).
 *
 * Sin red, sin DOM, sin localStorage: todo puro y testeable (vitest).
 */

import type { Astraura158MultiMode } from "@/ai/providers/astraura-158";

export interface SeleccionPersonalidades {
  personas: string[];
  mode: Astraura158MultiMode;
}

/** ¿Están TODAS las personalidades de `todosIds` en `personas`? */
export function todasPersonalidadesActivas(personas: string[], todosIds: string[]): boolean {
  if (!todosIds.length) return false;
  const activos = new Set(personas);
  return todosIds.every((id) => activos.has(id));
}

export interface ResultadoAlternarTodas {
  /** Selección resultante tras pulsar «Todas». */
  siguiente: SeleccionPersonalidades;
  /**
   * Selección a recordar para la PRÓXIMA vez que se pulse «Todas» y haya que
   * volver a «Solo una» — o `null` si este toggle ya consumió (usó) la
   * recordada anterior. El llamador la guarda en estado de componente (no se
   * persiste: es memoria de sesión de la bandeja, no un ajuste del chat).
   */
  recordar: SeleccionPersonalidades | null;
}

/**
 * Alterna el estado «Todas» de forma reversible.
 *   · `actual`    — selección/modo efectivos ahora mismo.
 *   · `todosIds`  — catálogo completo de ids de personalidad (orden estable).
 *   · `recordada` — lo que se guardó la última vez que se activó «Todas»
 *                   (o `null` si nunca se activó / ya se consumió).
 *   · `idRespaldo`— personalidad a la que caer si no hay nada que recordar.
 */
export function alternarTodasPersonalidades(
  actual: SeleccionPersonalidades,
  todosIds: string[],
  recordada: SeleccionPersonalidades | null,
  idRespaldo: string,
): ResultadoAlternarTodas {
  if (todasPersonalidadesActivas(actual.personas, todosIds)) {
    const previa: SeleccionPersonalidades =
      recordada && recordada.personas.length ? recordada : { personas: [idRespaldo], mode: "single" };
    return { siguiente: previa, recordar: null };
  }
  const mode: Astraura158MultiMode = actual.mode === "single" ? "multi_dialogue" : actual.mode;
  return { siguiente: { personas: [...todosIds], mode }, recordar: actual };
}
