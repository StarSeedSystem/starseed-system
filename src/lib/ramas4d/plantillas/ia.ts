/**
 * plantilla-ia — Plantilla IA del motor Ramas 4D (MV1125O).
 * Astraura en el centro, agentes y bots como cometas que viajan mientras trabajan,
 * habilidades y conectores como lunas, llamadas entre ellos como partículas en vivo,
 * filtros por cerebro, grupo y estado.
 *
 * Módulo PURO: no lee disco, red ni procesos. El grafo lleva REFERENCIAS
 * (`ref`), nunca contenido privado. La disposición la calcula el visor.
 */

import type { AlcanceNodo, Grafo4D, Nodo } from '../modelo';
import { anadirArista, anadirNodo, crearGrafo } from '../modelo';

export type TipoEntidadIA =
  | 'astraura'
  | 'agente'
  | 'bot'
  | 'habilidad'
  | 'conector'
  | 'cerebro'
  | 'personalidad';

export type EstadoEntidad = 'activo' | 'en-espera' | 'trabajando' | 'detenido' | 'error';

export interface EntidadIA {
  id: string;
  tipo: TipoEntidadIA;
  titulo: string;
  /** Cómo abrirla (ruta del OS, id de agente, endpoint); nunca el contenido. */
  ref: string;
  estado?: EstadoEntidad;
  cerebroId?: string;
  grupoId?: string;
  duenio?: string;
  alcance?: AlcanceNodo;
  capas?: string[];
  /** 0..1 intensidad de actividad reciente. */
  actividad?: number;
  /** Personalidad activa (para Astraura/agentes). */
  personalidadId?: string;
  /** Habilidades/conectores asociados (ids). */
  habilidadesIds?: string[];
  /** Conectores asociados (ids). */
  conectoresIds?: string[];
}

export interface LlamadaIA {
  de: string;
  a: string;
  /** Tipo de interacción. */
  tipo: 'invoca' | 'consulta' | 'delega' | 'sincroniza' | 'notifica';
  /** Timestamp de la llamada. */
  t: number;
  /** 0..1 intensidad. */
  intensidad: number;
  /** Si hay payload de referencia (ruta, id), no contenido. */
  ref?: string;
}

export interface FiltroIA {
  /** Filtrar por cerebro (id o 'todos'). */
  cerebro?: string;
  /** Filtrar por grupo (id o 'todos'). */
  grupo?: string;
  /** Filtrar por estado. */
  estado?: EstadoEntidad | 'todos';
  /** Filtrar por tipo de entidad. */
  tipo?: TipoEntidadIA | 'todos';
  /** Filtrar por dueño. */
  duenio?: string;
  /** Filtrar por alcance mínimo. */
  alcanceMinimo?: AlcanceNodo;
}

export interface EntradaPlantillaIA {
  entidades: EntidadIA[];
  llamadas: LlamadaIA[];
  ahora?: number;
  filtro?: FiltroIA;
  perspectiva?: 'global' | 'cerebro' | 'grupo' | 'personal';
  dueno?: string;
  alcance?: AlcanceNodo;
}

export interface PlantillaIA {
  grafo: Grafo4D;
  /** Entidad central (Astraura) si existe. */
  centro: string | null;
  /** Cometas activos (agentes/bots trabajando). */
  cometas: string[];
  /** Lunas orbitando (habilidades/conectores). */
  lunas: string[];
  /** Partículas vivas (llamadas recientes). */
  particulas: LlamadaIA[];
  /** Filtro aplicado. */
  filtro: FiltroIA;
  /** Pesos de brillo 0..1 por id de nodo. */
  brillo: Map<string, number>;
  /** Padres para disposición radial (centro → órbitas). */
  padres: Map<string, string | null>;
}

const PREFIJO = 'ia:';

function idEntidad(id: string): string {
  return `${PREFIJO}${id}`;
}

function limitar01(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}

