/**
 * difusion — CSS de una capa de DIFUMINADO (Ola 1018F · FSH1018F · fondos-shaders.md §2).
 * PURO: entrada → salida, sin red, sin disco, sin GPU. Vela, desenfoca o texturiza lo que
 * hay DEBAJO (el motor base, que sigue siendo la opción principal):
 *   · «transparente» → solo textura, si la hay · «desenfoque» → blur(Npx) + velo neutro suave
 *   · «blanco/negro» → velo con la opacidad de la capa · «tono» → cualquier color con color-mix
 * La textura es un SVG de ruido determinista (semillas fijas en `feTurbulence`): data URL
 * generada en el momento, sin pedir nada a la red, repetida en tesela. `capa-difusion.tsx`
 * la consume y añade por encima la transformación y la máscara de la capa.
 */
import type { CSSProperties } from "react";
import type { DifusionConfig, MascaraKind, Transform } from "./background-layers";

/** Valor máximo del desenfoque, en píxeles (mismo tope que `normalizeLayers`). */
export const MAX_DESENFOQUE_PX = 80;
/** Alfa del velo neutro en «desenfoque», escalado por la opacidad: sin velo, el contenido queda descolgado. */
export const VELO_DESENFOQUE = 0.12;

export type ModoDifusion = DifusionConfig["modo"];
export type TexturaDifusion = DifusionConfig["textura"];

/** Alfa útil (0–1); con 0 no hay velo que pintar. */
const alfaVelo = (d: DifusionConfig): number =>
  Math.min(1, Math.max(0, typeof d.opacidad === "number" && Number.isFinite(d.opacidad) ? d.opacidad : 1));

/** Color del velo (o `undefined`: nada que pintar). «blanco»/«negro» van en RGBA; «tono» usa
 * `color-mix` para admitir cualquier color CSS sano; «desenfoque» lleva un velo neutro suave. */
export function veloDifusion(d: DifusionConfig): string | undefined {
  const a = alfaVelo(d);
  if (a <= 0) return undefined;
  const matiz = d.modo === "tono" && typeof d.tono === "string" && d.tono.trim() !== "" ? d.tono.trim() : undefined;
  switch (d.modo) {
    case "blanco":
      return `rgba(255, 255, 255, ${a})`;
    case "negro":
      return `rgba(0, 0, 0, ${a})`;
    case "tono":
      return `color-mix(in srgb, ${matiz ?? "#ffffff"} ${Math.round(a * 100)}%, transparent)`;
    case "desenfoque":
      return `rgba(255, 255, 255, ${Number((a * VELO_DESENFOQUE).toFixed(3))})`;
    default:
      return undefined; // «transparente»: solo textura, si la hay
  }
}

interface TexturaSvg {
  semilla: number; // pluma fija de `feTurbulence`: semilla igual → ruido igual, siempre
  frecuencia: string; // frecuencias base x/y; bajas = grano grande, altas = grano fino
  octavas: number;
  alfa: number; // cuánta alfa del ruido pasa (0–1): la intensidad de la textura
  tesela: number; // px del azulejo que se repite (peldaños Fibonacci: 144, 233, 377)
}

// Valores armónicos fijos: semilla y tesela iguales en cada aparato y en cada carga.
const TEXTURAS_SVG: Record<Exclude<TexturaDifusion, "ninguna">, TexturaSvg> = {
  grano: { semilla: 7, frecuencia: "0.8", octavas: 2, alfa: 0.13, tesela: 144 }, // fino, casi invisible
  papel: { semilla: 31, frecuencia: "0.04 0.55", octavas: 3, alfa: 0.17, tesela: 233 }, // fibras alargadas
  escarcha: { semilla: 61, frecuencia: "0.35", octavas: 4, alfa: 0.21, tesela: 377 }, // cristalitos a media escala
};

/** SVG de ruido blanco sobre transparente con `feTurbulence` (semilla fija) y una matriz que lo
 * vuelve monocromo: mismo resultado en toda plataforma. Codificado entero para que los `#` y
 * las comillas del `url()` no rompan. */
function svgTextura(id: keyof typeof TEXTURAS_SVG): string {
  const { tesela, frecuencia, octavas, semilla, alfa } = TEXTURAS_SVG[id];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tesela}" height="${tesela}"><filter id="r" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frecuencia}" numOctaves="${octavas}" seed="${semilla}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${alfa} 0"/></filter><rect width="100%" height="100%" filter="url(#r)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** data URL de la textura (o `undefined` con «ninguna»). */
export function texturaDifusion(t: TexturaDifusion): string | undefined {
  return t === "ninguna" ? undefined : svgTextura(t);
}

// Estilo completo de la capa (lo consume `capa-difusion.tsx`): blur con `backdrop-filter`,
// velo con tono y opacidad, y textura en tesela. Sin `position` ni `opacity` de capa:
// eso los pone la transformación.
export function estiloDifusion(d: DifusionConfig): CSSProperties {
  const estilo: CSSProperties = {};
  const px = Math.min(MAX_DESENFOQUE_PX, Math.max(0, Number.isFinite(d.desenfoquePx) ? d.desenfoquePx : 0));
  if (d.modo === "desenfoque" && px > 0) {
    const filtro = `blur(${px}px)`;
    estilo.backdropFilter = filtro;
    estilo.WebkitBackdropFilter = filtro; // Safari: prefijo webkit heredado
  }
  const velo = veloDifusion(d);
  if (velo) estilo.backgroundColor = velo;
  const textura = texturaDifusion(d.textura);
  if (textura && d.textura !== "ninguna") {
    const t = TEXTURAS_SVG[d.textura];
    estilo.backgroundImage = `url("${textura}")`;
    estilo.backgroundSize = `${t.tesela}px ${t.tesela}px`;
  }
  return estilo;
}

/** Posición, tamaño, escala y rotación de la capa, todos relativos (0–1 salvo la rotación). */
export function estiloTransformDifusion(t: Transform): CSSProperties {
  return {
    left: `${t.x * 100}%`,
    top: `${t.y * 100}%`,
    width: `${t.ancho * 100}%`,
    height: `${t.alto * 100}%`,
    transform: `scale(${t.escala}) rotate(${t.rotacion}deg)`,
  };
}

/** Máscara de la capa (o `undefined` con «ninguna») para que se desvanezca en los bordes. */
export function mascaraDifusion(m: MascaraKind): Pick<CSSProperties, "WebkitMaskImage" | "maskImage"> | undefined {
  if (m === "radial") {
    const g = "radial-gradient(closest-side, black 55%, transparent 100%)";
    return { WebkitMaskImage: g, maskImage: g };
  }
  if (m === "lineal") {
    const g = "linear-gradient(180deg, black 40%, transparent 100%)";
    return { WebkitMaskImage: g, maskImage: g };
  }
  return undefined;
}
