export interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  type?: string;
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

export interface EntornoConexion {
  navigator?: { connection?: NetworkInformationLike } | null;
  /** Marca nativa: Android isActiveNetworkMetered() HOY NO EXISTE en el puente */
  nativa?: { medida?: () => boolean | null } | null;
}

export interface ResultadoConexion {
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
  nativaMedida: boolean | null;
}

export function leerConexion(entorno: EntornoConexion): ResultadoConexion {
  const resultado: ResultadoConexion = { nativaMedida: null };

  const connection = entorno.navigator?.connection ?? null;
  if (connection) {
    if (connection.type !== undefined) resultado.tipo = connection.type;
    if (connection.saveData !== undefined) resultado.saveData = connection.saveData;
    if (connection.effectiveType !== undefined) resultado.effectiveType = connection.effectiveType;
  }

  const medidaNativa = entorno.nativa?.medida;
  if (typeof medidaNativa === "function") {
    try {
      resultado.nativaMedida = medidaNativa();
    } catch {
      resultado.nativaMedida = null;
    }
  }
  return resultado;
}

export function suscribirConexion(entorno: EntornoConexion, alCambiar: () => void): () => void {
  const connection = entorno.navigator?.connection;
  if (!connection) return () => {};

  const addEventListener = connection.addEventListener;
  const removeEventListener = connection.removeEventListener;
  if (typeof addEventListener !== "function" || typeof removeEventListener !== "function") return () => {};

  addEventListener("change", alCambiar);
  return () => removeEventListener("change", alCambiar);
}