function pasaFiltro(entidad: EntidadIA, filtro: FiltroIA): boolean {
  if (filtro.cerebro && filtro.cerebro !== 'todos' && entidad.cerebroId !== filtro.cerebro) return false;
  if (filtro.grupo && filtro.grupo !== 'todos' && entidad.grupoId !== filtro.grupo) return false;
  if (filtro.estado && filtro.estado !== 'todos' && entidad.estado !== filtro.estado) return false;
  if (filtro.tipo && filtro.tipo !== 'todos' && entidad.tipo !== filtro.tipo) return false;
  if (filtro.duenio && entidad.duenio !== filtro.duenio) return false;
  if (filtro.alcanceMinimo) {
    const orden: AlcanceNodo[] = ['privado', 'contactos', 'grupo', 'comunidad', 'publico'];
    const idxEntidad = orden.indexOf(entidad.alcance ?? 'privado');
    const idxMinimo = orden.indexOf(filtro.alcanceMinimo);
    if (idxEntidad < idxMinimo) return false;
  }
  return true;
}

function brilloEntidad(entidad: EntidadIA, esCentro: boolean): number {
  const base = esCentro ? 1 : 0.6;
  const actividad = limitar01(entidad.actividad ?? 0);
  const estadoBonus = entidad.estado === 'trabajando' ? 0.2 : entidad.estado === 'activo' ? 0.1 : 0;
  return Math.min(1, base + 0.3 * actividad + estadoBonus);
}

function tipoDeEntidad(tipo: TipoEntidadIA): string {
  switch (tipo) {
    case 'astraura':
      return 'proceso';
    case 'agente':
    case 'bot':
      return 'agente';
    case 'habilidad':
      return 'habilidad';
    case 'conector':
      return 'conector';
    case 'cerebro':
      return 'cerebro';
    case 'personalidad':
      return 'entidad';
    default:
      return 'entidad';
  }
}

function formatoDeEntidad(tipo: TipoEntidadIA): string {
  switch (tipo) {
    case 'astraura':
      return 'flujo';
    case 'agente':
    case 'bot':
      return 'app';
    case 'habilidad':
      return 'flujo';
    case 'conector':
      return 'enlace';
    case 'cerebro':
      return 'documento';
    case 'personalidad':
      return 'enlace';
    default:
      return 'enlace';
  }
}

function nodoEntidad(entidad: EntidadIA, opciones: { ahora: number; dueno: string; alcance: AlcanceNodo; esCentro: boolean }): Nodo {
  const brillo = brilloEntidad(entidad, opciones.esCentro);
  const capas = ['ia', entidad.tipo, ...(entidad.capas ?? [])];
  if (entidad.cerebroId) capas.push(`cerebro:${entidad.cerebroId}`);
  if (entidad.grupoId) capas.push(`grupo:${entidad.grupoId}`);

  return {
    id: idEntidad(entidad.id),
    tipo: tipoDeEntidad(entidad.tipo),
    titulo: entidad.titulo,
    formato: formatoDeEntidad(entidad.tipo),
    ref: entidad.ref,
    alcance: entidad.alcance ?? opciones.alcance,
    dueno: entidad.duenio ?? opciones.dueno,
    capas,
    t_creado: opciones.ahora,
    t_actividad: opciones.ahora,
    peso: brillo,
    tema: 'ia',
    categoria: entidad.tipo,
    etiquetas: [
      'ia',
      entidad.tipo,
      entidad.estado ?? 'desconocido',
      `actividad:${(entidad.actividad ?? 0).toFixed(2)}`,
      `brillo:${brillo.toFixed(2)}`,
      ...(entidad.personalidadId ? [`personalidad:${entidad.personalidadId}`] : []),
      ...(entidad.cerebroId ? [`cerebro:${entidad.cerebroId}`] : []),
      ...(entidad.grupoId ? [`grupo:${entidad.grupoId}`] : []),
    ],
  };
}

export const TIPOS_ENTIDAD_IA: readonly TipoEntidadIA[] = [
  'astraura',
  'agente',
  'bot',
  'habilidad',
  'conector',
  'cerebro',
  'personalidad',
];

export const ESTADOS_ENTIDAD: readonly EstadoEntidad[] = [
  'activo',
  'en-espera',
  'trabajando',
  'detenido',
  'error',
];

export const ETIQUETA_TIPO: Record<TipoEntidadIA, string> = {
  astraura: 'Astraura',
  agente: 'agente',
  bot: 'bot',
  habilidad: 'habilidad',
  conector: 'conector',
  cerebro: 'cerebro',
  personalidad: 'personalidad',
};

export const ETIQUETA_ESTADO: Record<EstadoEntidad, string> = {
  activo: 'activo',
  'en-espera': 'en espera',
  trabajando: 'trabajando',
  detenido: 'detenido',
  error: 'error',
};

