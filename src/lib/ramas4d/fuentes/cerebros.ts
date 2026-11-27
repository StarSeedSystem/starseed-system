import type { Observador } from "../alcance";
import type { Nodo, Arista, Grafo4D } from "../modelo";
import type { Fuente } from "./tipos";
import { listBrains, type Brain, type BrainServer } from "@/lib/brains/brains";

function mapearServidorANodo(server: BrainServer, cerebroId: string): Nodo {
  return {
    id: `srv:${server.id}`,
    tipo: "conector",
    titulo: server.name,
    formato: "enlace",
    ref: `/cerebros/${cerebroId}/servers/${server.id}`,
    alcance: "privado",
    dueno: cerebroId,
    capas: ["cerebros", "servidores"],
    t_creado: Date.now(),
    t_actividad: Date.now(),
    peso: 0.8,
    etiquetas: [server.kind, server.status || "pendiente"],
  };
}

function mapearCerebroANodo(brain: Brain): Nodo {
  return {
    id: `brain:${brain.id}`,
    tipo: "cerebro",
    titulo: brain.name,
    formato: "documento",
    ref: `/cerebros/${brain.id}`,
    alcance: brain.scope === "account" ? "privado" : brain.scope === "group" ? "grupo" : "comunidad",
    dueno: brain.owner || "desconocido",
    capas: ["cerebros", brain.scope],
    t_creado: brain.created_at ? new Date(brain.created_at).getTime() : Date.now(),
    t_actividad: brain.updated_at ? new Date(brain.updated_at).getTime() : Date.now(),
    peso: 1.0,
    etiquetas: [brain.scope, ...Object.keys(brain.config)],
  };
}

function construirAristasCerebros(brains: Brain[]): Arista[] {
  const aristas: Arista[] = [];
  const ahora = Date.now();

  for (const brain of brains) {
    const brainNodeId = `brain:${brain.id}`;

    for (const server of brain.servers || []) {
      const serverNodeId = `srv:${server.id}`;
      aristas.push({
        de: brainNodeId,
        a: serverNodeId,
        tipo: "contiene",
        t: ahora,
        intensidad: 1.0,
      });
    }

    for (const vaultId of brain.includes?.vaults || []) {
      const vaultNodeId = `vault:${vaultId}`;
      aristas.push({
        de: brainNodeId,
        a: vaultNodeId,
        tipo: "contiene",
        t: ahora,
        intensidad: 0.8,
      });
    }

    for (const memoryId of brain.includes?.memories || []) {
      const memoryNodeId = `mem:${memoryId}`;
      aristas.push({
        de: brainNodeId,
        a: memoryNodeId,
        tipo: "contiene",
        t: ahora,
        intensidad: 0.9,
      });
    }

    for (const personalityId of brain.includes?.personalities || []) {
      const personaNodeId = `persona:${personalityId}`;
      aristas.push({
        de: brainNodeId,
        a: personaNodeId,
        tipo: "usa",
        t: ahora,
        intensidad: 0.7,
      });
    }

    for (const runtimeId of brain.includes?.runtimes || []) {
      const runtimeNodeId = `runtime:${runtimeId}`;
      aristas.push({
        de: brainNodeId,
        a: runtimeNodeId,
        tipo: "usa",
        t: ahora,
        intensidad: 0.7,
      });
    }

    if (brain.includes?.aiProvider) {
      const providerNodeId = `provider:${brain.includes.aiProvider}`;
      aristas.push({
        de: brainNodeId,
        a: providerNodeId,
        tipo: "usa",
        t: ahora,
        intensidad: 0.9,
      });
    }
  }

  return aristas;
}

export function crearFuenteCerebros(): Fuente {
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
    id: "cerebros",
    capa: "cerebros",
    leer: async (observador: Observador) => {
      const brains = await listBrains();
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];

      for (const brain of brains) {
        if (observador.id !== brain.owner && brain.scope === "account") {
          continue;
        }
        const nodoCerebro = mapearCerebroANodo(brain);
        nodos.set(nodoCerebro.id, nodoCerebro);

        for (const server of brain.servers || []) {
          const nodoServidor = mapearServidorANodo(server, brain.id);
          nodos.set(nodoServidor.id, nodoServidor);
        }
      }

      const aristasCerebros = construirAristasCerebros(brains);
      for (const arista of aristasCerebros) {
        if (nodos.has(arista.de) && nodos.has(arista.a)) {
          aristas.push(arista);
        }
      }

      emitir({ tipo: "fuente_leida", datos: { fuenteId: "cerebros", nodos: nodos.size, aristas: aristas.length } });
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

export const fuenteCerebros = crearFuenteCerebros();