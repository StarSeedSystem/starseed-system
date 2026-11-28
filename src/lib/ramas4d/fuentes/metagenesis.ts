import type { Observador } from "../alcance";
import type { Arista, Nodo } from "../modelo";
import type { Fuente } from "./tipos";

export interface OlaEntrada {
  ola: string;
  estado: string;
  tareasTotal?: number;
  tareasCompletadas?: number;
  t: number;
}

export interface TareaEntrada {
  id: string;
  ola: string;
  titulo: string;
  estado: string;
  t: number;
}

export interface AgenteEntrada {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  t: number;
}

export interface DatosMetagenesis {
  olas?: OlaEntrada[];
  tareas?: TareaEntrada[];
  agentes?: AgenteEntrada[];
}

export function olaANodo(ola: OlaEntrada): Nodo {
  return {
    id: `ola:${ola.ola}`,
    tipo: "ola",
    titulo: ola.ola,
    formato: "flujo",
    ref: `/metagenesis/olas/${encodeURIComponent(ola.ola)}`,
    alcance: "publico",
    dueno: "sistema",
    capas: ["metagenesis", "olas"],
    t_creado: ola.t,
    t_actividad: ola.t,
    peso: ola.estado === "activa" ? 1 : 0.6,
    tema: "metagenesis",
    categoria: "ola",
    etiquetas: ["ola", ola.estado],
  };
}

export function tareaANodo(tarea: TareaEntrada): Nodo {
  return {
    id: `tarea:${tarea.id}`,
    tipo: "tarea",
    titulo: tarea.titulo,
    formato: "documento",
    ref: `/metagenesis/tareas/${encodeURIComponent(tarea.id)}`,
    alcance: "publico",
    dueno: "sistema",
    capas: ["metagenesis", "tareas", tarea.ola],
    t_creado: tarea.t,
    t_actividad: tarea.t,
    peso: tarea.estado === "en-curso" ? 1 : tarea.estado === "completada" ? 0.7 : 0.5,
    tema: "metagenesis",
    categoria: "tarea",
    etiquetas: ["tarea", tarea.estado, tarea.ola],
  };
}

export function aristaTareaOla(tarea: TareaEntrada): Arista | null {
  if (!tarea.ola) return null;
  return { de: `ola:${tarea.ola}`, a: `tarea:${tarea.id}`, tipo: "contiene", t: tarea.t, intensidad: 0.9 };
}

export function agenteANodo(agente: AgenteEntrada): Nodo {
  return {
    id: `agente:${agente.id}`,
    tipo: "agente",
    titulo: agente.nombre,
    formato: "app",
    ref: `/metagenesis/agentes/${encodeURIComponent(agente.id)}`,
    alcance: "publico",
    dueno: "sistema",
    capas: ["metagenesis", "agentes"],
    t_creado: agente.t,
    t_actividad: agente.t,
    peso: agente.activo ? 1 : 0.4,
    tema: "metagenesis",
    categoria: agente.rol,
    etiquetas: ["agente", agente.rol, agente.activo ? "activo" : "inactivo"],
  };
}

function construirDatosSimulados(): DatosMetagenesis {
  const ahora = Date.now();
  return {
    olas: [{ ola: "multiverso-1125", estado: "activa", tareasTotal: 7, tareasCompletadas: 0, t: ahora - 3_600_000 }],
    tareas: [
      { id: "MV1125R3", ola: "multiverso-1125", titulo: "Fuentes vivas de ramas 4D", estado: "en-curso", t: ahora - 60_000 },
      { id: "MV1125R1", ola: "multiverso-1125", titulo: "Modelo base", estado: "completada", t: ahora - 3_000_000 },
    ],
    agentes: [
      { id: "ag-astra", nombre: "Astra", rol: "director", activo: true, t: ahora - 60_000 },
      { id: "ag-jev", nombre: "Jev", rol: "consejero", activo: true, t: ahora - 120_000 },
    ],
  };
}

export function crearFuenteMetagenesis(datos?: DatosMetagenesis): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();
  const emitir = (tipo: string, datos: unknown): void => {
    for (const cb of suscriptores) { try { cb({ tipo, datos }); } catch { /* silencioso */ } }
  };
  return {
    id: "metagenesis",
    capa: "metagenesis",
    leer: async (_observador: Observador) => {
      const fuente = datos ?? construirDatosSimulados();
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];
      for (const ola of fuente.olas ?? []) nodos.set(`ola:${ola.ola}`, olaANodo(ola));
      for (const tarea of fuente.tareas ?? []) {
        nodos.set(`tarea:${tarea.id}`, tareaANodo(tarea));
        const arista = aristaTareaOla(tarea);
        if (arista && nodos.has(arista.de) && nodos.has(arista.a)) aristas.push(arista);
      }
      for (const agente of fuente.agentes ?? []) nodos.set(`agente:${agente.id}`, agenteANodo(agente));
      emitir("fuente_leida", { fuenteId: "metagenesis", nodos: nodos.size, aristas: aristas.length });
      return { nodos, aristas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => { suscriptores.delete(callback); };
    },
  };
}

export const fuenteMetagenesis = crearFuenteMetagenesis();
