import type { NivelCalidad } from "./tipos";
import { PERFILES, type PerfilCalidad } from "./calidad-perfiles";

export interface PantallaParaResultado {
  anchoMetros: number;
  altoMetros: number;
  texturaAnchoPx: number;
  texturaAltoPx: number;
  usarRenderizado: boolean; // true si se debe usar vídeo pre-renderizado, false para vista en vivo
}

/**
 * Calcula el tamaño en metros de la pantalla de vídeo y la resolución de la textura
 * basada en la calidad XR y la distancia.
 * 
 * @param ancho - ancho deseado del vídeo en píxeles (resolución fuente)
 * @param alto - alto deseado del vídeo en píxeles (resolución fuente)
 * @param distanciaM - distancia desde el observador hasta la pantalla en metros
 * @param calidadXR - nivel de calidad actual (desde calidad.ts)
 * @returns objeto con tamaño en metros, resolución de textura y si usar vídeo renderizado
 */
export function pantallaPara({
  ancho,
  alto,
  distanciaM,
  calidadXR,
}: {
  ancho: number;
  alto: number;
  distanciaM: number;
  calidadXR: NivelCalidad;
}): PantallaParaResultado {
  // Campo de visión horizontal en grados (ángulo de visión cómodo)
  const HFOV_DEG = 30;
  const hfovRad = (HFOV_DEG * Math.PI) / 180;
  // Width in meters based on distance and horizontal FOV
  const anchoMetros = 2 * distanciaM * Math.tan(hfovRad / 2);
  // Alto en metros para preservar la proporción de aspecto
  const altoMetros = anchoMetros * (alto / ancho);

  // Obtener perfil de calidad
  const perfil: PerfilCalidad = PERFILES[calidadXR];
  const maxTextureSize = perfil.texturaMaxPx;

  // Limitar la resolución de la textura para no superar maxTextureSize, preservando la proporción
  let texturaAnchoPx = ancho;
  let texturaAltoPx = alto;
  if (ancho > maxTextureSize || alto > maxTextureSize) {
    const scale = Math.min(maxTextureSize / ancho, maxTextureSize / alto);
    texturaAnchoPx = Math.round(ancho * scale);
    texturaAltoPx = Math.round(alto * scale);
  }

  // Decidir si se debe usar vídeo pre-renderizado (true) o vista en vivo (false)
  // Suponemos que para los niveles de calidad media y superiores podemos usar vista en vivo
  // (porque podemos permitirnos renderizar el vídeo como textura en tiempo real)
  // Para cualidades inferiores, utilizamos vídeo pre-renderizado para ahorrar rendimiento.
  const usarRenderizado = 
    calidadXR === "minima" || 
    calidadXR === "baja";

  return {
    anchoMetros,
    altoMetros,
    texturaAnchoPx,
    texturaAltoPx,
    usarRenderizado,
  };
}