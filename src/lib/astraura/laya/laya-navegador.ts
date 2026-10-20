export interface PerfilMedio {
  esPWA?: boolean;
  tieneWebGPU?: boolean;
  almacenamientoPersistenteGB?: number;
  memoriaGB?: number;
  esAppNativa?: boolean;
  bateríaPorcentaje?: number;
  estaVisible?: boolean;
  vendorLayaTsExiste?: boolean;
  modeloExportadoExiste?: boolean;
}

export function planLayaLocal(perfilMedio: PerfilMedio): {
  readonly cargar: boolean;
  readonly modelo: "multilingual-int8" | "multilingual" | null;
  readonly motivo: string;
} {
  const {
    esPWA,
    tieneWebGPU,
    almacenamientoPersistenteGB,
    memoriaGB,
    esAppNativa,
    bateríaPorcentaje,
    estaVisible,
    vendorLayaTsExiste,
    modeloExportadoExiste,
  } = perfilMedio;

  if (!vendorLayaTsExiste || !modeloExportadoExiste) {
    return {
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts o el modelo exportado aún no existen",
    };
  }

  if (estaVisible === false) {
    return {
      cargar: false,
      modelo: null,
      motivo: "pestaña oculta",
    };
  }

  if (bateríaPorcentaje !== undefined && bateríaPorcentaje < 20) {
    return {
      cargar: false,
      modelo: null,
      motivo: "batería inferior al 20%",
    };
  }

  if (esAppNativa) {
    return {
      cargar: true,
      modelo: Math.random() < 0.5 ? "multilingual-int8" : "multilingual",
      motivo: "app nativa con presupuesto disponible",
    };
  }

  if (esPWA && tieneWebGPU && almacenamientoPersistenteGB !== undefined && almacenamientoPersistenteGB >= 2 && memoriaGB !== undefined && memoriaGB >= 4) {
    return {
      cargar: true,
      modelo: Math.random() < 0.5 ? "multilingual-int8" : "multilingual",
      motivo: "PWA con WebGPU y requisitos de memoria/almacenamiento satisfechos",
    };
  }

  return {
    cargar: false,
    modelo: null,
    motivo: "criterios de carga no satisfechos (requiere web, PWA o app nativa)",
  };
}
