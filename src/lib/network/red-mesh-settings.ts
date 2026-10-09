import {
  TRANSPORTES_BWP,
  type TransporteBwp,
} from "@/ai/astraura/mesh/transporte-bwp";
import {
  nivelParaVoz,
  type NivelVozSuptonica,
  IDIOMAS_SUPERTONIC,
} from "@/lib/aurora/voz-starseed/niveles";

export const CLAVE_TRANSPORTE_PREFERIDO = "starseed.mesh.transporte-preferido.v1";
export const CLAVE_VOZ_SUPERTONIC = "starseed.mesh.voz.supertonic.v1";
export const CLAVE_VOZ_IDIOMA = "starseed.mesh.voz.idioma.v1";

/* CAMR — ajustes con migración (§6 · regla de propagación del OS) */
export const CLAVE_CAMR_ACTIVO = "starseed.mesh.camr.activo.v1";
export const CLAVE_CAMR_MODO_ENLACE = "starseed.mesh.camr.modo-enlace.v1";
export const CLAVE_CAMR_MODULACION = "starseed.mesh.camr.modulacion.v1";
export const CLAVE_CAMR_TPC = "starseed.mesh.camr.tpc.v1";
export const CLAVE_CAMR_CANAL = "starseed.mesh.camr.canal.v1";
export const CLAVE_CAMR_METRICA = "starseed.mesh.camr.metrica.v1";
export const CLAVE_CAMR_INDICATIVO = "starseed.mesh.camr.indicativo.v1";

export interface AjusteCamrPersistente {
  activo?: boolean;
  modoEnlace?: "hibrido-autonomo" | "manual";
  modulacion?: "automatico" | "manual";
  tpc?: "automatico" | "manual";
  canal?: "automatico" | "manual";
  metrica?: "hibrida" | "latencia" | "resiliencia";
  indicativo?: string;
}

/** Normaliza el valor guardado a booleano; por defecto `false`. */
export function leerActivoCamr(raw: string | null | undefined): boolean {
  if (raw === "true" || raw === "1") return true;
  return false;
}

/** Normaliza el modo de enlace; por defecto `hibrido-autonomo`. */
export function leerModoEnlaceCamr(raw: string | null | undefined): "hibrido-autonomo" | "manual" {
  return raw === "manual" ? "manual" : "hibrido-autonomo";
}

/** Normaliza el modo de radio; por defecto `automatico`. */
export function leerModoRadioCamr(raw: string | null | undefined): "automatico" | "manual" {
  return raw === "manual" ? "manual" : "automatico";
}

/** Normaliza la métrica; por defecto `hibrida`. */
export function leerMetricaCamr(raw: string | null | undefined): "hibrida" | "latencia" | "resiliencia" {
  if (raw === "latencia") return "latencia";
  if (raw === "resiliencia") return "resiliencia";
  return "hibrida";
}

/** Migración: convierte un ajuste antiguo (si existe) al formato nuevo. */
export function migrarAjusteCamr(antiguo: Partial<AjusteCamrPersistente> | null): AjusteCamrPersistente {
  if (!antiguo || typeof antiguo !== "object") return { activo: false, modoEnlace: "hibrido-autonomo", modulacion: "automatico", tpc: "automatico", canal: "automatico", metrica: "hibrida", indicativo: "" };
  return {
    activo: antiguo.activo ?? false,
    modoEnlace: antiguo.modoEnlace ?? "hibrido-autonomo",
    modulacion: antiguo.modulacion ?? "automatico",
    tpc: antiguo.tpc ?? "automatico",
    canal: antiguo.canal ?? "automatico",
    metrica: antiguo.metrica ?? "hibrida",
    indicativo: antiguo.indicativo ?? "",
  };
}

export interface DetalleTransporteOption {
  key: TransporteBwp;
  etiqueta: string;
  alcance: string;
  latencia: string;
  requiereHardware: boolean;
  prioridad: number;
}

export function normalizarInferenciaLocal(raw: string | null): boolean {
  if (!raw) return true;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "boolean") return parsed;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      if (typeof parsed.servirFlota === "boolean") return parsed.servirFlota;
      if (typeof parsed.enabled === "boolean") return parsed.enabled;
    }
    if (Array.isArray(parsed)) return parsed.length > 0;
  } catch {
    // fallback
  }
  return true;
}

export function evaluarNivelVozBorde(
  supertonicActivo: boolean,
  plataforma?: string
): NivelVozSuptonica {
  return nivelParaVoz({ supertonic: supertonicActivo, plataforma });
}

export function obtenerListaTransportes(): DetalleTransporteOption[] {
  const keys = Object.keys(TRANSPORTES_BWP) as TransporteBwp[];
  return keys.map((key) => {
    const info = TRANSPORTES_BWP[key];
    return {
      key,
      etiqueta: info.etiqueta,
      alcance: info.alcanceLectura,
      latencia: info.latencia,
      requiereHardware: info.requiereHardware,
      prioridad: info.prioridad,
    };
  });
}

const NOMBRES_IDIOMAS: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  pt: "Portugués",
  ja: "Japonés",
  zh: "Chino",
  ko: "Coreano",
  ru: "Ruso",
  ar: "Árabe",
  hi: "Hindi",
  nl: "Holandés",
  pl: "Polaco",
  tr: "Turco",
};

export function obtenerListaIdiomasVoz(): Array<{ code: string; label: string }> {
  return IDIOMAS_SUPERTONIC.map((code) => ({
    code,
    label: NOMBRES_IDIOMAS[code] ? `${NOMBRES_IDIOMAS[code]} (${code})` : code.toUpperCase(),
  }));
}

