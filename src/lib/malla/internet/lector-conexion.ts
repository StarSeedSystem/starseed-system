interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  type?: string;
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

function netInfo(navigatorObj?: { connection?: NetworkInformationLike | null } | null): NetworkInformationLike | null {
  if (!navigatorObj || !navigatorObj.connection) {
    return null;
  }
  return navigatorObj.connection;
}

export function leerConexion(entorno: {
  navigator?: { connection?: NetworkInformationLike | null } | null;
  nativa?: { medida?: () => boolean | null } | null;
}): { tipo?: string; saveData?: boolean; effectiveType?: string; nativaMedida: boolean | null } {
  const nativaMedida = obtenerMedidaNativa(entorno.nativa);
  const info = netInfo(entorno.navigator);

  if (!info) {
    return { nativaMedida };
  }

  return {
    tipo: info.type,
    saveData: info.saveData,
    effectiveType: info.effectiveType,
    nativaMedida,
  };
}

function obtenerMedidaNativa(
  nativa?: { medida?: () => boolean | null } | null
): boolean | null {
  if (!nativa || typeof nativa.medida !== "function") {
    return null;
  }
  try {
    const resultado = nativa.medida();
    return typeof resultado === "boolean" ? resultado : null;
  } catch {
    // falta en el puente nativo: ver §8.2 del contrato
    return null;
  }
}

export function suscribirConexion(
  entorno: {
    navigator?: { connection?: NetworkInformationLike | null } | null;
    nativa?: { medida?: () => boolean | null } | null;
  },
  alCambiar: () => void
): () => void {
  const info = netInfo(entorno.navigator);
  if (!info || typeof info.addEventListener !== "function") {
    return () => {};
  }

  info.addEventListener("change", alCambiar);
  return () => {
    if (typeof info.removeEventListener === "function") {
      info.removeEventListener("change", alCambiar);
    }
  };
}