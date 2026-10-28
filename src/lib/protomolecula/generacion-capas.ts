/**
 * Protomolécula · GENERACIÓN DE CAPAS (F7, esbozo). Módulo PURO: sin React, sin red, sin `node:*`.
 * Una imagen generada NUNCA se inserta sola: vuelve como capa CANDIDATA `lienzo2d` que cita la Entidad
 * Única creada, y la persona la acepta o descarta. El router (`media-gen.ts`, gratis primero) entra
 * INYECTADO con su veredicto tal cual: sin cupo o sin medio → «No disponible: <motivo>», sin fingir.
 * Audio y 3D generativos no están aquí: en la Biblioteca quedan «próximamente» hasta haber medio real.
 */
import type { Capa, ReferenciaEntidad } from "./tipos";

export type FormatoImagen = "1:1" | "4:5" | "9:16" | "16:9";

/** Lo que devuelve el router de imágenes del OS; `provider` dice quién respondió de verdad. */
export interface ResultadoRouterImagen {
  ok: boolean;
  url?: string;
  provider?: string;
  error?: string;
  /** Entidad ya registrada en la Biblioteca, si el router la devuelve. */
  entidad?: ReferenciaEntidad;
}

export interface PeticionImagenGenerada {
  prompt: string;
  formato?: FormatoImagen;
}

export interface DependenciasGeneracion {
  /** Router de imágenes del OS, inyectado: este módulo no hace red ni toca el navegador. */
  generar?: (peticion: PeticionImagenGenerada) => Promise<ResultadoRouterImagen>;
  /** Guarda la imagen como Entidad Única y devuelve su referencia (la capa cita, no copia). */
  registrarEntidad?: (entrada: { url: string; proveedor: string; prompt: string }) => ReferenciaEntidad | null;
  /** Id único para la capa candidata (inyectado; por defecto «capa-imagen»). */
  nuevoId?: () => string;
  /** Posición de la capa candidata dentro de la molécula (0 si no llega). */
  orden?: number;
  /** Proporción pedida al router (opcional). */
  formato?: FormatoImagen;
}

export type ResultadoCapaGenerada =
  | { ok: true; candidata: true; capa: Capa; proveedor: string; aviso?: string }
  | { ok: false; motivo: string };

export type MedioGenerativo = "imagen" | "audio" | "video" | "3d";

/** Medios que sí tienen un motor real hoy. El resto se declara, no se inventa. */
export const PROXIMAMENTE_MEDIO: Record<Exclude<MedioGenerativo, "imagen">, string> = {
  audio: "próximamente: la generación de música y efectos todavía no tiene un medio real; solo hay voz sintetizada en la Biblioteca.",
  video: "próximamente: no hay un motor de vídeo gratuito integrado; solo funcionaría con un servicio propio conectado.",
  "3d": "próximamente: la generación de 3D no tiene todavía un medio real; el catálogo solo puede abrir modelos existentes.",
};

/** ¿Se puede generar este medio hoy? Imagen sí; audio, vídeo y 3D se dicen «próximamente». */
export function medioGenerativoDisponible(
  medio: MedioGenerativo,
): { ok: true } | { ok: false; motivo: string } {
  return medio === "imagen" ? { ok: true } : { ok: false, motivo: PROXIMAMENTE_MEDIO[medio] };
}

const sinEspacios = (s: string): string => s.replace(/\s+/g, " ").trim();
const noDisponible = (motivo: string): ResultadoCapaGenerada => ({ ok: false, motivo: `No disponible: ${sinEspacios(motivo) || "el router no dio un motivo."}` });
const tituloDe = (prompt: string): string => {
  const t = sinEspacios(prompt);
  return `Imagen: ${t.length > 70 ? `${t.slice(0, 69)}…` : t}`;
};

/**
 * Pide una imagen al router inyectado y la devuelve como capa CANDIDATA `lienzo2d`, con referencia a
 * la entidad generada. No la inserta en ninguna molécula: eso lo decide la persona. Nunca lanza.
 */
export async function pedirImagen(
  prompt: string,
  deps: DependenciasGeneracion = {},
): Promise<ResultadoCapaGenerada> {
  const limpio = sinEspacios(typeof prompt === "string" ? prompt : "").slice(0, 400);
  if (!limpio) return { ok: false, motivo: "Describe qué imagen quieres generar." };
  if (!deps.generar) return noDisponible("no hay router de imágenes conectado.");

  let r: ResultadoRouterImagen;
  try {
    r = await deps.generar({ prompt: limpio, ...(deps.formato ? { formato: deps.formato } : {}) });
  } catch (e) {
    return noDisponible(e instanceof Error ? e.message : String(e));
  }
  if (!r || typeof r !== "object" || r.ok !== true) {
    const error = r && typeof r.error === "string" ? r.error : "";
    return noDisponible(error || "el router no pudo generar la imagen.");
  }
  if (typeof r.url !== "string" || !r.url.trim()) {
    return noDisponible("el router no devolvió una imagen utilizable.");
  }

  const url = r.url.trim();
  const proveedor = typeof r.provider === "string" && r.provider.trim() ? r.provider.trim() : "desconocido";
  let referencia: ReferenciaEntidad | null = r.entidad ?? null;
  if (!referencia && deps.registrarEntidad) {
    try {
      referencia = deps.registrarEntidad({ url, proveedor, prompt: limpio }) ?? null;
    } catch {
      referencia = null;
    }
  }
  const orden = typeof deps.orden === "number" && Number.isFinite(deps.orden) ? deps.orden : 0;
  const capa: Capa = {
    id: deps.nuevoId?.() ?? "capa-imagen", tipo: "lienzo2d", titulo: tituloDe(limpio),
    formato: "png", referencia, orden,
    visible: true, bloqueada: false,
  };
  return {
    ok: true,
    candidata: true,
    capa,
    proveedor,
    ...(referencia
      ? {}
      : { aviso: "La imagen no quedó registrada como entidad: la capa se ofrece como contenido propio." }),
  };
}
