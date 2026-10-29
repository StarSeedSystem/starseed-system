/**
 * difusion — estilo CSS de una capa de difuminado (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). PURO: no toca DOM, red ni GPU; solo traduce
 * `DifusionConfig` a un objeto de estilo. La textura es un SVG de ruido generado
 * aquí mismo como data URL determinista (sin recursos externos ni shaders.com).
 */

import type { CSSProperties } from "react";
import type { DifusionConfig } from "./background-layers";

export type ModoDifusion = DifusionConfig["modo"];
export type TexturaDifusion = DifusionConfig["textura"];

export const MODOS_DIFUSION: readonly ModoDifusion[] = ["transparente", "desenfoque", "blanco", "negro", "tono"];
export const TEXTURAS_DIFUSION: readonly TexturaDifusion[] = ["ninguna", "grano", "papel", "escarcha"];
export const DESENFOQUE_MAX_PX = 80;

const COLOR_SEGURO = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([0-9.,%\s/]+\)|var\(--[a-z0-9-]+\))$/i;

function limitar(valor: number | undefined, min: number, max: number, porDefecto: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return porDefecto;
  return Math.min(max, Math.max(min, valor));
}

function canalesHex(hex: string): [number, number, number] | null {
  const limpio = hex.trim().replace(/^#/, "");
  const corto = limpio.length === 3 || limpio.length === 4;
  if (!/^[0-9a-f]+$/i.test(limpio) || (corto ? limpio.length !== 3 && limpio.length !== 4 : limpio.length !== 6 && limpio.length !== 8)) return null;
  const parte = (i: number) => parseInt(corto ? limpio[i] + limpio[i] : limpio.slice(i * 2, i * 2 + 2), 16);
  return [parte(0), parte(1), parte(2)];
}

/** Tono + opacidad en una expresión CSS segura; un tono vacío o sospechoso cae a transparente. */
export function colorConOpacidad(tono: string | undefined, opacidad: number): string {
  const alfa = limitar(opacidad, 0, 1, 1);
  const color = (tono ?? "").trim();
  if (!color || !COLOR_SEGURO.test(color)) return "transparent";
  const canales = canalesHex(color);
  if (canales) return `rgba(${canales[0]}, ${canales[1]}, ${canales[2]}, ${alfa})`;
  return `color-mix(in srgb, ${color} ${Math.round(alfa * 100)}%, transparent)`;
}

type TexturaVisible = Exclude<TexturaDifusion, "ninguna">;

/** Ruido estático por textura: semilla fija, mismo SVG en cada llamada (sin `Date` ni `Math.random`). */
const RECETA_TEXTURA: Record<TexturaVisible, { filtro: string; alfa: number; tamanoPx: number }> = {
  grano: {
    filtro: "<feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/>",
    alfa: 0.32,
    tamanoPx: 120,
  },
  papel: {
    filtro: "<feTurbulence type='fractalNoise' baseFrequency='0.04 0.9' numOctaves='2' seed='13' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/>",
    alfa: 0.3,
    tamanoPx: 180,
  },
  escarcha: {
    filtro: "<feTurbulence type='fractalNoise' baseFrequency='0.16' numOctaves='4' seed='29' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/>",
    alfa: 0.42,
    tamanoPx: 160,
  },
};

export interface TexturaResuelta {
  /** Data URL del SVG de ruido; nunca una URL de red. */
  url: string;
  /** Lado del mosaico en píxeles. */
  tamanoPx: number;
}

/** Textura de ruido determinista, con su intensidad ya multiplicada por la opacidad de la capa. */
export function texturaDifusion(textura: TexturaDifusion, opacidad: number): TexturaResuelta | null {
  if (textura === "ninguna") return null;
  const receta = RECETA_TEXTURA[textura];
  const alfa = receta.alfa * limitar(opacidad, 0, 1, 1);
  const { tamanoPx } = receta;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tamanoPx}' height='${tamanoPx}' viewBox='0 0 ${tamanoPx} ${tamanoPx}'>`
    + `<filter id='d' x='0' y='0' width='100%' height='100%'>${receta.filtro}</filter>`
    + `<rect width='100%' height='100%' filter='url(#d)' opacity='${alfa.toFixed(3)}'/></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, tamanoPx };
}

/**
 * Estilo CSS de una capa `difusion`: fondo con tono y opacidad, desenfoque del fondo
 * (`backdrop-filter`) y textura de ruido opcional. La posición, la máscara y la
 * opacidad de la pila las pone el componente que la usa.
 */
export function estiloDifusion(d?: Partial<DifusionConfig>): CSSProperties {
  const modo: ModoDifusion = d?.modo && MODOS_DIFUSION.includes(d.modo) ? d.modo : "transparente";
  const textura: TexturaDifusion = d?.textura && TEXTURAS_DIFUSION.includes(d.textura) ? d.textura : "ninguna";
  const opacidad = limitar(d?.opacidad, 0, 1, 1);
  const desenfoque = Math.round(limitar(d?.desenfoquePx, 0, DESENFOQUE_MAX_PX, 0));
  const fondo = modo === "blanco" ? `rgba(255, 255, 255, ${opacidad})`
    : modo === "negro" ? `rgba(0, 0, 0, ${opacidad})`
      : modo === "tono" ? colorConOpacidad(d?.tono, opacidad)
        : "transparent";

  const estilo: CSSProperties = { backgroundColor: fondo, pointerEvents: "none" };
  if (modo === "desenfoque" && desenfoque > 0) {
    const blur = `blur(${desenfoque}px)`;
    estilo.backdropFilter = blur;
    estilo.WebkitBackdropFilter = blur;
  }
  const ruido = texturaDifusion(textura, opacidad);
  if (ruido) {
    estilo.backgroundImage = `url("${ruido.url}")`;
    estilo.backgroundSize = `${ruido.tamanoPx}px ${ruido.tamanoPx}px`;
    estilo.backgroundRepeat = "repeat";
  }
  return estilo;
}
