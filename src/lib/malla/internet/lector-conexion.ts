/**
 * StarSeed OS — Lector de Conexión y Red (INT14 / §8.2)
 * ============================================================================
 * Lee el estado de la conexión de red usando Network Information API e introduce
 * soporte para la marca nativa de red de pago (Android `isActiveNetworkMetered`).
 * 
 * Falta en el puente nativo: ver §8.2 del contrato (Android `isActiveNetworkMetered`
 * no está expuesto aún en el puente nativo, por lo que se acepta de forma opcional).
 */

export interface NetworkInformationLike {
  effectiveType?: string; // "4g" | "3g" | "2g" | "slow-2g"
  downlink?: number; // Mbps
  rtt?: number; // ms
  type?: string; // "wifi" | "cellular" | "ethernet" | "none" | "unknown"
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface EntornoConexion {
  navigator?: {
    connection?: NetworkInformationLike | null;
    mozConnection?: NetworkInformationLike | null;
    webkitConnection?: NetworkInformationLike | null;
  } | null;
  nativa?: {
    medida?: () => boolean | null;
  } | null;
}

export interface ResultadoLectorConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  nativaMedida: boolean | null;
}

/**
 * Lee el estado actual de la conexión de red del entorno inyectado.
 * Nunca lanza; ante ausencias devuelve un objeto seguro.
 */
export function leerConexion(entorno?: EntornoConexion | null): ResultadoLectorConexion {
  let nativaMedida: boolean | null = null;
  try {
    if (entorno?.nativa?.medida && typeof entorno.nativa.medida === "function") {
      const res = entorno.nativa.medida();
      if (typeof res === "boolean") {
        nativaMedida = res;
      }
    }
  } catch {
    nativaMedida = null;
  }

  let conn: NetworkInformationLike | null = null;
  try {
    const nav = entorno?.navigator;
    if (nav) {
      conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
    }
  } catch {
    conn = null;
  }

  const tipo = conn?.type ?? undefined;
  const saveData = conn?.saveData ?? undefined;
  const effectiveType = conn?.effectiveType ?? undefined;

  const resultado: ResultadoLectorConexion = {
    nativaMedida,
  };

  if (tipo !== undefined) {
    resultado.tipo = tipo;
  }
  if (saveData !== undefined) {
    resultado.saveData = saveData;
  }
  if (effectiveType !== undefined) {
    resultado.effectiveType = effectiveType;
  }

  return resultado;
}

/**
 * Suscribe un callback a los cambios de la red en el entorno inyectado.
 * Devuelve una función para dar de baja la suscripción.
 * No hace nada si no hay soporte o entorno adecuado.
 */
export function suscribirConexion(entorno: EntornoConexion | null | undefined, alCambiar: () => void): () => void {
  if (!entorno || typeof alCambiar !== "function") {
    return () => {};
  }

  let conn: NetworkInformationLike | null = null;
  try {
    const nav = entorno?.navigator;
    if (nav) {
      conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
    }
  } catch {
    conn = null;
  }

  if (!conn || typeof conn.addEventListener !== "function") {
    return () => {};
  }

  try {
    conn.addEventListener("change", alCambiar);
    return () => {
      try {
        conn?.removeEventListener?.("change", alCambiar);
      } catch {
        /* ignorar */
      }
    };
  } catch {
    return () => {};
  }
}
