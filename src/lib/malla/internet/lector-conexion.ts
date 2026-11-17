/**
 * StarSeed OS · Lector de conexión del aparato (INT1116A).
 *
 * Lee lo que el aparato sabe de su conexión actual, para §8.2 del contrato
 * `architecture/malla-cristalina-sio2.md`: tipo, ahorro de datos y velocidad
 * efectiva según el navegador (Network Information API) más la marca de red
 * de pago del lado nativo (Android `isActiveNetworkMetered`) — falta en el
 * puente nativo: ver §8.2 del contrato.
 *
 * Módulo PURO: el entorno (navegador y marca nativa) se INYECTA; nunca toca
 * `navigator` global, ni red, ni disco, ni procesos. Nunca lanza.
 */

/**
 * Espejo estructural de `NetworkInformationLike` de
 * `src/ai/astraura/mesh/connectivity.ts`. Allí la interfaz no se exporta, así
 * que aquí se declara la MISMA forma (no se duplica su lógica `netInfo`).
 */
export interface ConexionNavegador {
  effectiveType?: string; // "4g" | "3g" | "2g" | "slow-2g"
  downlink?: number; // Mbps estimados
  rtt?: number; // ms
  type?: string; // "wifi" | "cellular" | "ethernet" | "none" | "unknown"
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

export interface EntornoConexion {
  navigator?: { connection?: ConexionNavegador | null } | null;
  /** Marca de red de pago del lado nativo (Android `isActiveNetworkMetered`).
   *  Falta en el puente nativo: ver §8.2 del contrato. */
  nativa?: { medida?: () => boolean | null } | null;
}

export interface LecturaConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  nativaMedida: boolean | null;
}

/** Lee la conexión del entorno dado. Ante `connection` ausente (Safari,
 *  Firefox) devuelve solo `nativaMedida`. Nunca lanza. */
export function leerConexion(entorno: EntornoConexion): LecturaConexion {
  let nativaMedida: boolean | null = null;
  try {
    const valor = entorno?.nativa?.medida?.();
    nativaMedida = typeof valor === 'boolean' ? valor : null;
  } catch {
    nativaMedida = null; // la marca nativa nunca tumba la lectura
  }
  const conexion = entorno?.navigator?.connection ?? null;
  if (!conexion) return { nativaMedida };
  return {
    tipo: typeof conexion.type === 'string' ? conexion.type : undefined,
    saveData: typeof conexion.saveData === 'boolean' ? conexion.saveData : undefined,
    effectiveType: typeof conexion.effectiveType === 'string' ? conexion.effectiveType : undefined,
    nativaMedida,
  };
}

/** Escucha `change` de `navigator.connection` y devuelve la baja. Sin
 *  `connection` (o sin `addEventListener`) devuelve una baja que no hace
 *  nada. Nunca lanza. */
export function suscribirConexion(entorno: EntornoConexion, alCambiar: () => void): () => void {
  const conexion = entorno?.navigator?.connection ?? null;
  if (!conexion || typeof conexion.addEventListener !== 'function') return () => {};
  conexion.addEventListener('change', alCambiar);
  return () => {
    conexion.removeEventListener?.('change', alCambiar);
  };
}
