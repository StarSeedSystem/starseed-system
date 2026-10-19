/**
 * ProtoGenesis · reparto multiagéntico determinista (PG1013B)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Paso, Plan, LIMITES } from "./encargo";

/** Estado de un paso en el proceso. */
export type EstadoPaso = 
  | 'pendiente'
  | 'en-curso'
  | 'verificando'
  | 'hecho'
  | 'fallido'
  | 'necesita-mano';

/**
 * Calcula los niveles topológicos del plan.
 * Devuelve un array de arrays de ids de pasos, donde cada subarray contiene
 * los pasos que pueden ejecutarse en paralelo (mismo nivel de dependencia).
 * Orden estable por id dentro de cada nivel.
 */
export function nivelesDe(plan: Plan): string[][] {
  // TODO: implementar
  return [];
}

/**
 * Devuelve los pasos que están listos para ejecutarse:
 * - Estado 'pendiente'
 * - Todas sus dependencias están en estado 'hecho'
 */
export function pasosListos(
  plan: Plan,
  estados: Record<string, EstadoPaso>
): Paso[] {
  // TODO: implementar
  return [];
}

/**
 * Reparte los pasos listos entre los agentes libres.
 * - Un agente libre por paso (nunca dos pasos al mismo agente)
 * - Un paso nunca va a dos agentes
 * - Respeta la lista `puede` del agente (lista de átomos que sabe usar; vacía = todos)
 * - Como mucho `tope` agentes a la vez (por defecto LIMITES.agentes)
 * - Determinista: mismo resultado con la misma entrada (orden estable por id de paso y agente)
 */
export function repartirPasos(
  listos: Paso[],
  agentes: Array<{ id: string; ocupado: boolean; puede?: string[] }>,
  tope = LIMITES.agentes
): Array<{ paso: string; agente: string }> {
  // TODO: implementar
  return [];
}

/**
 * Calcula el progreso del plan.
 * @returns Objeto con:
 *   - hechos: número de pasos con estado 'hecho'
 *   - total: número total de pasos
 *   - enCurso: número de pasos con estado 'en-curso' o 'verificando'
 *   - bloqueados: número de pasos pendientes que esperan dependencias no hechas
 */
export function progreso(
  plan: Plan,
  estados: Record<string, EstadoPaso>
): { hechos: number; total: number; enCurso: number; bloqueados: number } {
  // TODO: implementar
  return { hechos: 0, total: 0, enCurso: 0, bloqueados: 0 };
}