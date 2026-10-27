/**
 * difusion.ts — Lógica pura para la capa de difusión de fondos (Ola 1018F)
 * ============================================================================
 * Proporciona `estiloDifusion(d)` que convierte un objeto DifusionConfig
 * en estilos CSS puros (backdrop-filter blur, fondo con tono/opacidad y textura
 * como data URL SVG determinista). Sin red, sin disco, 100% puro.
 */

import type { DifusionConfig } from "./background-layers";

export function generarTexturaSvg(textura: DifusionConfig["textura"]): string {
  if (textura === "ninguna") return "";
  
  // Generación de patrones SVG deterministas para texturas de ruido, papel o escarcha
  let svgContent = "";
  if (textura === "grano") {
    svgContent = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#noiseFilter)" opacity="0.35"/></svg>`;
  } else if (textura === "papel") {
    svgContent = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="paperFilter"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0"/></filter><rect width="100%" height="100%" filter="url(#paperFilter)"/></svg>`;
  } else if (textura === "escarcha") {
    svgContent = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="frostFilter"><feTurbulence type="turbulence" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch"/><feSpecularLighting surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="#ffffff"><feDistantLight azimuth="45" elevation="60"/></feSpecularLighting></filter><rect width="100%" height="100%" filter="url(#frostFilter)" opacity="0.25"/></svg>`;
  }

  if (!svgContent) return "";
  const encoded = encodeURIComponent(svgContent);
  return `url("data:image/svg+xml;utf8,${encoded}")`;
}

export function estiloDifusion(d: DifusionConfig): Record<string, string> {
  const estilos: Record<string, string> = {};

  // Modo y color de fondo
  let backgroundColor = "transparent";
  if (d.modo === "blanco") {
    backgroundColor = `rgba(255, 255, 255, ${d.opacidad})`;
  } else if (d.modo === "negro") {
    backgroundColor = `rgba(0, 0, 0, ${d.opacidad})`;
  } else if (d.modo === "tono" && d.tono) {
    // Si es un hex o rgb, intentamos aplicarlo con opacidad
    backgroundColor = d.tono;
  } else if (d.modo === "transparente") {
    backgroundColor = "transparent";
  }

  if (backgroundColor) {
    estilos.backgroundColor = backgroundColor;
  }

  // Desenfoque (backdrop-filter)
  const filtros: string[] = [];
  if (d.desenfoquePx > 0) {
    filtros.push(`blur(${d.desenfoquePx}px)`);
  }
  
  if (filtros.length > 0) {
    estilos.backdropFilter = filtros.join(" ");
    estilos.WebkitBackdropFilter = filtros.join(" ");
  }

  // Textura
  const bgImage = generarTexturaSvg(d.textura);
  if (bgImage) {
    estilos.backgroundImage = bgImage;
    estilos.backgroundRepeat = "repeat";
  }

  return estilos;
}
