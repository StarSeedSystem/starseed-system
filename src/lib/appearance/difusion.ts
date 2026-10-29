/**
 * difusion — estilo PURO de una capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). No toca DOM, red ni GPU: recibe la config y devuelve el
 * objeto de estilo CSS que aplica `capa-difusion.tsx`.
 *
 *  - `transparente`: solo textura (si la hay); deja ver el motor base.
 *  - `desenfoque`: `backdrop-filter: blur(Npx)` sobre lo que queda debajo.
 *  - `blanco` / `negro` / `tono`: velo de color con la opacidad elegida.
 *  - textura: grano, papel o escarcha como SVG de ruido DETERMINISTA en data URL (misma semilla,
 *    mismo dibujo; nunca se pide nada a la red).
 */
import type { DifusionConfig } from "./background-layers";

export type ModoDifusion = DifusionConfig["modo"];
export type TexturaDifusion = DifusionConfig["textura"];

export interface EstiloDifusion {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundRepeat?: string;
  backgroundSize?: string;
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
  pointerEvents: "none";
}

/** Desenfoque cuando el modo es `desenfoque` y no se ha elegido un valor (0 = sin elegir). */
export const DESENFOQUE_POR_DEFECTO = 12;
export const MAX_DESENFOQUE_PX = 80;

const MODOS: readonly ModoDifusion[] = ["transparente", "desenfoque", "blanco", "negro", "tono"];

const acotar = (v: unknown, lo: number, hi: number, fb: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;

const alfa = (a: number): string => String(Math.round(a * 1000) / 1000);

/** Color CSS con alfa: hex → `rgba()`; cualquier otro color → `color-mix()` sobre transparente. */
export function colorConAlfa(color: string | undefined, opacidad: number): string {
  const a = acotar(opacidad, 0, 1, 1);
  const c = (color ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    const h = hex[1];
    const ancho = h.length <= 4 ? 1 : 2;
    const canal = (i: number) => parseInt(ancho === 1 ? h[i] + h[i] : h.slice(i * ancho, i * ancho + ancho), 16);
    const alfaHex = h.length === 4 || h.length === 8 ? canal(3) / 255 : 1;
    return `rgba(${canal(0)}, ${canal(1)}, ${canal(2)}, ${alfa(a * alfaHex)})`;
  }
  return c
    ? `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`
    : `rgba(255, 255, 255, ${alfa(a)})`;
}

interface RecetaTextura {
  frecuencia: number;
  octavas: number;
  semilla: number;
  opacidad: number;
}

const RECETAS: Record<Exclude<TexturaDifusion, "ninguna">, RecetaTextura> = {
  grano: { frecuencia: 0.9, octavas: 2, semilla: 7, opacidad: 0.35 },
  papel: { frecuencia: 0.35, octavas: 3, semilla: 13, opacidad: 0.28 },
  escarcha: { frecuencia: 1.6, octavas: 1, semilla: 29, opacidad: 0.42 },
};

/** SVG de ruido determinista (misma semilla → mismo dibujo) en data URL; `undefined` para `ninguna`. */
export function texturaDifusion(textura: TexturaDifusion | undefined): string | undefined {
  const r = textura && textura !== "ninguna" ? RECETAS[textura] : undefined;
  if (!r) return undefined;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>" +
    "<filter id='n' x='0' y='0' width='100%' height='100%'>" +
    `<feTurbulence type='fractalNoise' baseFrequency='${r.frecuencia}' numOctaves='${r.octavas}' ` +
    `seed='${r.semilla}' stitchTiles='stitch'/>` +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    `<rect width='160' height='160' filter='url(#n)' opacity='${r.opacidad}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Estilo CSS de la capa. Los valores fuera de rango caen a un defecto sensato, nunca lanzan. */
export function estiloDifusion(d: DifusionConfig | undefined): EstiloDifusion {
  const modo: ModoDifusion = d && MODOS.includes(d.modo) ? d.modo : "transparente";
  const opacidad = acotar(d?.opacidad, 0, 1, 1);
  const textura = texturaDifusion(d?.textura);
  const estilo: EstiloDifusion = { pointerEvents: "none" };

  if (textura) {
    estilo.backgroundImage = textura;
    estilo.backgroundRepeat = "repeat";
    estilo.backgroundSize = "160px 160px";
  }

  if (modo === "desenfoque") {
    const px = acotar(d?.desenfoquePx, 0, MAX_DESENFOQUE_PX, 0) || DESENFOQUE_POR_DEFECTO;
    estilo.backdropFilter = `blur(${px}px)`;
    estilo.WebkitBackdropFilter = `blur(${px}px)`;
  } else if (modo === "blanco") {
    estilo.backgroundColor = colorConAlfa("#ffffff", opacidad);
  } else if (modo === "negro") {
    estilo.backgroundColor = colorConAlfa("#000000", opacidad);
  } else if (modo === "tono") {
    estilo.backgroundColor = colorConAlfa(d?.tono || "#ffffff", opacidad);
  }

  return estilo;
}
