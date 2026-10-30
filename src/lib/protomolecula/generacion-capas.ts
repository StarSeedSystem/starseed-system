/**
 * Protomolécula · GENERACIÓN DE CAPAS (Ola 1010P · F7, esbozo).
 * Imagen generativa → una capa CANDIDATA `lienzo2d`. La persona la acepta o la descarta: este módulo NUNCA la
 * inserta en la molécula. El router de imágenes del OS (gratis primero) y el guardado en la Biblioteca entran
 * INYECTADOS, así que el módulo es puro y se prueba sin red. Audio, vídeo y 3D generativos NO están aquí.
 */
import type { GenerateImageOptions, MediaGenResult } from "@/ai/astraura/media/media-gen";
import type { Capa, ReferenciaEntidad } from "./tipos";

/** El router de imágenes del OS (`generateImage`, Pollinations gratis primero). */
export type GenerarImagenRouter = (opciones: GenerateImageOptions) => Promise<MediaGenResult>;

/** Guarda el medio como Entidad Única y devuelve su id (Biblioteca / media-library). */
export interface EntidadGenerada { id: string; version?: string; tipo?: string }
export type GuardarEntidadGenerada = (medio: {
  prompt: string; url: string; proveedor: string; titulo: string;
}) => Promise<EntidadGenerada | null>;

export interface DependenciasGeneracion {
  generarImagen?: GenerarImagenRouter;
  guardarEntidad?: GuardarEntidadGenerada;
  nuevoId?: () => string;
  ahora?: () => number;
  /** Posición de la capa candidata en el lienzo (la decide quien la ofrece). */
  orden?: number;
  ancho?: number;
  alto?: number;
}

/** La capa NO está en la molécula: es una propuesta que la persona acepta o descarta. */
export interface CapaCandidata {
  capa: Capa;
  referencia: ReferenciaEntidad;
  proveedor: string;
  prompt: string;
  candidata: true;
}

export type ResultadoPedirImagen =
  | { ok: true; candidata: CapaCandidata }
  | { ok: false; codigo: "vacia" | "sin-router" | "sin-guardado" | "sin-cupo" | "sin-medio" | "error"; motivo: string };

/** Medios que todavía no tienen un motor real: se dicen en la Biblioteca, no se finge que existen. */
export const PROXIMAMENTE_MEDIOS: Record<"audio" | "video" | "3d", string> = {
  audio: "próximamente: no hay un motor real de audio generativo conectado (Pollinations solo sintetiza voz).",
  video: "próximamente: no hay un motor gratis de vídeo conectado.",
  "3d": "próximamente: no hay un motor real de 3D generativo conectado.",
};

const tituloDe = (prompt: string): string => (prompt.length > 60 ? `${prompt.slice(0, 57).trimEnd()}…` : prompt);

function formatoDe(url: string): string {
  if (/^data:image\/svg\+xml/i.test(url) || /\.svg(?:[?#]|$)/i.test(url)) return "svg";
  if (/^data:image\/png/i.test(url) || /\.png(?:[?#]|$)/i.test(url)) return "png";
  return "imagen";
}

const esCupo = (texto: string): boolean => /(cupo|cuota|tope|l[ií]mite|limit|429|402)/i.test(texto);

const noDisponible = (texto: string): string => {
  const limpio = texto.trim();
  if (/^(pr[oó]ximamente|no disponible)\s*:/i.test(limpio)) return limpio;
  return `no disponible: ${limpio}`;
};

const idDeCapa = (deps: DependenciasGeneracion): string =>
  deps.nuevoId?.() ?? `capa-gen-${deps.ahora?.() ?? Date.now()}`;

/** Pide una imagen al router del OS y devuelve la capa CANDIDATA con referencia a la entidad generada. */
export async function pedirImagen(prompt: string, deps: DependenciasGeneracion): Promise<ResultadoPedirImagen> {
  const texto = typeof prompt === "string" ? prompt.trim() : "";
  if (!texto) return { ok: false, codigo: "vacia", motivo: "Escribe qué imagen quieres generar." };
  if (!deps.generarImagen) {
    return { ok: false, codigo: "sin-router", motivo: "próximamente: no hay un router de imágenes conectado; no se ha añadido nada." };
  }

  let medio: MediaGenResult;
  try {
    medio = await deps.generarImagen({
      prompt: texto,
      ...(deps.ancho ? { width: deps.ancho } : {}),
      ...(deps.alto ? { height: deps.alto } : {}),
    });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    return { ok: false, codigo: "error", motivo: noDisponible(detalle) };
  }

  if (!medio || !medio.ok || !medio.url) {
    const detalle = medio?.error?.trim() || "el router no devolvió ninguna imagen";
    return { ok: false, codigo: esCupo(detalle) ? "sin-cupo" : "sin-medio", motivo: noDisponible(detalle) };
  }

  if (!deps.guardarEntidad) {
    return { ok: false, codigo: "sin-guardado", motivo: "próximamente: la imagen se generó, pero aún no hay dónde guardarla como entidad; no se ha añadido nada." };
  }

  const titulo = tituloDe(texto);
  let entidad: EntidadGenerada | null;
  try {
    entidad = await deps.guardarEntidad({ prompt: texto, url: medio.url, proveedor: medio.provider, titulo });
  } catch {
    entidad = null;
  }
  if (!entidad?.id) {
    return { ok: false, codigo: "sin-guardado", motivo: "próximamente: la imagen se generó, pero la Biblioteca no pudo guardarla como entidad; no se ha añadido nada." };
  }

  const referencia: ReferenciaEntidad = { tipo: entidad.tipo ?? "imagen", id: entidad.id, ...(entidad.version ? { version: entidad.version } : {}) };
  const capa: Capa = { id: idDeCapa(deps), tipo: "lienzo2d", titulo, formato: formatoDe(medio.url), referencia, orden: deps.orden ?? 0, visible: true, bloqueada: false };
  return { ok: true, candidata: { capa, referencia, proveedor: medio.provider, prompt: texto, candidata: true } };
}
