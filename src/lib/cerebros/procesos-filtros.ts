// Filtros y acciones del panel de procesos activos. Módulo puro, sin disco ni red.
// Contrato: architecture/cerebros-fusion-telepatia.md §7.

import type { ProcesoActivo, TipoProceso } from "./procesos";

/** Los tipos que se enseñan: los activados en preferencias o, si no hay ninguno, todos. */
export function tiposVisibles(
  preferidos: TipoProceso[],
  todos: TipoProceso[],
): TipoProceso[] {
  const validos = new Set(todos);
  const amigos: TipoProceso[] = [];
  for (const t of preferidos) if (validos.has(t) && !amigos.includes(t)) amigos.push(t);
  return amigos;
}

/** Deja solo los procesos de los tipos seleccionados; sin selección, los enseña todos. */
export function filtrarProcesos(
  procesos: ProcesoActivo[],
  activos: TipoProceso[],
): ProcesoActivo[] {
  if (activos.length === 0) return procesos;
  const set = new Set(activos);
  return procesos.filter((p) => set.has(p.tipo));
}

/** Extrae el id de una ventana minimizada desde el id de proceso `ventana:<escritorio>:<ventana>`. */
export function ventanaDeProceso(
  id: string,
): { escritorio: string; ventana: string } | null {
  const m = /^ventana:([^:]+):(.+)$/.exec(id);
  return m ? { escritorio: m[1], ventana: m[2] } : null;
}
