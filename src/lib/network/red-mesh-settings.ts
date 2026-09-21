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

