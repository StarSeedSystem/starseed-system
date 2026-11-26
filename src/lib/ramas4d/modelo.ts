export type Alcance = "privado" | "contactos" | "grupo" | "comunidad" | "publico";

export const Alcance = {
  Privado: "privado" as Alcance,
  Contactos: "contactos" as Alcance,
  Grupo: "grupo" as Alcance,
  Comunidad: "comunidad" as Alcance,
  Publico: "publico" as Alcance,
} as const;

export type Formato = string;

export const FORMATOS_CONOCIDOS = [
  "texto",
  "imagen",
  "video",
  "audio",
  "modelo3d",
  "app",
  "web",
  "documento",
  "tabla",
  "pizarra",
  "presentacion",
  "enlace",
  "flujo",
] as const;

export type TipoNodo =
  | "neurona"
  | "cerebro"
  | "carpeta"
  | "archivo"
  | "memoria"
  | "publicacion"
  | "entidad"
  | "propuesta"
  | "leccion"
  | "obra"
  | "agente"
  | "bot"
  | "habilidad"
  | "conector"
  | "proceso"
  | "proyecto"
  | "capa"
  | "ola"
  | "tarea";

export type TipoArista =
  | "contiene"
  | "deriva"
  | "cita"
  | "prerrequisito"
  | "sincroniza"
  | "senal"
  | "transmuta"
  | "variacion"
  | "vota"
  | "participa"
  | "usa";

export interface Nodo {
  id: string;
  tipo: TipoNodo;
  titulo: string;
  formato: Formato;
  ref: string;
  alcance: Alcance;
  dueno: string;
  capas: string[];
  t_creado: number;
  t_actividad: number;
  peso: number;
  tema?: string;
  categoria?: string;
  etiquetas?: string[];
}

export interface Arista {
  de: string;
  a: string;
  tipo: TipoArista;
  t: number;
  intensidad: number;
}

export interface Evento {
  t: number;
  tipo: string;
  nodo?: string;
  arista?: { de: string; a: string; tipo: TipoArista };
  alcance: Alcance;
}

export interface Rama {
  nodo: Nodo;
  hijos: Rama[];
}

export interface Grafo4D {
  nodos: Nodo[];
  aristas: Arista[];
  eventos: Evento[];
}

export function crearGrafo(): Grafo4D {
  return {
    nodos: [],
    aristas: [],
    eventos: [],
  };
}

function nodoExiste(grafo: Grafo4D, id: string): boolean {
  return grafo.nodos.some((n) => n.id === id);
}

function aristaExiste(grafo: Grafo4D, arista: Arista): boolean {
  return grafo.aristas.some(
    (a) => a.de === arista.de && a.a === arista.a && a.tipo === arista.tipo
  );
}

export function añadirNodo(grafo: Grafo4D, nodo: Nodo): Grafo4D {
  if (!validarNodo(nodo)) {
    return grafo;
  }
  if (nodoExiste(grafo, nodo.id)) {
    return grafo;
  }
  return {
    ...grafo,
    nodos: [...grafo.nodos, nodo],
  };
}

export function añadirArista(grafo: Grafo4D, arista: Arista): Grafo4D {
  if (!nodoExiste(grafo, arista.de) || !nodoExiste(grafo, arista.a)) {
    return grafo;
  }
  if (aristaExiste(grafo, arista)) {
    return grafo;
  }
  return {
    ...grafo,
    aristas: [...grafo.aristas, arista],
  };
}

export function aplicarEvento(grafo: Grafo4D, evento: Evento): Grafo4D {
  const nuevosNodos = grafo.nodos.map((nodo) => {
    if (evento.nodo && nodo.id === evento.nodo) {
      return {
        ...nodo,
        t_actividad: evento.t,
        peso: nodo.peso + 1,
      };
    }
    return nodo;
  });
  return {
    ...grafo,
    nodos: nuevosNodos,
    eventos: [...grafo.eventos, evento],
  };
}

export function hijos(grafo: Grafo4D, nodoId: string): Nodo[] {
  const aristasSalientes = grafo.aristas.filter((a) => a.de === nodoId && a.tipo === "contiene");
  const hijosIds = aristasSalientes.map((a) => a.a);
  return grafo.nodos.filter((n) => hijosIds.includes(n.id));
}

export function ancestros(grafo: Grafo4D, nodoId: string): Nodo[] {
  const aristasEntrantes = grafo.aristas.filter(
    (a) => a.a === nodoId && a.tipo === "contiene"
  );
  const ancestrosIds = aristasEntrantes.map((a) => a.de);
  return grafo.nodos.filter((n) => ancestrosIds.includes(n.id));
}

const CAMPOS_PRIVADOS_PROHIBIDOS = ["contenido", "cuerpo", "texto_privado"] as const;

export function validarNodo(nodo: Nodo): boolean {
  if (!nodo.ref || nodo.ref.trim() === "") {
    return false;
  }
  for (const campo of CAMPOS_PRIVADOS_PROHIBIDOS) {
    if (campo in nodo) {
      return false;
    }
  }
  return true;
}

export interface FacetasNodo {
  tema?: string;
  categoria?: string;
  etiquetas: string[];
  tipo: TipoNodo;
  formato: Formato;
  alcance: Alcance;
  dueno: string;
  sistema?: string;
  capa: string[];
  fecha: number;
  estado: "activo" | "inactivo" | "archivado";
}

export function facetasDe(nodo: Nodo): FacetasNodo {
  return {
    tema: nodo.tema,
    categoria: nodo.categoria,
    etiquetas: nodo.etiquetas ?? [],
    tipo: nodo.tipo,
    formato: nodo.formato,
    alcance: nodo.alcance,
    dueno: nodo.dueno,
    sistema: undefined,
    capa: nodo.capas,
    fecha: nodo.t_creado,
    estado: "activo",
  };
}