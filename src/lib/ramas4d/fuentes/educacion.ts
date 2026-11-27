import type { Observador } from "../alcance";
import type { Nodo, Arista } from "../modelo";
import type { Fuente } from "./tipos";
import {
  loadCurriculum,
  builtinFlat,
  builtinById,
  type EduNode,
  type EduTreeNode,
  colorForRoot,
  subtreeActivity,
} from "@/lib/education/curriculum";
import { loadGroupTopics, type GroupEntityKind } from "@/lib/education/group-education";
import { loadLearningPath, progressPct } from "@/lib/education/progress";

function mapearEduNodeANodo(node: EduNode, depth: number, isCustom: boolean): Nodo {
  const tipoMap: Record<string, Nodo["tipo"]> = {
    category: "categoria",
    topic: "leccion",
    subtopic: "leccion",
  };

  const rootId = node.id.split("-")[1] || "general";

  return {
    id: `edu:${node.id}`,
    tipo: tipoMap[node.kind] || "leccion",
    titulo: node.name,
    formato: node.blurb ? "documento" : "enlace",
    ref: `/educacion/${node.kind}s/${node.id}`,
    alcance: isCustom ? "privado" : "publico",
    dueno: isCustom ? "usuario" : "sistema",
    capas: ["educacion", node.kind, rootId],
    t_creado: Date.now(),
    t_actividad: Date.now(),
    peso: 0.7 + depth * 0.1,
    etiquetas: [node.kind, rootId, isCustom ? "personal" : "builtin"],
  };
}

function construirAristasEducacion(nodes: EduTreeNode[]): Arista[] {
  const aristas: Arista[] = [];
  const ahora = Date.now();

  for (const node of nodes) {
    const nodeId = `edu:${node.id}`;
    for (const child of node.children) {
      const childId = `edu:${child.id}`;
      aristas.push({
        de: nodeId,
        a: childId,
        tipo: "prerrequisito",
        t: ahora,
        intensidad: 0.9,
      });
      aristas.push(...construirAristasEducacion([child]));
    }
  }

  return aristas;
}

async function obtenerTemasGrupos(observador: Observador): Promise<Set<string>> {
  const temasGrupos = new Set<string>();
  try {
    const grupos = observador.grupos || [];
    for (const grupo of Array.from(grupos)) {
      const topicIds = await loadGroupTopics({ kind: "group", id: grupo });
      for (const topicId of topicIds) {
        temasGrupos.add(topicId);
      }
    }
    const paginas = observador.comunidades || [];
    for (const pagina of Array.from(paginas)) {
      const topicIds = await loadGroupTopics({ kind: "page", id: pagina });
      for (const topicId of topicIds) {
        temasGrupos.add(topicId);
      }
    }
  } catch {
    // silencioso
  }
  return temasGrupos;
}

export function crearFuenteEducacion(): Fuente {
  let suscriptores: Set<(evento: { tipo: string; datos: unknown }) => void> = new Set();

  function emitir(evento: { tipo: string; datos: unknown }) {
    for (const cb of suscriptores) {
      try {
        cb(evento);
      } catch {
        // silencioso
      }
    }
  }

  return {
    id: "educacion",
    capa: "educacion",
    leer: async (observador: Observador) => {
      const curriculum = await loadCurriculum();
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];

      const flatBuiltin = builtinFlat();
      const byIdBuiltin = builtinById();
      const temasGrupos = await obtenerTemasGrupos(observador);

      for (const node of curriculum.flat) {
        const isCustom = node.custom === true;
        const builtinNode = byIdBuiltin.get(node.id);
        const depth = builtinNode ? (flatBuiltin.find(n => n.id === node.id)?.depth ?? 0) : 0;
        const nodo = mapearEduNodeANodo(node, depth, isCustom);
        nodos.set(nodo.id, nodo);

        if (temasGrupos.has(node.id)) {
          nodo.etiquetas.push("grupo");
          nodo.peso = Math.min(1.0, nodo.peso + 0.2);
        }
      }

      const aristasEducacion = construirAristasEducacion(curriculum.tree);
      for (const arista of aristasEducacion) {
        if (nodos.has(arista.de) && nodos.has(arista.a)) {
          aristas.push(arista);
        }
      }

      if (observador.id !== "sistema") {
        try {
          for (const node of curriculum.flat) {
            if (node.custom) {
              const pasos = await loadLearningPath(node.id);
              if (pasos.length > 0) {
                const progresoNodeId = `progreso:${node.id}`;
                const progresoNodo: Nodo = {
                  id: progresoNodeId,
                  tipo: "proceso",
                  titulo: `Progreso: ${node.name}`,
                  formato: "tabla",
                  ref: `/educacion/progreso/${node.id}`,
                  alcance: "privado",
                  dueno: observador.id,
                  capas: ["educacion", "progreso"],
                  t_creado: Date.now(),
                  t_actividad: Date.now(),
                  peso: progressPct(pasos) / 100,
                  etiquetas: ["progreso", node.id],
                };
                nodos.set(progresoNodeId, progresoNodo);

                aristas.push({
                  de: `edu:${node.id}`,
                  a: progresoNodeId,
                  tipo: "sincroniza",
                  t: Date.now(),
                  intensidad: 0.6,
                });
              }
            }
          }
        } catch {
          // silencioso
        }
      }

      emitir({ tipo: "fuente_leida", datos: { fuenteId: "educacion", nodos: nodos.size, aristas: aristas.length } });
      return { nodos, aristas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => {
        suscriptores.delete(callback);
      };
    },
  };
}

export const fuenteEducacion = crearFuenteEducacion();