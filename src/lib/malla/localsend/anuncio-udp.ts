/* anuncio-udp — el paquete de PRESENCIA del protocolo LocalSend v2 (Ola 1020U · LSD1020A).
 * Según el protocolo verificado el 2026-10-20 (github.com/localsend/protocol), cada aparato
 * anuncia su presencia por UDP al grupo de multidifusión 224.0.0.167, puerto 53317, con el
 * MISMO JSON del anuncio HTTP ({alias, version, deviceModel, deviceType, fingerprint, port,
 * protocol, download, announce}). Aquí solo se CONSTRUYE y se LEE el paquete (puro, sin
 * `node:*`, lo puede importar el cliente); quien lo envía y escucha por la red es la app
 * nativa o el servidor del OS (LSD1020B), que abre el socket con este paquete.
 */

import { GRUPO_MULTIDIFUSION, PUERTO_LOCALSEND, anuncioDesdeJson, type AnuncioLocalSend } from "./protocolo";

export interface PaquetePresencia {
  /** El grupo del propio protocolo, no inventado: 224.0.0.167 */
  grupo: typeof GRUPO_MULTIDIFUSION;
  /** El puerto UDP del propio protocolo: 53317 */
  puerto: typeof PUERTO_LOCALSEND;
  /** El cuerpo del paquete: el anuncio serializado (igual que el del HTTP). */
  json: string;
}

export function crearPaquetePresencia(anuncio: AnuncioLocalSend): PaquetePresencia {
  return { grupo: GRUPO_MULTIDIFUSION, puerto: PUERTO_LOCALSEND, json: JSON.stringify(anuncio) };
}

/** Lo que llega por UDP se valida igual que por HTTP: versión «2.0» y campos completos; mal formado → null. */
export function anuncioDePaquete(json: string): AnuncioLocalSend | null {
  return anuncioDesdeJson(json);
}
