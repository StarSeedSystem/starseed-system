/** difusion — capa de difuminado pura (FSH1018F · architecture/fondos-shaders.md §2):
 * desenfoque, tinte con opacidad y textura SVG determinista, sin DOM, red ni reloj. */
import type { CSSProperties } from "react";
import type { DifusionConfig, MascaraKind, Transform } from "./background-layers";

export type TexturaDifusion = DifusionConfig["textura"];
export const MAX_DESENFOQUE_PX = 80;

/** CSS más los dos nombres del filtro de fondo (estándar y WebKit). */
export interface EstiloDifusion extends CSSProperties {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
}

export function acotarDifusion(valor: unknown, lo: number, hi: number, porDefecto: number): number {
  const n = typeof valor === "number" && Number.isFinite(valor) ? valor : porDefecto;
  return Math.min(hi, Math.max(lo, n));
}

export function fondoDeDifusion(d: DifusionConfig): string {
  const opacidad = acotarDifusion(d.opacidad, 0, 1, 1);
  if (d.modo === "blanco") return `rgba(255, 255, 255, ${redondo(opacidad)})`;
  if (d.modo === "negro") return `rgba(0, 0, 0, ${redondo(opacidad)})`;
  if (d.modo === "tono") return conAlfa(d.tono ?? "#ffffff", opacidad);
  return "transparent";
}

export function filtroDeDifusion(d: DifusionConfig): string | undefined {
  if (d.modo !== "desenfoque") return undefined;
  const px = acotarDifusion(d.desenfoquePx, 0, MAX_DESENFOQUE_PX, 0);
  return px > 0 ? `blur(${redondo(px)}px)` : undefined;
}

export function texturaDeDifusion(textura: TexturaDifusion): string | undefined {
  switch (textura) {
    case "grano":
      return svg(ruido("grano", "0.9", 3, 7, 0.55));
    case "papel":
      return svg(ruido("papel", "0.04 0.28", 2, 11, 0.35));
    case "escarcha":
      return svg(ruido("escarcha", "0.55", 1, 23, 0.65));
    default:
      return undefined;
  }
}

export function estiloDifusion(d: DifusionConfig): EstiloDifusion {
  const filtro = filtroDeDifusion(d);
  const textura = texturaDeDifusion(d.textura);
  const estilo: EstiloDifusion = { backgroundColor: fondoDeDifusion(d) };
  if (filtro) {
    estilo.backdropFilter = filtro;
    estilo.WebkitBackdropFilter = filtro;
  }
  if (textura) {
    estilo.backgroundImage = textura;
    estilo.backgroundSize = "160px 160px";
    estilo.backgroundRepeat = "repeat";
  }
  return estilo;
}

export function estiloMascara(mascara: MascaraKind | undefined): CSSProperties {
  if (mascara === "radial") {
    const g = "radial-gradient(circle at center, #000 0%, #000 55%, transparent 100%)";
    return { maskImage: g, WebkitMaskImage: g };
  }
  if (mascara === "lineal") {
    const g = "linear-gradient(to bottom, #000 0%, transparent 100%)";
    return { maskImage: g, WebkitMaskImage: g };
  }
  return {};
}

export function estiloTransformacion(t: Transform | undefined): CSSProperties {
  const x = acotarDifusion(t?.x, 0, 1, 0);
  const y = acotarDifusion(t?.y, 0, 1, 0);
  const escala = acotarDifusion(t?.escala, 0, 1, 1);
  const rotacion = acotarDifusion(t?.rotacion, -360, 360, 0);
  const ancho = acotarDifusion(t?.ancho, 0, 1, 1);
  const alto = acotarDifusion(t?.alto, 0, 1, 1);
  return {
    position: "absolute",
    left: `${redondo(x * 100)}%`,
    top: `${redondo(y * 100)}%`,
    width: `${redondo(ancho * 100)}%`,
    height: `${redondo(alto * 100)}%`,
    transform: `scale(${redondo(escala)}) rotate(${redondo(rotacion)}deg)`,
    transformOrigin: "center",
  };
}

const redondo = (n: number): number => Math.round(n * 1000) / 1000;

function conAlfa(tono: string, alfa: number): string {
  const rgb = hexRgb(tono);
  if (!rgb) return `rgba(255, 255, 255, ${redondo(alfa)})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${redondo(rgb[3] * alfa)})`;
}

function hexRgb(tono: string): [number, number, number, number] | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(tono.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  const n = Number.parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

const svg = (cuerpo: string): string => `url("data:image/svg+xml,${encodeURIComponent(cuerpo)}")`;

function ruido(id: string, frecuencia: string, octavas: number, semilla: number, opacidad: number): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>`
    + `<filter id='${id}' x='0' y='0' width='100%' height='100%'>`
    + `<feTurbulence type='fractalNoise' baseFrequency='${frecuencia}' numOctaves='${octavas}' seed='${semilla}' stitchTiles='stitch'/>`
    + `<feColorMatrix type='saturate' values='0'/></filter>`
    + `<rect width='160' height='160' filter='url(#${id})' opacity='${opacidad}'/></svg>`;
}
