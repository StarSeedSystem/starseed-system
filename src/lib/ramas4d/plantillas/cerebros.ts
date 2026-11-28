import type { AlcanceNodo, FormatoNodo, Grafo4D, Nodo } from "../modelo";
import { anadirArista, anadirNodo, crearGrafo } from "../modelo";
import { podarGrafo, type Observador } from "../alcance";
import { enfriarNodos } from "../tiempo";

export type TipoRecuerdo = "cerebro" | "carpeta" | "archivo" | "memoria";

export interface EntradaRecuerdo {
  id: string;
  titulo: string;
  tipo: TipoRecuerdo;
  ref: string;
  alcance: AlcanceNodo;
  dueno: string;
  formato?: FormatoNodo;
  t_actividad?: number;
  peso?: number;
  carpetaPadre?: string;
  etiquetas?: string[];
}

export interface VinculoRecuerdo {
  de: string;
  a: string;
  tipo: "fusiona" | "telepatia";
  t?: number;
  intensidad?: number;
}

export function nodoDeRecuerdo(entrada: EntradaRecuerdo, ahora: number): Nodo {
  const actividad = entrada.t_actividad ?? ahora;
  return {
    id: entrada.id,
    tipo: entrada.tipo,
    titulo: entrada.titulo,
    formato: entrada.formato ?? (entrada.tipo === "archivo" ? "documento" : "texto"),
    ref: entrada.ref,
    alcance: entrada.alcance,
    dueno: entrada.dueno,
    capas: ["cerebros", entrada.tipo],
    t_creado: actividad,
    t_actividad: actividad,
    peso: Math.max(0.05, Math.min(1, entrada.peso ?? 1)),
    etiquetas: entrada.etiquetas ?? [],
  };
}

export function construirGrafoCerebros(
  entradas: readonly EntradaRecuerdo[],
  vinculos: readonly VinculoRecuerdo[],
  ahora: number,
): Grafo4D {
  const grafo = crearGrafo();
  for (const entrada of entradas) {
    anadirNodo(grafo, nodoDeRecuerdo(entrada, ahora));
  }
  for (const entrada of entradas) {
    const cerebro = entradas.find((e) => e.tipo === "cerebro" && e.dueno === entrada.dueno);
    const padre = entrada.carpetaPadre ?? (entrada.tipo === "cerebro" ? null : cerebro?.id);
    if (!padre || padre === entrada.id || !grafo.nodos.has(padre)) continue;
    anadirArista(grafo, { de: padre, a: entrada.id, tipo: "contiene", t: ahora, intensidad: 1 });
    const hijos = grafo.ramas.get(padre) ?? [];
    hijos.push(entrada.id);
    grafo.ramas.set(padre, hijos);
  }
  for (const vinculo of vinculos) {
    if (!grafo.nodos.has(vinculo.de) || !grafo.nodos.has(vinculo.a)) continue;
    anadirArista(grafo, {
      de: vinculo.de,
      a: vinculo.a,
      tipo: vinculo.tipo,
      t: vinculo.t ?? ahora,
      intensidad: vinculo.intensidad ?? 0.8,
    });
  }
  return grafo;
}

const ENFRIAMIENTO = {
  umbralInactividadMs: 24 * 60 * 60 * 1000,
  factorEnfriamiento: 0.95,
  brilloMinimo: 0.05,
};

export function enfriarRecuerdos(grafo: Grafo4D, ahora: number): Grafo4D {
  return { ...grafo, nodos: enfriarNodos(grafo.nodos, ahora, ENFRIAMIENTO) };
}

export function grafoVisibleCerebros(grafo: Grafo4D, observador: Observador): Grafo4D {
  return podarGrafo(grafo, observador);
}

export function destinoApertura(nodo: Nodo): string {
  if (nodo.ref.startsWith("/") && !nodo.ref.startsWith("//")) return nodo.ref;
  const id = encodeURIComponent(nodo.id);
  const rutas: Record<TipoRecuerdo, string> = {
    cerebro: `/cerebro?cerebro=${id}`,
    carpeta: `/cerebro/mapa?carpeta=${id}`,
    archivo: `/documentos?archivo=${id}`,
    memoria: `/memorias?recuerdo=${id}`,
  };
  return rutas[nodo.tipo as TipoRecuerdo] ?? `/memorias?recuerdo=${id}`;
}

export function padresCerebros(grafo: Grafo4D, ids: readonly string[]): number[] {
  const indices = new Map(ids.map((id, i) => [id, i]));
  const padres = new Map<string, string>();
  for (const [padre, hijos] of grafo.ramas) {
    for (const hijo of hijos) padres.set(hijo, padre);
  }
  return ids.map((id) => {
    const padre = padres.get(id);
    return padre && indices.has(padre) ? indices.get(padre)! : -1;
  });
}
