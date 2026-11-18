/**
 * Lector de conexión del aparato (INT1116A · contrato §8.2, malla-cristalina-sio2).
 *
 * Reúne en UNA lectura lo que el aparato sabe de su conexión a internet:
 *  · la Network Information API del navegador (`navigator.connection`, solo
 *    Chromium y WebView: Safari y Firefox no la traen);
 *  · la marca de red de pago del lado nativo (Android `isActiveNetworkMetered`).
 *
 * Falta en el puente nativo: ver §8.2 del contrato — `isActiveNetworkMetered`
 * todavía no llega desde el puente, así que `nativa` es opcional y si no está
 * `nativaMedida` es null (no se inventa).
 *
 * Módulo puro: el navegador y la marca nativa se INYECTAN en `entorno`.
 * Nunca lanza. Sin señal alguna la conexión queda «desconocida»: §8.2 manda
 * no asumir que sea gratis.
 */

/** Forma de `navigator.connection`, igual a la de mesh/connectivity.ts (que no
 *  exporta su tipo: se repite aquí para no acoplar módulos puros entre sí). */
export interface ConexionNavegador {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  type?: string;
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

/** Entorno inyectado: navegador (real o de prueba) y marca nativa opcional. */
export interface EntornoConexion {
  navigator?: { connection?: ConexionNavegador | null } | null;
  /** Marca de red de pago nativa (hoy no existe en el puente: opcional). */
  nativa?: { medida?: () => boolean | null } | null;
}

export interface LecturaConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  /** Marca nativa de red de pago; null si no hay dato fiable. */
  nativaMedida: boolean | null;
}

/** Lee la conexión del entorno dado; nunca lanza. */
export function leerConexion(entorno: EntornoConexion): LecturaConexion {
  const lectura: LecturaConexion = { nativaMedida: null };
  // Marca nativa: si falta, si no es función, si devuelve null o si lanza,
  // el resultado es null (honestidad: nada se inventa).
  try {
    const medida = entorno?.nativa?.medida;
    if (typeof medida === "function") {
      const valor = medida();
      if (typeof valor === "boolean") lectura.nativaMedida = valor;
    }
  } catch {
    lectura.nativaMedida = null;
  }
  // Navegador: sin `connection` (Safari, Firefox) solo queda `nativaMedida`.
  const conexion = entorno?.navigator?.connection;
  if (!conexion) return lectura;
  if (typeof conexion.type === "string") lectura.tipo = conexion.type;
  if (typeof conexion.saveData === "boolean") lectura.saveData = conexion.saveData;
  if (typeof conexion.effectiveType === "string") {
    lectura.effectiveType = conexion.effectiveType;
  }
  return lectura;
}

/** Escucha `change` de `navigator.connection`; devuelve la baja. Sin
 *  `connection` la suscripción y la baja no hacen nada (nunca lanzan). */
export function suscribirConexion(
  entorno: EntornoConexion,
  alCambiar: () => void,
): () => void {
  const conexion = entorno?.navigator?.connection;
  if (!conexion || typeof conexion.addEventListener !== "function") {
    return () => {};
  }
  conexion.addEventListener?.("change", alCambiar);
  return () => {
    conexion.removeEventListener?.("change", alCambiar);
  };
}
