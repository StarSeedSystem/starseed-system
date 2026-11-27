import type { Observador } from "../alcance";
import type { Nodo, Arista } from "../modelo";
import type { Fuente } from "./tipos";
import {
  loadKnowledge,
  buildGraph,
  type Category,
  type Topic,
  catNodeId,
  topicNodeId,
} from "@/lib/knowledge/knowledge";

function mapearCategoriaANodo(cat: Category): Nodo {
  return {
    id: catNodeId(cat.id),
    tipo: "carpeta",
    titulo: cat.name,
    formato: "documento",
    ref: `/conocimiento/categorias/${cat.id}`,
    alcance: "publico",
    dueno: cat.owner || "desconocido",
    capas: ["conocimiento", "categorias"],
    t_creado: cat.created_at ? new Date(cat.created_at).getTime() : Date.now(),
    t_actividad: cat.created_at ? new Date(cat.created_at).getTime() : Date.now(),
    peso: 1.0,
    etiquetas: ["categoria"],
  };
}

function mapearTemaANodo(topic: Topic): Nodo {
  return {
    id: topicNodeId(topic.id),
    tipo: "tema",
    titulo: topic.name,
    formato: "texto",
    ref: `/conocimiento/temas/${topic.id}`,
    alcance: "publico",
    dueno: topic.owner || "desconocido",
    capas: ["conocimiento", "temas"],
    t_creado: topic.created_at ? new Date(topic.created_at).getTime() : Date.now(),
    t_actividad: topic.created_at ? new Date(topic.created_at).getTime() : Date.now(),
    peso: 0.9,
    etiquetas: ["tema"],
  };
}

function construirAristasConocimiento(
  categories: Category[],
  topics: Topic[],
  links: Array<{ topic_id: string; category_id: string }>
): Arista[] {
  const aristas: Arista[] = [];
  const ahora = Date.now();
  const catSet = new Set(categories.map((c) => c.id));

  for (const cat of categories) {
    if (cat.parent_id && catSet.has(cat.parent_id)) {
      aristas.push({
        de: catNodeId(cat.parent_id),
        a: catNodeId(cat.id),
        tipo: "contiene",
        t: ahora,
        intensidad: 1.0,
      });
    }
  }

  for (const link of links) {
    if (catSet.has(link.category_id)) {
      aristas.push({
        de: topicNodeId(link.topic_id),
        a: catNodeId(link.category_id),
        tipo: "cita",
        t: ahora,
        intensidad: 0.8,
      });
    }
  }

  return aristas;
}

export function crearFuenteConocimiento(): Fuente {
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
    id: "conocimiento",
    capa: "conocimiento",
    leer: async (observador: Observador) => {
      const { categories, topics, links } = await loadKnowledge();
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];

      for (const cat of categories) {
        const nodo = mapearCategoriaANodo(cat);
        nodos.set(nodo.id, nodo);
      }

      for (const topic of topics) {
        const nodo = mapearTemaANodo(topic);
        nodos.set(nodo.id, nodo);
      }

      const aristasConocimiento = construirAristasConocimiento(categories, topics, links);
      for (const arista of aristasConocimiento) {
        if (nodos.has(arista.de) && nodos.has(arista.a)) {
          aristas.push(arista);
        }
      }

      emitir({ tipo: "fuente_leida", datos: { fuenteId: "conocimiento", nodos: nodos.size, aristas: aristas.length } });
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

export const fuenteConocimiento = crearFuenteConocimiento();