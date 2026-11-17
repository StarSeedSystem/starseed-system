/**
 * Lector de lo que este aparato sabe de su conexión (contrato de la malla
 * cristalina, §8.2): la señal cruda del navegador (Network Information API,
 * solo Chromium/WebView) y la marca de red de pago del lado nativo (Android
 * `isActiveNetworkMetered`).
 *
 * Reutiliza la forma del tipo que vive en `src/ai/astraura/mesh/connectivity.ts`
 * (`NetworkInformationLike`, que no se exporta) sin duplicar su lógica: aquí no
 * hay `navigator` global, el entorno se INYECTA, y nada lanza.
 *
 * «falta en el puente nativo: ver §8.2 del contrato» — la marca nativa aún no
 * la trae el puente; la entrada es opcional y si falta, `nativaMedida` es null.
 */

export interface ConexionNavegador {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (tipo: string, cb: () => void) => void;
  removeEventListener?: (tipo: string, cb: () => void) => void;
}

export interface EntornoConexion {
  navigator?: { connection?: ConexionNavegador | null } | null;
  nativa?: { medida?: () => boolean | null } | null;
}

export interface LecturaConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  nativaMedida: boolean | null;
}

export function leerConexion(entorno: EntornoConexion): LecturaConexion {
  const lectura: LecturaConexion = { nativaMedida: null };
  try {
    const connection = entorno?.navigator?.connection;
    if (connection) {
      if (typeof connection.type === 'string') lectura.tipo = connection.type;
      if (typeof connection.effectiveType === 'string') {
        lectura.effectiveType = connection.effectiveType;
      }
      if (typeof connection.saveData === 'boolean') lectura.saveData = connection.saveData;
    }
    // falta en el puente nativo: ver §8.2 del contrato
    const medida = entorno?.nativa?.medida;
    if (typeof medida === 'function') {
      const valor = medida();
      if (typeof valor === 'boolean') lectura.nativaMedida = valor;
    }
  } catch {
    /* la señal falta o falla: se informa como null, nunca lanza */
  }
  return lectura;
}

export function suscribirConexion(
  entorno: EntornoConexion,
  alCambiar: () => void,
): () => void {
  try {
    const connection = entorno?.navigator?.connection;
    if (!connection || typeof connection.addEventListener !== 'function') {
      return () => {};
    }
    connection.addEventListener('change', alCambiar);
    return () => {
      try {
        connection.removeEventListener?.('change', alCambiar);
      } catch {
        /* la baja tampoco lanza */
      }
    };
  } catch {
    return () => {};
  }
}
