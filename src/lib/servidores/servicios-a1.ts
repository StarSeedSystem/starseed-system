/**
 * Servicios instalados el 2026-10-20 en el A1 (Oracle, capa siempre encendida) y
 * cómo se llega a ellos desde la Mac por el túnel `com.starseed.tunel-servicios-a1`
 * (solo 127.0.0.1). Fuente: architecture/repos-libreria-1020d.md §7, medido.
 * Puro: sin red ni `node:*`; lo no medido se dice como tal, nada inventado.
 * Las variables (`COMFYUI_URL`, `LIBRETRANSLATE_URL`, …) NO se leen aquí: entran
 * como parámetro (quien llama puede pasar `process.env`) y mandan si están.
 */

export type ServicioA1 =
  | "libretranslate" | "stirling-pdf" | "archivebox" | "comfyui" | "openhands-agent-server";

/** Medio donde corre el OS (§11 de CLAUDE.md): solo dos alcanzan 127.0.0.1. */
export type MedioOs = "localhost" | "app-nativa-mac" | "https" | "http-remoto" | "otros";

export interface FichaServicioA1 {
  id: ServicioA1; nombre: string; version: string; urlTunel: string; instalado: "2026-10-20";
  puertos: { a1: number; mac: number };
  ramMedida: string | null; memoriaParaEncender: string; arranqueFrioSeg: number | null;
  esperaFria: string; detalle: string;
}

export interface UrlServicio { url: string | null; motivo: string; fuente: "variable" | "tunel" | "medio" }

export const TUNEL_SERVICIOS_A1 = "com.starseed.tunel-servicios-a1";

export const VARIABLE_URL_POR_SERVICIO: Record<ServicioA1, string> = {
  libretranslate: "LIBRETRANSLATE_URL",
  "stirling-pdf": "STIRLING_PDF_URL",
  archivebox: "ARCHIVEBOX_URL",
  comfyui: "COMFYUI_URL",
  "openhands-agent-server": "OPENHANDS_AGENT_SERVER_URL",
};

export const SERVICIOS_A1: Record<ServicioA1, FichaServicioA1> = {
  libretranslate: {
    id: "libretranslate", nombre: "LibreTranslate", version: "1.9.6",
    urlTunel: "http://127.0.0.1:5100", puertos: { a1: 5000, mac: 5100 },
    ramMedida: "711 MiB", memoriaParaEncender: "1,5 GB", arranqueFrioSeg: null, instalado: "2026-10-20",
    esperaFria: "Arranque en frío sin medir; con el servicio ya arriba, traducir dos frases desde la Mac tardó 2,8 s (medido el 2026-10-20).",
    detalle: "Docker, bajo demanda; es, en, pt, fr, de e it. En el A1 vive en el 5000, pero en la Mac el 5000 es de AirPlay: el túnel lo trae al 5100.",
  },
  "stirling-pdf": {
    id: "stirling-pdf", nombre: "Stirling-PDF", version: "3.2.0",
    urlTunel: "http://127.0.0.1:8180", puertos: { a1: 8180, mac: 8180 },
    ramMedida: "1,4 GiB", memoriaParaEncender: "1,5 GB", arranqueFrioSeg: 109, instalado: "2026-10-20",
    esperaFria: "109 s de arranque en frío (medido): la primera llamada puede tardar más de minuto y medio, no lo des por caído antes.",
    detalle: "Docker, bajo demanda; 319 rutas; rotar un PDF de 2 páginas en 0,29 s.",
  },
  archivebox: {
    id: "archivebox", nombre: "ArchiveBox", version: "0.9.73",
    urlTunel: "http://127.0.0.1:8001", puertos: { a1: 8001, mac: 8001 },
    ramMedida: null, memoriaParaEncender: "1,2 GB", arranqueFrioSeg: null, instalado: "2026-10-20",
    esperaFria: "Arranque en frío sin medir; con el servicio ya arriba, archivar una página (PDF, captura, SingleFile y HTML) tardó 1 min 16 s (medido).",
    detalle: "Docker, bajo demanda; archive.org, índice público y medios apagados, para que nada privado salga.",
  },
  comfyui: {
    id: "comfyui", nombre: "ComfyUI", version: "0.42.1",
    urlTunel: "http://127.0.0.1:8188", puertos: { a1: 8188, mac: 8188 },
    ramMedida: "4,1 GB en uso", memoriaParaEncender: "4,5 GB", arranqueFrioSeg: 22, instalado: "2026-10-20",
    esperaFria: "22 s de arranque (medido) MÁS la carga del modelo SD 1.5 en fp32 (4,27 GB): no lo des por caído antes.",
    detalle: "CPU arm64 sin GPU, tope de 6 GB: una imagen de 512 px con 12 pasos tardó 713 s; solo cola sin prisa.",
  },
  "openhands-agent-server": {
    id: "openhands-agent-server", nombre: "OpenHands Agent Server", version: "1.7.1",
    urlTunel: "http://127.0.0.1:8010", puertos: { a1: 8010, mac: 8010 },
    ramMedida: "375 MiB en reposo", memoriaParaEncender: "2,5 GB", arranqueFrioSeg: 14, instalado: "2026-10-20",
    esperaFria: "14 s hasta estar sano (medido).",
    detalle: "Docker arm64, bajo demanda; 36 rutas (conversaciones, eventos, ejecutar, pausar, confirmación).",
  },
};

