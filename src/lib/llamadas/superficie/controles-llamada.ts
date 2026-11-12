/**
 * Lógica pura para los controles de la superficie de llamada (LLA1112B).
 * Extraída del componente para poder testearla sin React ni DOM.
 */
import type { VistaLlamada } from "./vista";

/**
 * ¿El botón de cámara debe estar deshabilitado?
 * Se deshabilita SOLO cuando la cámara está APAGADA y hay un motivo real que impide encenderla.
 * Cuando la cámara está ENCENDIDA, el botón siempre permite apagarla (no hay motivo que lo impida).
 */
export function botonCamaraDeshabilitado(camaraEncendida: boolean, motivoCamara: string | undefined): boolean {
  return !camaraEncendida && !!motivoCamara;
}

/**
 * ¿Hay una cámara local encendida que NO está enviando imagen?
 * Esto pasa cuando la pista de vídeo existe pero está "muted" (p. ej. WebRTC por Bluetooth sin ruta).
 */
export function camaraLocalSinImagen(
  viva: boolean,
  camaraEncendida: boolean,
  streamLocal: MediaStream | null,
  streamTraeVideoFn: (s: MediaStream | null | undefined) => boolean
): boolean {
  if (!viva) return false;
  if (!camaraEncendida) return false;
  if (!streamLocal) return false;
  return !streamTraeVideoFn(streamLocal);
}

/**
 * Padding inferior para el footer de controles, considerando la altura del dock.
 * El dock define `--dock-height` (fallback 80px). En móvil, el dock tapa la zona inferior.
 */
export const PADDING_FOOTER_DOCK = "max(0.75rem, env(safe-area-inset-bottom), var(--dock-height, 80px))";