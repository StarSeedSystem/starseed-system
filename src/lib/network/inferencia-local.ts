/**
 * inferencia-local.ts — Descripción y selección de nodos PAIR (Personal AI Router)
 * como cola de inferencia local OpenAI-compatible.
 */

export type TransporteInferencia = 'webrtc-local' | 'wifi-halo' | 'reticulum' | 'tunel';

export interface NodoInferenciaLocal {
  id: string;
  host: string;
  puerto: number;
  baseUrl: string;
  motores: string[];
  modelos: string[];
  ramMB: number;
  latenciaMs?: number;
  carga?: number;
  ultimoLatido: string;
  transporte: TransporteInferencia;
}

export const NODOS_INFERENCIA_LOCAL_STORAGE = 'starseed.mesh.inferencia-local.v1';

export interface OpcionesResumenInferencia {
  modelosEstudio?: string[];
  minRamMB?: number;
}

export interface ResumenNodosInferencia {
  totales: number;
  listos: number;
  conModelo: number;
  latenciaPromedio: number;
}

export interface OpcionesElegirNodo {
  modelo?: string;
  /** PAIR comparte trabajos completos; no agrega ni reparte GPU. */
  requiereGpu: false;
  minRamMB?: number;
}

export function esNodoListo(
  nodo: NodoInferenciaLocal,
  opciones?: OpcionesResumenInferencia
): boolean {
  const minRam = opciones?.minRamMB ?? 512;
  const modelosEstudio = opciones?.modelosEstudio;
  const tieneRam = nodo.ramMB >= minRam;
  const tieneModeloReq =
    !modelosEstudio || modelosEstudio.length === 0
      ? nodo.modelos.length > 0
      : nodo.modelos.some((m) => modelosEstudio.includes(m));
  return tieneRam && tieneModeloReq;
}

export function nodoConBase(
  nodo: NodoInferenciaLocal,
  ruta: string = '/v1/chat/completions'
): string {
  const base =
    nodo.baseUrl && nodo.baseUrl.trim().length > 0
      ? nodo.baseUrl.trim().replace(/\/+$/, '')
      : `http://${nodo.host}:${nodo.puerto}`;
  const path = ruta.startsWith('/') ? ruta : `/${ruta}`;
  return `${base}${path}`;
}

export function resumenDisponibles(
  nodos: NodoInferenciaLocal[],
  opciones?: OpcionesResumenInferencia
): ResumenNodosInferencia {
  const modelosEstudio = opciones?.modelosEstudio;

  const totales = nodos.length;

  const nodosConModelo = nodos.filter((n) => {
    if (!modelosEstudio || modelosEstudio.length === 0) {
      return n.modelos.length > 0;
    }
    return n.modelos.some((m) => modelosEstudio.includes(m));
  });

  const conModelo = nodosConModelo.length;

  const nodosListos = nodos.filter((n) => esNodoListo(n, opciones));

  const listos = nodosListos.length;

  const listosConLatencia = nodosListos.filter(
    (n) => typeof n.latenciaMs === 'number' && Number.isFinite(n.latenciaMs)
  );

  const sumaLatencias = listosConLatencia.reduce(
    (total, nodo) => total + (nodo.latenciaMs ?? 0),
    0
  );
  const latenciaPromedio = listosConLatencia.length > 0
    ? Math.round(sumaLatencias / listosConLatencia.length)
    : 0;

  return {
    totales,
    listos,
    conModelo,
    latenciaPromedio,
  };
}

export function elegirNodo(
  nodos: NodoInferenciaLocal[],
  opciones: OpcionesElegirNodo
): NodoInferenciaLocal | null {
  if (nodos.length === 0) {
    return null;
  }

  const modeloReq = opciones.modelo;
  const minRam = opciones.minRamMB ?? 512;

  const candidatos = nodos.filter((n) => {
    if (n.ramMB < minRam) {
      return false;
    }
    if (modeloReq) {
      return n.modelos.includes(modeloReq);
    }
    return n.modelos.length > 0;
  });

  if (candidatos.length === 0) {
    return null;
  }

  candidatos.sort((a, b) => {
    const cargaA = Number.isFinite(a.carga) ? (a.carga as number) : Infinity;
    const cargaB = Number.isFinite(b.carga) ? (b.carga as number) : Infinity;
    if (cargaA !== cargaB) {
      return cargaA - cargaB;
    }

    const latA = Number.isFinite(a.latenciaMs) ? (a.latenciaMs as number) : Infinity;
    const latB = Number.isFinite(b.latenciaMs) ? (b.latenciaMs as number) : Infinity;
    if (latA !== latB) {
      return latA - latB;
    }

    return a.id.localeCompare(b.id);
  });

  return candidatos[0];
}
