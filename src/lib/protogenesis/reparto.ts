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
  const { pasos } = plan;
  if (pasos.length === 0) return [];

  // Construir mapa de paso por id y calcular grados de entrada
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
      // dep -> paso
      const dependientes = adjList.get(dep) ?? [];
      dependientes.push(paso.id);
      adjList.set(dep, dependientes);
      inDegree.set(paso.id, (inDegree.get(paso.id) ?? 0) + 1);
    }
  }

  // Cola para nodos con grado de entrada 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }
  // Orden estable por id
  queue.sort();

  const niveles: string[][] = [];

  while (queue.length > 0) {
    const nivelActual: string[] = [];
    const nivelSize = queue.length;

    for (let i = 0; i < nivelSize; i++) {
      const id = queue.shift()!;
      nivelActual.push(id);

      const dependientes = adjList.get(id) ?? [];
      for (const depId of dependientes) {
        const newDegree = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    // Orden estable por id dentro del nivel
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
  const listos: Paso[] = [];
  for (const paso of plan.pasos) {
    if (estados[paso.id] !== 'pendiente') {
      continue;
    }
    let dependenciasSatisfechas = true;
    for (const dep of paso.depende) {
      if (estados[dep] !== 'hecho') {
        dependenciasSatisfechas = false;
        break;
      }
    }
    if (dependenciasSatisfechas) {
      listos.push(paso);
    }
  }
  return listos;
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
  // Filtrar agentes libres y ordenarlos por id para determinismo
  const agentesLibres = agentes
    .filter((agente) => !agente.ocupado)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Ordenar pasos listos por id para determinismo
  const listosOrdenados = [...listos].sort((a, b) => a.id.localeCompare(b.id));

  const asignaciones: Array<{ paso: string; agente: string }> = [];
  // Copia de agentes libres que vamos a marcar como ocupados durante la asignación
  const agentesDisponibles = [...agentesLibres];

  for (const paso of listosOrdenados) {
    if (asignaciones.length >= tope) {
      break; // ya alcanzamos el tope
    }

    // Buscar el primer agente disponible que pueda manejar el átomo del paso
    const indiceAgente = agentesDisponibles.findIndex((agente) => {
      // Si puede está definido y no vacío, el átomo debe estar en la lista
      if (agente.puede && agente.puede.length > 0) {
        return agente.puede.includes(paso.atomo);
      }
      // Si puede está vacío o undefined, puede manejar cualquier átomo
      return true;
    });

    if (indiceAgente !== -1) {
      const agenteSeleccionado = agentesDisponibles[indiceAgente];
      asignaciones.push({
        paso: paso.id,
        agente: agenteSeleccionado.id,
      });
      // Eliminar el agente de la lista de disponibles (ya no está libre para otro paso)
      agentesDisponibles.splice(indiceAgente, 1);
    }
    // Si no encontramos un agente, el paso no se asigna (quedará para la siguiente ronda)
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
  let hechos = 0;
  let enCurso = 0;
  let bloqueados = 0;
  const total = plan.pasos.length;

  for (const paso of plan.pasos) {
    const estado = estados[paso.id];
    if (estado === 'hecho') {
      hechos++;
    } else if (estado === 'en-curso' || estado === 'verificando') {
      enCurso++;
    } else if (estado === 'pendiente') {
      // Verificar si está bloqueado: alguna dependencia no es 'hecho'
      let bloqueado = false;
      for (const dep of paso.depende) {
        if (estados[dep] !== 'hecho') {
          bloqueado = true;
          break;
        }
      }
      if (bloqueado) {
        bloqueados++;
      }
    }
    // Otros estados: 'fallido', 'necesita-mano' no cuentan en enCurso ni bloqueados
  }

  return { hechos, total, enCurso, bloqueados };
}