/** ¿Es un bucle local, inalcanzable para un medio que no corre en el aparato del túnel? */
function esLoopbackPrivada(url: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function medioAlcanzaLoopback(medio: MedioOs): boolean {
  return medio === "localhost" || medio === "app-nativa-mac";
}

function motivoDelMedio(medio: MedioOs, ficha: FichaServicioA1): string {
  if (medio === "https")
    return `Una página https no puede llamar a ${ficha.urlTunel}: el navegador bloquea el contenido mixto y la red privada. ${ficha.nombre}_URL solo sirve si apunta a una dirección pública o a una ruta propia del OS.`;
  if (medio === "http-remoto")
    return `El OS corre en http en otra máquina: allí 127.0.0.1 no es el A1, y el túnel ${TUNEL_SERVICIOS_A1} vive en la Mac.`;
  return "Medio sin identificar: no se sabe si 127.0.0.1 es alcanzable, así que no se promete la dirección.";
}

/** Cómo se llega a `servicio` desde este medio, con su motivo. La dirección SOLO */
/** sale en localhost o en la app nativa de la Mac (una página https no puede    */
/** llamar a 127.0.0.1); las variables mandan si existen. */
export function urlPorDefecto(
  servicio: ServicioA1,
  medio: MedioOs,
  variables: Record<string, string | undefined> = {},
): UrlServicio {
  const ficha = SERVICIOS_A1[servicio];
  const nombreVariable = VARIABLE_URL_POR_SERVICIO[servicio];
  const variable = (variables[nombreVariable] ?? "").trim();
  if (variable && medioAlcanzaLoopback(medio))
    return { url: variable, motivo: `${nombreVariable} manda`, fuente: "variable" };
  if (variable && !esLoopbackPrivada(variable))
    return { url: variable, motivo: `${nombreVariable} manda`, fuente: "variable" };
  if (variable)
    return { url: null, motivo: `${nombreVariable} apunta a ${variable}, un bucle que este medio no alcanza: se ignora. ${motivoDelMedio(medio, ficha)}`, fuente: "medio" };
  if (medioAlcanzaLoopback(medio))
    return { url: ficha.urlTunel, motivo: `Bajo demanda en el A1, traído a la Mac por el túnel ${TUNEL_SERVICIOS_A1} (solo 127.0.0.1).`, fuente: "tunel" };
  return { url: null, motivo: motivoDelMedio(medio, ficha), fuente: "medio" };
}

/** Cuánto puede tardar la PRIMERA llamada a `servicio`: quien espera, que no lo dé por caído antes. */
export function esperaFria(servicio: ServicioA1): { segundos: number | null; texto: string } {
  const ficha = SERVICIOS_A1[servicio];
  return { segundos: ficha.arranqueFrioSeg, texto: ficha.esperaFria };
}
