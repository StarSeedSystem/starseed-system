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
  requiereGpu?: boolean;
  minRamMB?: number;
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
  const minRam = opciones?.minRamMB ?? 512;
  const modelosEstudio = opciones?.modelosEstudio;

  const totales = nodos.length;

  const nodosConModelo = nodos.filter((n) => {
    if (!modelosEstudio || modelosEstudio.length === 0) {
      return n.modelos.length > 0;
    }
    return n.modelos.some((m) => modelosEstudio.includes(m));
  });

  const conModelo = nodosConModelo.length;

  const nodosListos = nodos.filter((n) => {
    const tieneRam = n.ramMB >= minRam;
    const tieneModeloReq =
      !modelosEstudio || modelosEstudio.length === 0
        ? n.modelos.length > 0
        : n.modelos.some((m) => modelosEstudio.includes(m));
    return tieneRam && tieneModeloReq;
  });

  const listos = nodosListos.length;

  const listosConLatencia = nodosListos.filter(
    (n) => typeof n.latenciaMs === 'number' && !isNaN(n.latenciaMs)
  );

  let latenciaPromedio = 0;
  if (listosConLatencia.length > 0) {
    const suma = listosConLatencia.reduce((acc, n) => acc + (n.latenciaMs ?? 0), 0);
    latenciaPromedio = Math.round(suma / listosConLatencia.length);
  } else {
    const todosConLatencia = nodos.filter(
      (n) => typeof n.latenciaMs === 'number' && !isNaN(n.latenciaMs)
    );
    if (todosConLatencia.length > 0) {
      const suma = todosConLatencia.reduce((acc, n) => acc + (n.latenciaMs ?? 0), 0);
      latenciaPromedio = Math.round(suma / todosConLatencia.length);
    }
  }

  return {
    totales,
    listos,
    conModelo,
    latenciaPromedio,
  };
}

export function elegirNodo(
  nodos: NodoInferenciaLocal[],
  opciones?: OpcionesElegirNodo
): NodoInferenciaLocal | null {
  if (!nodos || nodos.length === 0) {
    return null;
  }

  if (opciones?.requiereGpu === true) {
    return null;
  }

  const modeloReq = opciones?.modelo;
  const minRam = opciones?.minRamMB ?? 512;

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
    const cargaA = a.carga ?? 0;
    const cargaB = b.carga ?? 0;
    if (cargaA !== cargaB) {
      return cargaA - cargaB;
    }

    const latA = a.latenciaMs ?? Infinity;
    const latB = b.latenciaMs ?? Infinity;
    if (latA !== latB) {
      return latA - latB;
    }

    return a.id.localeCompare(b.id);
  });

  return candidatos[0];
}
