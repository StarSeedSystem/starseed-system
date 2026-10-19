/**
 * ProtoGenesis · reparto multiagéntico determinista (PG1013B)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */
import { Paso, Plan, LIMITES } from "./encargo";

/** Estado de un paso en el proceso. */
export type EstadoPaso = 'pendiente' | 'en-curso' | 'verificando' | 'hecho' | 'fallido' | 'necesita-mano';

/**
 * Calcula los niveles topológicos del plan.
 * Devuelve un array de arrays de ids de pasos, donde cada subarray contiene
 * los pasos que pueden ejecutarse en paralelo (mismo nivel de dependencia).
 * Orden estable por id dentro de cada nivel.
 */
export function nivelesDe(plan: Plan): string[][] {
  const { pasos } = plan;
  if (!pasos.length) return [];
  const pasoMap = new Map<string, Paso>();
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const paso of pasos) {
    pasoMap.set(paso.id, paso);
    inDegree.set(paso.id, 0);
    adjList.set(paso.id, []);
  }
  for (const paso of pasos) {
    for (const dep of paso.depende) {
      const dependientes = adjList.get(dep) ?? [];
      dependientes.push(paso.id);
      adjList.set(dep, dependientes);
      inDegree.set(paso.id, (inDegree.get(paso.id) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  queue.sort();
  const niveles: string[][] = [];
  while (queue.length) {
    const nivelActual: string[] = [];
    const nivelSize = queue.length;
    for (let i = 0; i < nivelSize; i++) {
      const id = queue.shift()!;
      nivelActual.push(id);
      const dependientes = adjList.get(id) ?? [];
      for (const depId of dependientes) {
        const newDegree = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) queue.push(depId);
      }
    }
    nivelActual.sort();
    niveles.push(nivelActual);
  }
  return niveles;
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
  return plan.pasos.filter(paso => {
    if (estados[paso.id] !== 'pendiente') return false;
    return paso.depende.every(dep => estados[dep] === 'hecho');
  });
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
  const agentesLibres = agentes
    .filter(a => !a.ocupado)
    .sort((a, b) => a.id.localeCompare(b.id));
  const listosOrdenados = [...listos].sort((a, b) => a.id.localeCompare(b.id));
  const asignaciones: Array<{ paso: string; agente: string }> = [];
  const agentesDisponibles = [...agentesLibres];
  for (const paso of listosOrdenados) {
    if (asignaciones.length >= tope) break;
    const indiceAgente = agentesDisponibles.findIndex(a => {
      if (a.puede && a.puede.length > 0) return a.puede.includes(paso.atomo);
      return true;
    });
    if (indiceAgente !== -1) {
      const agenteSeleccionado = agentesDisponibles[indiceAgente];
      asignaciones.push({ paso: paso.id, agente: agenteSeleccionado.id });
      agentesDisponibles.splice(indiceAgente, 1);
    }
  }
  return asignaciones;
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
  let hechos = 0, enCurso = 0, bloqueados = 0;
  const total = plan.pasos.length;
  for (const paso of plan.pasos) {
    const estado = estados[paso.id];
    if (estado === 'hecho') hechos++;
    else if (estado === 'en-curso' || estado === 'verificando') enCurso++;
    else if (estado === 'pendiente') {
      let bloqueado = false;
      for (const dep of paso.depende) {
        if (estados[dep] !== 'hecho') {
          bloqueado = true;
          break;
        }
      }
      if (bloqueado) bloqueados++;
    }
  }
  return { hechos, total, enCurso, bloqueados };
}