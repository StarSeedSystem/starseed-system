/**
 * Protomolécula · GENERACIÓN DE CAPAS (Ola 1010P · PM1010F7B).
 * Contrato: `architecture/protomolecula.md` §10 (F7) y `architecture/generacion-audiovisual-astraura.md`.
 *
 * Pide una imagen al router del OS (gratis primero) y la devuelve como CAPA CANDIDATA
 * `lienzo2d` que cita la entidad guardada. NUNCA la inserta en la molécula: la persona
 * la acepta o la descarta. Si no hay medio o cupo, se dice tal como lo diga el router.
 * Módulo PURO: el router y la Biblioteca entran INYECTADOS; sin React, red ni `node:*`.
 */
import type { Capa, ReferenciaEntidad } from "./tipos";

/** Forma mínima de `MediaGenResult` de `media-gen.ts`. // provisional: no importa el motor. */
export interface ResultadoImagen {
  ok: boolean;
  url?: string;
  provider?: string;
  error?: string;
}

/** Guarda el medio como Entidad Única (Biblioteca) y devuelve su referencia. */
export type GuardarEntidadImagen = (
  resultado: ResultadoImagen,
  prompt: string,
) => Promise<ReferenciaEntidad | null>;

export interface DependenciasGeneracion {
  /** Router de imágenes del OS, gratis primero (`generateImage` de `media-gen.ts`). */
  generarImagen: (prompt: string) => Promise<ResultadoImagen>;
  /** Persiste el medio y devuelve la referencia que la capa citará. */
  guardarEntidad: GuardarEntidadImagen;
  /** Id de la capa candidata (inyectable para pruebas). */
  nuevoId?: () => string;
  ahora?: () => number;
}

export type ResultadoPedirImagen =
  | { ok: true; candidata: Capa; proveedor?: string; aviso: string }
  | { ok: false; motivo: string };

const noDisponible = (motivo: string): ResultadoPedirImagen => ({
  ok: false,
  motivo: `próximamente/no disponible: ${motivo.trim() || "el generador de imágenes no respondió"}`,
});

const recortar = (texto: string, max: number): string =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

/** Id estable y sin azar: el reloj y un resumen del prompt (inyectables en pruebas). */
function idDe(prompt: string, ahora: number): string {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
  return `capa-img-${ahora.toString(36)}-${Math.abs(h).toString(36).slice(0, 6)}`;
}

function referenciaValida(r: ReferenciaEntidad | null): r is ReferenciaEntidad {
  return !!r && typeof r.tipo === "string" && r.tipo.trim() !== "" && typeof r.id === "string" && r.id.trim() !== "";
}

/** Formato de la referencia a partir de la URL; Pollinations no trae extensión y sirve PNG. */
function formatoDe(url: string): string {
  const m = /\.(png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

/**
 * Router de imágenes → capa CANDIDATA `lienzo2d` con `referencia` a la entidad generada.
 * No toca ninguna molécula. Audio y 3D generativos NO pasan por aquí (siguen «próximamente»).
 */
export async function pedirImagen(
  prompt: string,
  deps: DependenciasGeneracion,
): Promise<ResultadoPedirImagen> {
  const limpio = typeof prompt === "string" ? prompt.trim() : "";
  if (!limpio) return { ok: false, motivo: "Escribe qué imagen quieres generar." };

  let imagen: ResultadoImagen;
  try {
    imagen = await deps.generarImagen(limpio);
  } catch (e) {
    return noDisponible(e instanceof Error ? e.message : "el router de imágenes falló");
  }
  if (!imagen?.ok) return noDisponible(imagen?.error ?? "el router de imágenes no respondió");
  if (!imagen.url) return noDisponible("el router no devolvió ninguna imagen");

  let referencia: ReferenciaEntidad | null;
  try {
    referencia = await deps.guardarEntidad(imagen, limpio);
  } catch {
    referencia = null;
  }
  if (!referenciaValida(referencia)) {
    return noDisponible("la imagen se generó pero no se pudo guardar como entidad de la Biblioteca");
  }

  const ahora = deps.ahora?.() ?? Date.now();
  const candidata: Capa = {
    id: deps.nuevoId?.() ?? idDe(limpio, ahora),
    tipo: "lienzo2d",
    titulo: `Imagen: ${recortar(limpio, 60)}`,
    formato: formatoDe(imagen.url),
    referencia,
    orden: 0,
    visible: true,
    bloqueada: false,
  };
  return {
    ok: true,
    candidata,
    ...(imagen.provider ? { proveedor: imagen.provider } : {}),
    aviso: "Imagen candidata: acéptala o descártala; todavía no se ha insertado en la molécula.",
  };
}
