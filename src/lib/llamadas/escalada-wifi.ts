/**
 * llamadas/escalada-wifi — la llamada pide sola el Wi-Fi directo cuando solo hay Bluetooth (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. Lo que decide el motor de llamadas sin tocar la radio:
 *  · CUÁNDO pedir el enlace (`debeEscalar`): hay otra persona, el único camino hacia ella no lleva IP, y se quiere
 *    vídeo/pantalla o la voz por el enlace de datos va regular o mala.
 *  · QUÉ clase pedir (`claseEscalada`): «llamada» (cámara o voz) o «pantalla».
 *  · QUÉ pasos enseñar (`textoEscalada`): «Abriendo Wi-Fi directo…» → «Voz por Bluetooth · el video llegará al abrir
 *    el Wi-Fi P2P» → «Video por Wi-Fi P2P (sin router ni hotspot)».
 * El ajuste (Automático / Preguntar / Nunca) y la apertura real son de `enlace-wifi-motor` (WFD1108A/INT1108C):
 * aquí solo se llama a `avisarEnvioPesado`. Contrato: architecture/wifi-directo.md §9.
 */

/** `sin-p2p` (WFA1109A): entre estos dos aparatos no hay Wi‑Fi P2P sin hotspot (Mac ↔ Android sin el permiso del punto de acceso). */
export type PasoWifiLlamada = "inactivo" | "abriendo" | "propuesta" | "activo" | "no" | "sin-p2p";

export interface EstadoWifiLlamada {
  paso: PasoWifiLlamada;
  /** Aviso para la persona (en el Mac: «el Mac sale de tu Wi-Fi de casa mientras dure»). */
  aviso?: string | null;
}

export const TEXTO_ABRIENDO_WIFI = "Abriendo Wi‑Fi P2P…";
export const TEXTO_VOZ_BLE_ESPERANDO_WIFI = "Voz por Bluetooth · el video llegará al abrir el Wi‑Fi P2P";
export const TEXTO_VIDEO_WIFI_DIRECTO = "Video por Wi‑Fi P2P (sin router ni hotspot)";
/** (WFA1109A) Mac ↔ Android: no existe Wi‑Fi P2P común; la llamada se queda en Bluetooth y no pide nada de Wi‑Fi. */
export const TEXTO_VIDEO_LIGERO_SIN_P2P = "Video ligero por Bluetooth · entre estos aparatos no hay Wi‑Fi P2P sin hotspot";
export const TEXTO_VOZ_BLE_SIN_P2P = "Voz por Bluetooth · entre estos aparatos no hay Wi‑Fi P2P sin hotspot";
export const TEXTO_VIDEO_LIGERO_BLE = "Video ligero por Bluetooth (baja resolución)";
export const TEXTO_PROPUESTA_WIFI = "Acepta abrir el Wi‑Fi P2P para tener video completo";
export const TEXTO_WIFI_NUNCA = "Wi‑Fi P2P desactivado en los ajustes: el video va ligero por Bluetooth";
export const TEXTO_PANTALLA_BLE = "La pantalla no cabe por Bluetooth: se abrirá sola por Wi‑Fi P2P (sin router ni hotspot) si lo permites.";
export const TEXTO_PANTALLA_SIN_P2P = "La pantalla no cabe por Bluetooth y entre estos aparatos no hay Wi‑Fi P2P sin hotspot.";

export type ClaseEscalada = "llamada" | "pantalla";

export function claseEscalada(i: { pantalla: boolean }): ClaseEscalada {
  return i.pantalla ? "pantalla" : "llamada";
}

export interface EntradaEscalada {
  /** Alguien más contestó. */
  contestada: boolean;
  /** ¿Hay alguna ruta IP hacia ese par? (false: solo enlaces sin IP; null: no se sabe, no se escala). */
  hayRutaIp: boolean | null;
  camara: boolean;
  pantalla: boolean;
  /** La voz por enlace de datos está activa y su calidad. */
  vozDatosActiva: boolean;
  nivelVoz: "buena" | "regular" | "mala" | null;
}

/** ¿Hay que pedir el Wi-Fi directo ahora? */
export function debeEscalar(i: EntradaEscalada): boolean {
  if (!i.contestada || i.hayRutaIp !== false) return false;
  if (i.camara || i.pantalla) return true;
  return i.vozDatosActiva && (i.nivelVoz === "regular" || i.nivelVoz === "mala");
}

/** Lo mínimo de `InstantaneaWifi` que se necesita (para no importar el motor nativo desde aquí). */
export interface InstantaneaWifiMin {
  estado: { fase: string; otro: string | null };
  propuesta: { neurona: string } | null;
  pregunta: { otro: string } | null;
  avisoRadio: string | null;
  /** (WFA1109A) Neuronas con las que no cabe Wi‑Fi P2P sin hotspot. */
  sinP2p?: string[];
}

/** El paso del enlace Wi-Fi directo respecto a ESA neurona. */
export function pasoWifiDe(i: InstantaneaWifiMin | null | undefined, neurona: string | null | undefined, ajuste: string | null | undefined): EstadoWifiLlamada {
  if (!i || !neurona) return { paso: ajuste === "nunca" ? "no" : "inactivo" };
  const aviso = i.avisoRadio ?? null;
  if (i.estado.otro === neurona && i.estado.fase === "activo") return { paso: "activo", aviso };
  if (i.propuesta?.neurona === neurona || i.pregunta?.otro === neurona) return { paso: "propuesta", aviso };
  const abriendo = ["ofreciendo", "decidiendo", "abriendo-red", "esperando-red", "uniendo", "esperando-union"];
  if (i.estado.otro === neurona && abriendo.includes(i.estado.fase)) return { paso: "abriendo", aviso };
  if (i.sinP2p?.includes(neurona)) return { paso: "sin-p2p" };
  return { paso: ajuste === "nunca" ? "no" : "inactivo" };
}

export interface EntradaTexto {
  paso: PasoWifiLlamada;
  /** WebRTC ya conectó (el vídeo va por la red directa). */
  webrtcConectado: boolean;
  /** Se pidió cámara o pantalla. */
  videoPedido: boolean;
  /** El vídeo ligero por el enlace de datos está activo. */
  videoDatosActivo: boolean;
}

/** La línea de estado de la escalada, o null si no hay nada que contar. */
export function textoEscalada(i: EntradaTexto): string | null {
  if (i.webrtcConectado) return i.videoPedido && i.paso === "activo" ? TEXTO_VIDEO_WIFI_DIRECTO : null;
  if (i.paso === "abriendo") return TEXTO_ABRIENDO_WIFI;
  if (i.paso === "propuesta") return TEXTO_PROPUESTA_WIFI;
  if (!i.videoPedido) return null;
  if (i.paso === "sin-p2p") return i.videoDatosActivo ? TEXTO_VIDEO_LIGERO_SIN_P2P : TEXTO_VOZ_BLE_SIN_P2P;
  if (i.videoDatosActivo) return i.paso === "no" ? TEXTO_WIFI_NUNCA : TEXTO_VIDEO_LIGERO_BLE;
  return TEXTO_VOZ_BLE_ESPERANDO_WIFI;
}
