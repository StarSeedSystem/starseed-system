/**
 * difusion — estilo de una capa de difuminado (Ola 1018F · FSH1018F · architecture/fondos-shaders.md §2).
 * PURO: de una `DifusionConfig` sale un objeto de estilo CSS; no toca red, DOM, GPU ni reloj. La textura es un
 * SVG de ruido con semilla fija (data URL): el mismo ajuste pinta siempre lo mismo y no pide nada a nadie.
 *
 * Modos: «transparente» deja pasar sin teñir ni difuminar (soporte de textura); «desenfoque» esmerila el fondo
 * sin tinte; «blanco», «negro» y «tono» tiñen con la opacidad pedida y, si hay `desenfoquePx`, además esmerilan.
 * La geometría no se impone: la textura es grano, papel o escarcha, y el velo deja leer el contenido.
 */
import type { CSSProperties } from "react";
import type { DifusionConfig, MascaraKind } from "./background-layers";

export type ModoDifusion = DifusionConfig["modo"];
export type TexturaDifusion = DifusionConfig["textura"];

/** Tope del desenfoque, en px: el mismo que valida `background-layers` (0-80). */
export const DESENFOQUE_MAX_PX = 80;

export const MODOS_DIFUSION: readonly ModoDifusion[] = [
  "transparente",
  "desenfoque",
  "blanco",
  "negro",
  "tono",
];

export const TEXTURAS_DIFUSION: readonly TexturaDifusion[] = ["ninguna", "grano", "papel", "escarcha"];

const clamp = (v: unknown, lo: number, hi: number, fb: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fb;
  return Math.min(hi, Math.max(lo, n));
};

/** Envuelve un SVG de 160 px en un `url(...)` con data URL: sin peticiones y con el mismo resultado siempre. */
const svg = (interior: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>${interior}</svg>`,
  )}")`;

const RUIDO: Record<Exclude<TexturaDifusion, "ninguna">, string> = {
  grano:
    "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='11' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='160' height='160' filter='url(#g)' opacity='0.55'/>",
  papel:
    "<filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.02 0.35' numOctaves='4' seed='23' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='160' height='160' filter='url(#p)' opacity='0.35'/>",
  escarcha:
    "<filter id='e'><feTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' seed='37' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/>" +
    "<feComponentTransfer><feFuncA type='discrete' tableValues='0 0 0 0 0.9'/></feComponentTransfer></filter>" +
    "<rect width='160' height='160' filter='url(#e)' opacity='0.6'/>",
};

/** data URL del ruido determinista de la textura (`undefined` en «ninguna» o en un valor desconocido). */
export function texturaSvg(textura: TexturaDifusion | undefined): string | undefined {
  const interior =
    textura === "grano" || textura === "papel" || textura === "escarcha" ? RUIDO[textura] : undefined;
  return interior ? svg(interior) : undefined;
}

/** Hex (#rgb o #rrggbb) a `rgba(...)` con la opacidad dada; un tono que no sea hex cae a blanco. */
export function colorConOpacidad(color: string | undefined, opacidad: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? "").trim());
  let n = 0xffffff;
  if (m) {
    const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
    n = Number.parseInt(h, 16);
  }
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacidad})`;
}

/** Estilo CSS del velo: tinte, textura y desenfoque del fondo, según el modo. */
export function estiloDifusion(d?: Partial<DifusionConfig>): CSSProperties {
  const modo: ModoDifusion = d?.modo && MODOS_DIFUSION.includes(d.modo) ? d.modo : "transparente";
  const px = clamp(d?.desenfoquePx, 0, DESENFOQUE_MAX_PX, 0);
  const opacidad = clamp(d?.opacidad, 0, 1, 1);
  const textura = texturaSvg(d?.textura);
  const estilo: CSSProperties = {};

  const tinte =
    modo === "blanco"
      ? colorConOpacidad("#ffffff", opacidad)
      : modo === "negro"
        ? colorConOpacidad("#000000", opacidad)
        : modo === "tono"
          ? colorConOpacidad(d?.tono, opacidad)
          : undefined;
  if (tinte) estilo.backgroundColor = tinte;
  if (textura) {
    estilo.backgroundImage = textura;
    estilo.backgroundSize = "160px 160px";
    estilo.backgroundRepeat = "repeat";
  }

  // «transparente» no esmerila a propósito: es el modo que deja pasar. Para vidrio, «desenfoque» o un tinte.
  if (modo !== "transparente" && px > 0) {
    const filtro = `blur(${px}px)`;
    estilo.backdropFilter = filtro;
    estilo.WebkitBackdropFilter = filtro;
  }
  return estilo;
}

const MASCARAS: Record<Exclude<MascaraKind, "ninguna">, string> = {
  radial: "radial-gradient(circle at 50% 50%, #000 0%, #000 55%, transparent 100%)",
  lineal: "linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)",
};

/** Máscara de la capa: recorta suave el borde radial o lineal; «ninguna» no añade ningún estilo. */
export function estiloMascara(mascara?: MascaraKind): CSSProperties {
  const gradiente = mascara === "radial" || mascara === "lineal" ? MASCARAS[mascara] : undefined;
  if (!gradiente) return {};
  return { maskImage: gradiente, WebkitMaskImage: gradiente };
}
