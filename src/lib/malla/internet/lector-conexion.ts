/**
 * Lector de conexion de red e indicadores nativos (Adenda 8.2).
 * Falta en el puente nativo: ver §8.2 del contrato (Android `isActiveNetworkMetered`).
 */

import type { NetworkInformationLike } from "@/ai/astraura/mesh/connectivity";

export interface EntornoConexion {
  navigator?: {
    connection?: NetworkInformationLike;
  } | null;
  nativa?: {
    medida?: () => boolean | null;
  } | null;
}

export interface ResultadoConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  nativaMedida: boolean | null;
}

export function leerConexion(entorno: EntornoConexion): ResultadoConexion {
  const conn = entorno?.navigator?.connection;
  const tipo = conn?.type;
  const saveData = conn?.saveData;
  const effectiveType = conn?.effectiveType;

  let nativaMedida: boolean | null = null;
  const medidaFn = entorno?.nativa?.medida;
  if (typeof medidaFn === "function") {
    try {
      const res = medidaFn();
      if (typeof res === "boolean") {
        nativaMedida = res;
      }
    } catch {
      nativaMedida = null;
    }
  }

  return {
    tipo,
    saveData,
    effectiveType,
    nativaMedida,
  };
}

export function suscribirConexion(entorno: EntornoConexion, alCambiar: () => void): () => void {
  const conn = entorno?.navigator?.connection;
  if (!conn || typeof conn.addEventListener !== "function") {
    return () => {};
  }

  conn.addEventListener("change", alCambiar);
  return () => {
    if (typeof conn.removeEventListener === "function") {
      conn.removeEventListener("change", alCambiar);
    }
  };
}
