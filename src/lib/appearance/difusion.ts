/**
 * difusion — capa de DIFUMINADO de la pila de fondos (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). PURO: convierte la configuración guardada en
 * un objeto de estilo CSS; no toca DOM, red ni GPU. La textura es un SVG de ruido
 * determinista (misma entrada → mismos bytes), así que no pide nada a la red.
 *
 * Modos: «transparente» (solo el desenfoque pedido), «desenfoque» (cristal esmerilado
 * con un mínimo legible), «blanco», «negro» y «tono» (el color elegido). La opacidad
 * se aplica al conjunto; la capa de fuera conserva la suya.
 */
import type { DifusionConfig, MascaraKind, Transform } from "./background-layers";

export type ModoDifusion = DifusionConfig["modo"];
export type TexturaDifusion = DifusionConfig["textura"];

export const DESENFOQUE_MAX = 80;
export const DESENFOQUE_MINIMO = 12;
export const TONO_DEFECTO = "#ffffff";
export const LADO_TEXTURA = 180;

export interface EstiloDifusion {
  backdropFilter?: string; WebkitBackdropFilter?: string; backgroundColor?: string;
  backgroundImage?: string; backgroundSize?: string; backgroundRepeat?: "repeat";
  backgroundBlendMode?: "normal" | "overlay" | "soft-light" | "screen"; opacity?: number;
}

export interface EstiloCapa {
  left?: string; top?: string; width?: string; height?: string; transform?: string;
  transformOrigin?: string; maskImage?: string; WebkitMaskImage?: string;
}

export interface RecetaTextura {
  frecuencias: string; octavas: number; semilla: number;
  opacidad: number; mezcla: EstiloDifusion["backgroundBlendMode"];
}

const RECETAS: Record<Exclude<TexturaDifusion, "ninguna">, RecetaTextura> = {
  grano: { frecuencias: "0.9", octavas: 3, semilla: 7, opacidad: 0.42, mezcla: "overlay" },
  papel: { frecuencias: "0.035 0.42", octavas: 4, semilla: 23, opacidad: 0.3, mezcla: "soft-light" },
  escarcha: { frecuencias: "0.16", octavas: 5, semilla: 41, opacidad: 0.4, mezcla: "screen" },
};

/** La receta de una textura (o nada si es «ninguna», desconocida o manipulada). */
export function recetaTextura(textura: unknown): RecetaTextura | undefined {
  if (typeof textura !== "string" || textura === "ninguna") return undefined;
  return (RECETAS as Record<string, RecetaTextura>)[textura];
}

/**
 * Data URL de un ruido SVG determinista: mismos parámetros, mismos bytes y ninguna
 * petición de red. `seed` fija el patrón; `stitchTiles` permite repetirlo sin costura.
 */
export function texturaDifusion(textura: unknown): string | undefined {
  const r = recetaTextura(textura);
  if (!r) return undefined;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO_TEXTURA}" height="${LADO_TEXTURA}" viewBox="0 0 ${LADO_TEXTURA} ${LADO_TEXTURA}">` +
    `<filter id="ruido" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${r.frecuencias}" numOctaves="${r.octavas}" seed="${r.semilla}" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="${LADO_TEXTURA}" height="${LADO_TEXTURA}" filter="url(#ruido)" opacity="${r.opacidad}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const acotar = (v: unknown, min: number, max: number, porDefecto: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : porDefecto;
const MASCARAS: Record<Exclude<MascaraKind, "ninguna">, string> = {
  radial: "radial-gradient(ellipse at center, #000 35%, transparent 100%)",
  lineal: "linear-gradient(to bottom, #000 0%, transparent 100%)",
};

/** Solo un color CSS de verdad: sin `url()`, `image-set()` ni nada que pida red o inyecte reglas. */
export function tonoSeguro(tono: unknown): string {
  if (typeof tono !== "string") return TONO_DEFECTO;
  const s = tono.trim();
  const permitido = /^[#a-z0-9%(),.\s/+-]*$/i.test(s) && !/url\(|image-set/i.test(s);
  return s.length > 0 && s.length <= 120 && permitido ? s : TONO_DEFECTO;
}

/** Convierte la config de difusión en el estilo CSS de la capa (sin DOM ni efectos). */
export function estiloDifusion(d: DifusionConfig): EstiloDifusion {
  const modo: ModoDifusion = ["transparente", "desenfoque", "blanco", "negro", "tono"].includes(String(d?.modo))
    ? d.modo
    : "transparente";
  const pedido = Math.round(acotar(d?.desenfoquePx, 0, DESENFOQUE_MAX, 0));
  const desenfoque = modo === "desenfoque" ? Math.max(DESENFOQUE_MINIMO, pedido) : pedido;
  const opacidad = acotar(d?.opacidad, 0, 1, 1);
  const velo = modo === "blanco" ? "#ffffff" : modo === "negro" ? "#000000" : modo === "tono" ? tonoSeguro(d?.tono) : undefined;
  const receta = recetaTextura(d?.textura);
  const estilo: EstiloDifusion = { backgroundColor: velo ?? "transparent", opacity: opacidad };
  if (desenfoque > 0) {
    const filtro = `blur(${desenfoque}px)`;
    estilo.backdropFilter = filtro;
    estilo.WebkitBackdropFilter = filtro;
  }
  if (receta) {
    estilo.backgroundImage = `url("${texturaDifusion(d.textura)}")`;
    estilo.backgroundSize = `${LADO_TEXTURA}px ${LADO_TEXTURA}px`;
    estilo.backgroundRepeat = "repeat";
    estilo.backgroundBlendMode = receta.mezcla;
  }
  return estilo;
}

/** Posición, tamaño, escala, rotación y máscara de una capa (relativas al contenedor). */
export function estiloCapa(t?: Transform, m?: MascaraKind): EstiloCapa {
  const pct = (n: number): string => `${Math.round(n * 1000) / 10}%`;
  const x = acotar(t?.x, 0, 1, 0), y = acotar(t?.y, 0, 1, 0);
  const escala = acotar(t?.escala, 0.05, 4, 1), rotacion = acotar(t?.rotacion, -360, 360, 0);
  const ancho = acotar(t?.ancho, 0.05, 1, 1), alto = acotar(t?.alto, 0.05, 1, 1);
  const estilo: EstiloCapa = { left: "0%", top: "0%", width: pct(ancho), height: pct(alto),
    transform: `translate(${pct(x)}, ${pct(y)}) scale(${escala}) rotate(${rotacion}deg)`, transformOrigin: "center" };
  const mascara = m && m !== "ninguna" ? MASCARAS[m] : undefined;
  if (mascara) { estilo.maskImage = mascara; estilo.WebkitMaskImage = mascara; }
  return estilo;
}
