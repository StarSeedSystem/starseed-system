/**
 * Bots/dots de Astraura · TAREAS BOT (BOT1011W).
 * Contrato: architecture/astraura-bots.md §8.
 * Módulo PURO: sin React, sin red, sin `node:*`, sin reloj.
 */
import type { Tarea, EstadoTarea } from "./tipos";
export { Tarea, EstadoTarea };

export function crearTarea(
  args: { titulo: string; criterios: string; director: string; origen: string },
  director: string,
  origen: "genesis" | "poligenesis"
): Tarea | { problemas: string[] } {
  if (!args.titulo.trim()) return { problemas: ["El título no puede estar vacío"] };
  
  let criteriosArray: string[];
  try {
    criteriosArray = JSON.parse(args.criterios);
    if (!Array.isArray(criteriosArray)) return { problemas: ["Los criterios deben ser un array"] };
  } catch {
    return { problemas: ["Los criterios deben ser un JSON válido"] };
  }

  if (criteriosArray.length === 0) return { problemas: ["Sin criterios no hay tarea"] };
  if (criteriosArray.length > 12) return { problemas: ["Máximo 12 criterios permitidos"] };
  
  for (const criterio of criteriosArray) {
    if (typeof criterio !== "string" || !criterio.trim()) 
      return { problemas: ["Cada criterio debe ser un texto no vacío"] };
    if (criterio.trim().length > 200) 
      return { problemas: ["Cada criterio debe tener máximo 200 caracteres"] };
  }

  const criteriosLimpios = criteriosArray.map(c => c.trim());
  const id = Math.random().toString(36).substring(2, 15);
  
  return {
    id,
    titulo: args.titulo.trim(),
    director,
    agentes: [],
    criterios: criteriosLimpios,
    verificador: "persona",
    origen,
    estado: "propuesta" as EstadoTarea
  };
}

export function asignarPasos(
  tarea: Tarea,
  agentes: { id: string; capacidades: string[] }[]
): Tarea {
  if (agentes.length === 0) return tarea;
  
  const agentesDisponibles = agentes.filter(a => a.id !== tarea.director);
  if (agentesDisponibles.length === 0) return { ...tarea, agentes: [] };

  const asignaciones: Record<string, string[]> = {};

  for (const criterio of tarea.criterios) {
    const palabrasCriterio = criterio.toLowerCase().split(/\s+/);
    let mejorAgenteId = agentesDisponibles[0].id;
    let maxCoincidencias = 0;

    for (const agente of agentesDisponibles) {
      let coincidencias = 0;
      for (const capacidad of agente.capacidades) {
        const palabrasCapacidad = capacidad.toLowerCase().split(/\s+/);
        for (const palabraCriterio of palabrasCriterio) {
          if (palabrasCapacidad.includes(palabraCriterio)) coincidencias++;
        }
      }
      if (coincidencias > maxCoincidencias) {
        maxCoincidencias = coincidencias;
        mejorAgenteId = agente.id;
      }
    }

    if (!asignaciones[mejorAgenteId]) asignaciones[mejorAgenteId] = [];
    asignaciones[mejorAgenteId].push(criterio);
  }

  const agentesAsignados: string[] = [];
  for (const agenteId in asignaciones) agentesAsignados.push(agenteId);
  
  return { ...tarea, agentes: agentesAsignados };
}

export function marcarCriterio(
  estadoVerif: Record<string, { ok: boolean; por: { tipo: "persona" | "bot" | "pruebas"; id: string } }>,
  criterio: string,
  por: { tipo: "persona" | "bot" | "pruebas"; id: string },
  ok: boolean,
  _evidencia: unknown
): Record<string, { ok: boolean; por: { tipo: "persona" | "bot" | "pruebas"; id: string } }> {
  return {
    ...estadoVerif,
    [criterio]: { ok, por }
  };
}

export function estadoDe(
  tarea: Tarea,
  verif: Record<string, { ok: boolean; por: { tipo: "persona" | "bot" | "pruebas"; id: string } }>
): EstadoTarea {
  if (tarea.estado === "rechazada") return "rechazada";

  let todosVerificados = true;
  let algunoPendiente = false;
  let algunoFallido = false;

  for (const criterio of tarea.criterios) {
    const verificacion = verif[criterio];
    if (!verificacion) {
      todosVerificados = false;
      algunoPendiente = true;
    } else if (!verificacion.ok) {
      todosVerificados = false;
      algunoFallido = true;
    }
  }

  if (todosVerificados && !algunoPendiente && !algunoFallido) return "hecha";
  
  for (const criterio of tarea.criterios) {
    if (verif[criterio]) return "verificando";
  }
  
  return tarea.agentes.length > 0 ? "en-curso" : "propuesta";
}