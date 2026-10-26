export type ServicioA1 = "libretranslate" | "stirling-pdf" | "archivebox" | "comfyui" | "openhands";
export type EntornoEjecucion = "localhost" | "app-nativa-mac" | "https" | "desconocido";

export interface ServicioInfo {
  nombre: string;
  version: string;
  puertoA1: number;
  puertoMac: number;
  ramMedida: string;
  arranqueEnFrioSegundos: number;
  bajoDemanda: true;
}

export const SERVICIOS_A1: Record<ServicioA1, ServicioInfo> = {
  libretranslate: { nombre: "LibreTranslate", version: "1.9.6", puertoA1: 5000, puertoMac: 5100, ramMedida: "711 MiB", arranqueEnFrioSegundos: 3, bajoDemanda: true },
  "stirling-pdf": { nombre: "Stirling-PDF", version: "3.2.0", puertoA1: 8180, puertoMac: 8180, ramMedida: "1,4 GiB", arranqueEnFrioSegundos: 109, bajoDemanda: true },
  archivebox: { nombre: "ArchiveBox", version: "0.9.73", puertoA1: 8001, puertoMac: 8001, ramMedida: "sin medir", arranqueEnFrioSegundos: 76, bajoDemanda: true },
  comfyui: { nombre: "ComfyUI", version: "0.42.1", puertoA1: 8188, puertoMac: 8188, ramMedida: "4,1 GB", arranqueEnFrioSegundos: 22, bajoDemanda: true },
  openhands: { nombre: "OpenHands Agent Server", version: "1.7.1", puertoA1: 8010, puertoMac: 8010, ramMedida: "375 MiB", arranqueEnFrioSegundos: 14, bajoDemanda: true },
};

export interface UrlPorDefectoResultado { url: string | null; motivo: string; }

const VARIABLES_ENTORNO: Record<ServicioA1, string> = {
  libretranslate: "LIBRETRANSLATE_URL", "stirling-pdf": "STIRLING_PDF_URL",
  archivebox: "ARCHIVEBOX_URL", comfyui: "COMFYUI_URL", openhands: "OPENHANDS_URL",
};

function detectarEntorno(): EntornoEjecucion {
  if (typeof window === "undefined") return "desconocido";
  const esLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const esAppNativa = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (esLocalhost) return "localhost";
  if (esAppNativa) return "app-nativa-mac";
  if (window.location.protocol === "https:") return "https";
  return "desconocido";
}

export function urlPorDefecto(servicio: ServicioA1, entorno?: EntornoEjecucion): UrlPorDefectoResultado {
  const envVar = VARIABLES_ENTORNO[servicio];
  const valorEnv = typeof process !== "undefined" ? process.env[envVar] : undefined;
  if (valorEnv) return { url: valorEnv, motivo: `variable de entorno ${envVar}` };
  const info = SERVICIOS_A1[servicio];
  const entornoReal = entorno ?? detectarEntorno();
  if (entornoReal === "localhost" || entornoReal === "app-nativa-mac") return { url: `http://127.0.0.1:${info.puertoMac}`, motivo: `túnel com.starseed.tunel-servicios-a1 (${entornoReal})` };
  if (entornoReal === "https") return { url: null, motivo: "una página HTTPS no puede llamar a 127.0.0.1 (contenido mixto bloqueado)" };
  return { url: null, motivo: `entorno no compatible (${entornoReal})` };
}

export function esperaFria(servicio: ServicioA1): number {
  const info = SERVICIOS_A1[servicio];
  return servicio === "comfyui" ? info.arranqueEnFrioSegundos + 30 : info.arranqueEnFrioSegundos;
}