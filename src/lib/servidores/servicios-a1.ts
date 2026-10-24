/**
 * servicios-a1.ts (CNX1020A · Ola 1020U): servicios instalados en el A1 el
 * 2026-10-20 (architecture/repos-libreria-1020d.md §7, medidos con la palabra de
 * Alex) y cómo se llegan a ver desde la Mac por el túnel launchd
 * `com.starseed.tunel-servicios-a1`, solo 127.0.0.1. Módulo PURO: sin red, disco
 * ni procesos; el medio entra como tipo y las variables de entorno las trae
 * quien llama. Cifra no medida se declara como tal.
 */

export type ServicioA1 =
  | "libretranslate" | "stirling-pdf" | "archivebox" | "comfyui" | "openhands-agent";

/** Medio donde corre el OS en esta ventana. */
export type EntornoOS =
  | "localhost" | "nativa-mac" | "tunel-https" | "nube-https" | "otro-http";

/** Cuánto puede tardar la PRIMERA llamada a un servicio apenas encendido. */
export interface EsperaFria {
  segundos: number;
  /** true = cifra medida el 2026-10-20; false = estimación declarada. */
  medido: boolean;
  detalle: string;
}

/** Puerto local en la Mac por el túnel: igual que el del A1, salvo LibreTranslate (el 5000 de la Mac es AirPlay). */
export interface ServicioInfo {
  nombre: string;
  version: string;
  puertoA1: number; urlA1: string;
  puertoMac: number; urlMac: string;
  /** RAM medida el 2026-10-20; `null` = no medida (se dice como tal). */
  ramMedidaMb: number | null;
  /** RAM libre que pide `starseed-cabe` antes de encenderlo bajo demanda. */
  memoriaNecesariaMb: number;
  esperaFria: EsperaFria;
  nota: string;
}

/** Variable de entorno que manda sobre la URL de cada servicio, si existe. */
export const VARIABLES_ENTORNO: Record<ServicioA1, string> = {
  libretranslate: "LIBRETRANSLATE_URL", "stirling-pdf": "STIRLING_PDF_URL",
  archivebox: "ARCHIVEBOX_URL", comfyui: "COMFYUI_URL",
  "openhands-agent": "OPENHANDS_AGENT_URL",
};

/** Unidad launchd del túnel en la Mac (solo 127.0.0.1). */
export const TUNEL_SERVICIOS_A1 = "com.starseed.tunel-servicios-a1";

/** URL, de dónde sale cuando la hay y por qué hay o no hay («motivo», útil en UI). */
export interface UrlResultado {
  url: string | null;
  origen: "variable-de-entorno" | "tunel-a1" | null;
  motivo: string | null;
}

function ficha(
  nombre: string, version: string, puertoA1: number, puertoMac: number,
  ramMedidaMb: number | null, memoriaNecesariaMb: number,
  esperaFria: EsperaFria, nota: string,
): ServicioInfo {
  return {
    nombre, version, puertoA1, puertoMac, ramMedidaMb, memoriaNecesariaMb, esperaFria, nota,
    urlA1: `http://127.0.0.1:${puertoA1}`, urlMac: `http://127.0.0.1:${puertoMac}`,
  };
}

const fria = (segundos: number, detalle: string): EsperaFria => ({ segundos, medido: true, detalle });
/** Catálogo medido el 2026-10-20 (SOP repos-libreria-1020d.md §7). */
export const SERVICIOS_A1: Record<ServicioA1, ServicioInfo> = {
  libretranslate: ficha("LibreTranslate", "1.9.6", 5000, 5100, 711, 1500,
    fria(3, "Traducir dos frases desde la Mac tardó 2,8 s."), "En la Mac el puerto 5000 es de AirPlay: por el túnel se llega al 5100."),
  "stirling-pdf": ficha("Stirling-PDF", "3.2.0", 8180, 8180, 1434, 1500,
    fria(109, "Arranque en frío medido: 109 s, con 319 rutas API."), "Más de 50 herramientas PDF por API REST."),
  archivebox: ficha("ArchiveBox", "0.9.73", 8001, 8001, null, 1200,
    fria(76, "Archivar una página (PDF, captura, SingleFile y HTML) tardó 1 min 16 s; su RAM no se midió."),
    "archive.org y el índice público apagados: nada privado sale del aparato."),
  comfyui: ficha("ComfyUI", "0.42.1", 8188, 8188, 4198, 4500,
    fria(22, "Arranque medido: 22 s, más la carga del modelo SD 1.5 en fp32 (no medida). Una imagen de 512 px con 12 pasos tardó 713 s."),
    "En CPU (el A1 no tiene GPU): solo cola sin prisa, tope 6 GB."),
  "openhands-agent": ficha("OpenHands Agent Server", "1.7.1", 8010, 8010, 375, 2500,
    fria(14, "Sano en 14 s; 375 MiB en reposo y 36 rutas."), "Sandboxes de agente: conversaciones, eventos, ejecutar, pausar, confirmación."),
};
/** Ficha medida de un servicio del catálogo. */
export const infoServicioA1 = (servicio: ServicioA1): ServicioInfo => SERVICIOS_A1[servicio];

/** Qué puede tardar la primera llamada al servicio (arranque en frío incluido). */
export const esperaFria = (servicio: ServicioA1): EsperaFria => SERVICIOS_A1[servicio].esperaFria;

/** URL por defecto del servicio en ESTA ventana: la variable de entorno si
 * existe; si no, la del túnel solo en localhost o app nativa de la Mac; en otro
 * medio, `null` con el motivo. */
export function urlPorDefecto(
  servicio: ServicioA1, entorno: EntornoOS,
  variables: Partial<Record<ServicioA1, string>> = {},
): UrlResultado {
  const viaVariable = variables[servicio]?.trim();
  if (viaVariable) {
    return {
      url: viaVariable, origen: "variable-de-entorno",
      motivo: `Manda ${VARIABLES_ENTORNO[servicio]}, definida por quien despliega.`,
    };
  }
  if (entorno === "localhost" || entorno === "nativa-mac") {
    const s = SERVICIOS_A1[servicio];
    return {
      url: s.urlMac, origen: "tunel-a1",
      motivo: `Llega por ${TUNEL_SERVICIOS_A1}: en la Mac ${s.puertoMac} → 127.0.0.1:${s.puertoA1} del A1.`,
    };
  }
  if (entorno === "tunel-https" || entorno === "nube-https") {
    return {
      url: null, origen: null,
      motivo: "Una página https no puede llamar a 127.0.0.1: el navegador lo bloquea como contenido mixto.",
    };
  }
  return {
    url: null, origen: null,
    motivo: "Desde otro http, 127.0.0.1 es ese aparato, no la Mac: el túnel solo se ve en la Mac.",
  };
}