export function construirGrafoIA(entrada: EntradaPlantillaIA): PlantillaIA {
  const ahora = entrada.ahora ?? Date.now();
  const filtro = entrada.filtro ?? {};
  const opcionesBase = {
    ahora,
    dueno: entrada.dueno ?? 'sistema',
    alcance: entrada.alcance ?? 'publico',
  };

  const grafo = crearGrafo();
  const brillo = new Map<string, number>();
  const padres = new Map<string, string | null>();
  const entidadesFiltradas: EntidadIA[] = [];

  for (const entidad of entrada.entidades) {
    if (!pasaFiltro(entidad, filtro)) continue;
    entidadesFiltradas.push(entidad);
  }

  let centroId: string | null = null;
  for (const entidad of entidadesFiltradas) {
    if (entidad.tipo === 'astraura') {
      centroId = idEntidad(entidad.id);
      break;
    }
  }
  if (!centroId && entidadesFiltradas.length > 0) {
    centroId = idEntidad(entidadesFiltradas[0].id);
  }

  for (const entidad of entidadesFiltradas) {
    const id = idEntidad(entidad.id);
    const esCentro = id === centroId;
    const b = brilloEntidad(entidad, esCentro);
    brillo.set(id, b);
    padres.set(id, esCentro ? null : centroId);
    anadirNodo(grafo, nodoEntidad(entidad, { ...opcionesBase, esCentro }));
  }

  const cometas: string[] = [];
  const lunas: string[] = [];

  for (const entidad of entidadesFiltradas) {
    const id = idEntidad(entidad.id);
    if (!grafo.nodos.has(id)) continue;

    if ((entidad.tipo === 'agente' || entidad.tipo === 'bot') && entidad.estado === 'trabajando') {
      cometas.push(id);
    }
    if (entidad.tipo === 'habilidad' || entidad.tipo === 'conector') {
      lunas.push(id);
      if (centroId && id !== centroId) {
        anadirArista(grafo, {
          de: centroId,
          a: id,
          tipo: 'usa',
          t: ahora,
          intensidad: 0.7,
        });
        padres.set(id, centroId);
      }
    }
  }

  const particulas: LlamadaIA[] = [];
  for (const llamada of entrada.llamadas) {
    const deId = idEntidad(llamada.de);
    const aId = idEntidad(llamada.a);
    if (!grafo.nodos.has(deId) || !grafo.nodos.has(aId)) continue;
    anadirArista(grafo, {
      de: deId,
      a: aId,
      tipo: 'senal',
      t: llamada.t,
      intensidad: llamada.intensidad,
    });
    particulas.push(llamada);
  }

  return {
    grafo,
    centro: centroId,
    cometas,
    lunas,
    particulas,
    filtro,
    brillo,
    padres,
  };
}

export function entidadesPorCerebro(entidades: readonly EntidadIA[]): Map<string, EntidadIA[]> {
  const mapa = new Map<string, EntidadIA[]>();
  for (const e of entidades) {
    const key = e.cerebroId ?? 'sin-cerebro';
    const arr = mapa.get(key) ?? [];
    arr.push(e);
    mapa.set(key, arr);
  }
  return mapa;
}

export function entidadesPorGrupo(entidades: readonly EntidadIA[]): Map<string, EntidadIA[]> {
  const mapa = new Map<string, EntidadIA[]>();
  for (const e of entidades) {
    const key = e.grupoId ?? 'sin-grupo';
    const arr = mapa.get(key) ?? [];
    arr.push(e);
    mapa.set(key, arr);
  }
  return mapa;
}

export function entidadesPorEstado(entidades: readonly EntidadIA[]): Map<EstadoEntidad, EntidadIA[]> {
  const mapa = new Map<EstadoEntidad, EntidadIA[]>();
  for (const e of entidades) {
    const estado = e.estado ?? 'desconocido';
    if (!ESTADOS_ENTIDAD.includes(estado as EstadoEntidad)) continue;
    const arr = mapa.get(estado) ?? [];
    arr.push(e);
    mapa.set(estado, arr);
  }
  return mapa;
}

export function llamadasRecientes(
  llamadas: readonly LlamadaIA[],
  desde: number,
  limite = 50,
): LlamadaIA[] {
  return llamadas
    .filter((l) => l.t >= desde)
    .sort((a, b) => b.t - a.t)
    .slice(0, limite);
}