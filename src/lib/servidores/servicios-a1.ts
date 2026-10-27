/**
 * Servidores · Direcciones y tiempos en frío de los servicios instalados en el A1
 * (2026-10-20), accesibles por defecto en localhost mediante el túnel
 * `com.starseed.tunel-servicios-a1`. Una página https no puede llamar a
 * 127.0.0.1, por lo que `urlPorDefecto` solo devuelve URL cuando el OS corre
 * en localhost o en la app nativa de la Mac.
 *
 * Las variables de entorno `COMFYUI_URL`, `LIBRETRANSLATE_URL`, etc. sovran
 * sobre las URLs por defecto cuando existen.
 */
export type ServicioA1 =
  | "libretranslate"
  | "stirling-pdf"
  | "archivebox"
  | "comfyui"
  | "openhands";

const URL_BASE_LIBRETRANSLATE = "http://127.0.0.1:5100";
const URL_BASE_STIRLING_PDF = "http://127.0.0.1:8180";
const URL_BASE_ARCHIVEBOX = "http://127.0.0.1:8001";
const URL_BASE_COMFYUI = "http://127.0.0.1:8188";
const URL_BASE_OPENHANDS = "http://127.0.0.1:8010";

const TIEMPO_LIBRETRANSLATE = 3;
const TIEMPO_STIRLING_PDF = 109;
const TIEMPO_ARCHIVEBOX = 76;
const TIEMPO_COMFYUI = 22;
const TIEMPO_OPENHANDS = 14;

/** Devuelve la URL por defecto del servicio cuando el OS corre en localhost
 *  o en la app nativa de la Mac. Si el servicio tiene su variable de entorno
 *  (p. ej. `LIBRETRANSLATE_URL`), la usa en lugar de la URL por defecto.
 *  En cualquier otro medio (e. g. producción, navegador https) devuelve `null`
 *  con su motivo en español. */
export function urlPorDefecto(
  servicio: ServicioA1,
  entorno: string
): string | null {
  const envVar = `${servicio.toUpperCase()}_URL`;
  const valorEntorno = process.env[envVar];
  if (valorEntorno) {
    return valorEntorno;
  }
  if (entorno === "localhost" || entorno === "mac-nativa") {
    switch (servicio) {
      case "libretranslate":
        return URL_BASE_LIBRETRANSLATE;
      case "stirling-pdf":
        return URL_BASE_STIRLING_PDF;
      case "archivebox":
        return URL_BASE_ARCHIVEBOX;
      case "comfyui":
        return URL_BASE_COMFYUI;
      case "openhands":
        return URL_BASE_OPENHANDS;
    }
  }
  return null;
}

/** Tiempo en segundos que puede tardar la primera llamada (arranque en frío)
 * para cada servicio, según se midió el 2026-10-20 en el A1. */
export function esperaFria(servicio: ServicioA1): number {
  switch (servicio) {
    case "libretranslate":
      return TIEMPO_LIBRETRANSLATE;
    case "stirling-pdf":
      return TIEMPO_STIRLING_PDF;
    case "archivebox":
      return TIEMPO_ARCHIVEBOX;
    case "comfyui":
      return TIEMPO_COMFYUI;
    case "openhands":
      return TIEMPO_OPENHANDS;
    default:
      return 0;
  }
}