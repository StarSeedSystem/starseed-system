/**
 * Biblioteca · GUARDAR UNA IMAGEN GENERADA (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * En la tarjeta cada opción muestra licencia y atribución, y «Guardar en la Biblioteca» las deja
 * VISIBLES también allí: el campo `origin` de la Biblioteca lleva modelo, licencia y atribución.
 * Delega en `library-store.saveResource` (que deduplica por título+url: guardar lo mismo dos veces
 * no duplica). Sin url honestamente no se guarda: la imagen (o su referencia) hace falta. PURO en
 * su builder; la escritura real solo en navegador y delegada.
 */
import { saveResource } from "@/lib/library-store";
import type { ModeloImagen } from "@/lib/imagenes/modelos";

export interface ImagenAGuardar {
  /** URL de la imagen ya generada; si falta, no se pide guardar. */
  url?: string;
  titulo?: string;
  /** Modelo del catálogo de imágenes (nulo en la capa web gratis). */
  modelo?: ModeloImagen | null;
  /** Palabras de la persona, para el título por defecto. */
  prompt?: string;
}

export interface FichaGuardada {
  kind: "image";
  title: string;
  url?: string;
  origin: string;
}

/** Coerción amable a texto (nunca lanza). */
function texto(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Ficha de Biblioteca con licencia y atribución legibles. De NADA depende del navegador. PURO. */
export function fichaImagen(im: ImagenAGuardar): FichaGuardada {
  const nombre = im.modelo?.nombre ?? "Web gratis (Pollinations)";
  const licencia = im.modelo?.licencia ?? "Servicio gratuito atribuido (Pollinations)";
  const prompt = texto(im.prompt);
  const tituloBase = texto(im.titulo) || (prompt ? `Imagen: ${prompt.slice(0, 60)}` : nombre);
  const origen = `Imagen generada con ${nombre} · Licencia: ${licencia}`;
  const ficha: FichaGuardada = { kind: "image", title: tituloBase.slice(0, 200), origin: origen };
  if (texto(im.url)) ficha.url = texto(im.url);
  return ficha;
}

/** Guarda la imagen en la Biblioteca de este aparato. Nunca lanza. */
export function guardarImagenEnBiblioteca(im: ImagenAGuardar): { ok: boolean; mensaje: string; ficha?: FichaGuardada } {
  if (!texto(im.url)) {
    return {
      ok: false,
      mensaje: "Esta opción todavía no tiene imagen: elígela para generarla y guárdala después.",
    };
  }
  try {
    if (typeof window === "undefined") {
      return { ok: false, mensaje: "La Biblioteca se escribe desde el navegador." };
    }
    const ficha = fichaImagen(im);
    saveResource(ficha);
    return { ok: true, mensaje: `Guardé «${ficha.title}» en tu Biblioteca.`, ficha };
  } catch {
    return { ok: false, mensaje: "No pude escribir en la Biblioteca de este aparato." };
  }
}
