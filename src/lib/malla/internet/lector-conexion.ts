import type { NetworkInformationLike } from '../../../ai/astraura/mesh/connectivity';

export interface EntornoConexion {
  navigator?: { connection?: NetworkInformationLike } | null;
  nativa?: { medida?: () => boolean | null } | null;
}

export interface ResultadoConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  nativaMedida: boolean | null;
}

export function leerConexion(entorno: EntornoConexion): ResultadoConexion {
  const connection = entorno.navigator?.connection ?? null;
  const nativa = entorno.nativa ?? null;

  let nativaMedida: boolean | null = null;

  if (nativa && typeof nativa.medida === 'function') {
    try {
      const valor = nativa.medida();
      if (valor === true || valor === false) {
        nativaMedida = valor;
      }
    } catch {
      // falta en el puente nativo: ver §8.2 del contrato
      nativaMedida = null;
    }
  }

  if (!connection) {
    return { nativaMedida };
  }

  return {
    tipo: connection.type,
    saveData: connection.saveData,
    effectiveType: connection.effectiveType,
    nativaMedida,
  };
}

export function suscribirConexion(
  entorno: EntornoConexion,
  alCambiar: () => void
): () => void {
  const connection = entorno.navigator?.connection ?? null;

  if (!connection || typeof connection.addEventListener !== 'function') {
    return () => {};
  }

  connection.addEventListener('change', alCambiar);

  return () => {
    if (typeof connection.removeEventListener === 'function') {
      connection.removeEventListener('change', alCambiar);
    }
  };
}