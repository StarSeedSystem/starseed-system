export type AlcanceNodo = 'privado' | 'contactos' | 'grupo' | 'comunidad' | 'publico';

export type TipoNodo =
  | 'neurona'
  | 'cerebro'
  | 'carpeta'
  | 'archivo'
  | 'memoria'
  | 'publicacion'
  | 'entidad'
  | 'propuesta'
  | 'leccion'
  | 'obra'
  | 'agente'
  | 'bot'
  | 'habilidad'
  | 'conector'
  | 'proceso'
  | 'proyecto'
  | 'capa'
  | 'ola'
  | 'tarea'
  | string;

export type FormatoNodo =
  | 'texto'
  | 'imagen'
  | 'video'
  | 'audio'
  | 'modelo3d'
  | 'app'
  | 'web'
  | 'documento'
  | 'tabla'
  | 'pizarra'
  | 'presentacion'
  | 'enlace'
  | 'flujo'
  | string;

export interface Nodo {
  id: string;
  tipo: TipoNodo;
  titulo: string;
  formato: FormatoNodo;
  ref: string;
  alcance: AlcanceNodo;
  dueno: string;
  capas: string[];
  t_creado: number;
  t_actividad: number;
  peso: number;
  tema?: string;
  categoria?: string;
  etiquetas: string[];
}

export type TipoArista =
  | 'contiene'
  | 'deriva'
  | 'cita'
  | 'prerrequisito'
  | 'sincroniza'
  | 'senal'
  | 'transmuta'
  | 'variacion'
  | 'vota'
  | 'participa'
  | 'usa'
  | string;

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
  objetivo_id: string;
  es_arista: boolean;
  alcance: AlcanceNodo;
}

export interface Rama {
  nodoId: string;
  hijosIds: string[];
}

export interface Grafo4D {
  nodos: Map<string, Nodo>;
  aristas: Arista[];
  ramas: Map<string, string[]>;
}

export const CLAVES_PRIVADAS_PROHIBIDAS = [
  'contenido',
  'cuerpo',
  'texto_privado',
  'secret',
  'password',
  'token',
];

export function validarNodo(nodo: Partial<Nodo>): { valido: boolean; error?: string } {
  if (!nodo.id || typeof nodo.id !== 'string') {
    return { valido: false, error: 'El nodo requiere un id válido' };
  }
  if (!nodo.titulo || typeof nodo.titulo !== 'string') {
    return { valido: false, error: 'El nodo requiere un título válido' };
  }
  if (!nodo.ref || typeof nodo.ref !== 'string') {
    return { valido: false, error: 'El nodo requiere una referencia (ref) obligatoria' };
  }
  
  const clavesNodo = Object.keys(nodo);
  for (const clave of CLAVES_PRIVADAS_PROHIBIDAS) {
    if (clavesNodo.includes(clave)) {
      return { valido: false, error: `Se prohiben campos de contenido privado: ${clave}` };
    }
  }

  return { valido: true };
}

export function facetasDe(nodo: Nodo): Record<string, unknown> {
  return {
    tema: nodo.tema ?? '',
    categoria: nodo.categoria ?? '',
    etiquetas: nodo.etiquetas ?? [],
    tipo: nodo.tipo,
    formato: nodo.formato,
    alcance: nodo.alcance,
    dueno: nodo.dueno,
    sistema: nodo.capas[0] ?? 'general',
    capa: nodo.capas,
    fecha: nodo.t_creado,
    estado: nodo.peso > 0.5 ? 'activo' : 'inactivo',
  };
}

export function crearGrafo(): Grafo4D {
  return {
    nodos: new Map<string, Nodo>(),
    aristas: [],
    ramas: new Map<string, string[]>(),
  };
}

export function anadirNodo(grafo: Grafo4D, nodo: Nodo): boolean {
  const validacion = validarNodo(nodo);
  if (!validacion.valido) {
    return false;
  }
  if (grafo.nodos.has(nodo.id)) {
    return false;
  }
  grafo.nodos.set(nodo.id, {
    ...nodo,
    etiquetas: nodo.etiquetas ?? [],
    capas: nodo.capas ?? [],
    peso: nodo.peso ?? 1.0,
    t_actividad: nodo.t_actividad ?? Date.now(),
    t_creado: nodo.t_creado ?? Date.now(),
  });
  return true;
}

export function anadirArista(grafo: Grafo4D, arista: Arista): boolean {
  if (!grafo.nodos.has(arista.de) || !grafo.nodos.has(arista.a)) {
    return false;
  }
  const existe = grafo.aristas.some(
    (a) => a.de === arista.de && a.a === arista.a && a.tipo === arista.tipo
  );
  if (existe) {
    return false;
  }
  grafo.aristas.push({
    ...arista,
    intensidad: arista.intensidad ?? 1.0,
    t: arista.t ?? Date.now(),
  });
  return true;
}

export function aplicarEvento(grafo: Grafo4D, evento: Evento): boolean {
  if (evento.es_arista) {
    return false;
  }
  const nodo = grafo.nodos.get(evento.objetivo_id);
  if (!nodo) {
    return false;
  }
  nodo.t_actividad = evento.t;
  nodo.peso = Math.min(2.0, nodo.peso + 0.1);
  return true;
}

export function hijosDeRama(grafo: Grafo4D, nodoId: string): string[] {
  return grafo.ramas.get(nodoId) ?? [];
}

export function ancestrosDeRama(grafo: Grafo4D, nodoId: string): string[] {
  const ancestros: string[] = [];
  for (const [padreId, hijos] of grafo.ramas.entries()) {
    if (hijos.includes(nodoId)) {
      ancestros.push(padreId);
      ancestros.push(...ancestrosDeRama(grafo, padreId));
    }
  }
  return Array.from(new Set(ancestros));
}
