import {
  HABILIDADES_INGENIERIA_A,
  type HabilidadIngenieria,
} from "./habilidades/ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "./habilidades/ingenieria-b";

/**
 * Catálogo de habilidades de ingeniería (Matt Pocock) que el vigía mantiene al día
 * --------------------------------------------------------------------------------
 * Consolidación de las dos manos del contrato architecture/laya-y-habilidades.md §5:
 * junta `HABILIDADES_INGENIERIA_A` (TDD, diagnóstico, diseño, dominio, revisión) y
 * `HABILIDADES_INGENIERIA_B` (especificar y trocear: to-spec, to-tickets, triage,
 * prototipo, investigación, arquitectura e implementación). Config/vigia-areas.json
 * nombra este archivo como `catalogo` del área «habilidades»: es aquí donde el vigía
 * propone las tarjetas nuevas o actualizadas de `mattpocock/skills`.
 *
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
 */

export type { HabilidadIngenieria };

/** Las 12 habilidades de ingeniería, A primero (contrato architecture/laya-y-habilidades.md §5). */
export const HABILIDADES_INGENIERIA: HabilidadIngenieria[] = [
  ...HABILIDADES_INGENIERIA_A,
  ...HABILIDADES_INGENIERIA_B,
];

/** Almacén de los interruptores de Ajustes · Inteligencia (panel «Decisiones de
 *  Laya»): lo escribe el panel al apagar y lo leen el panel mismo y el motor de
 *  habilidades (`skills.ts`), para que una habilidad apagada NO se aplique (§5:
 *  cada persona puede apagarlas en Ajustes). */
export const CLAVE_HABILIDADES = "starseed.laya.habilidades.v1";

/** Interruptores por habilidad: TODAS encendidas por defecto y el guardado solo
 *  las apaga. PURO: el bruto llega ya leído del almacén por quien llama. */
export function leerInterruptores(bruto: string | null): Record<string, boolean> {
  const activos: Record<string, boolean> = {};
  for (const h of HABILIDADES_INGENIERIA) activos[h.id] = true;
  try {
    const v = JSON.parse(bruto ?? "null") as Partial<Record<string, unknown>> | null;
    if (v) for (const h of HABILIDADES_INGENIERIA) if (typeof v[h.id] === "boolean") activos[h.id] = v[h.id] === true;
  } catch { /* guardado a medias: quedan los de fábrica */ }
  return activos;
}
