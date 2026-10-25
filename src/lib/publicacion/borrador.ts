/**
 * Publicación · BORRADOR DESDE UNA IMAGEN GENERADA (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * La tarjeta ofrece «borrador de publicación»: abre el Composer de Publicar (la misma página que
 * ya usa el OS, `/publicar?intent=…`) con el texto de la imagen — su planteamiento (prompt), el
 * modelo con el que se hizo, su licencia y su atribución — y emite `starseed:publicar-draft` con
 * el texto completo (el evento que el composer ya conoce de `content-actions.crearPublicacion`).
 * Sin imagen la ficha sale del texto pedido: nada inventado. PURO si vienen las puertas.
 */

export const EVENTO_BORRADOR_PUBLICACION = "starseed:publicar-draft";
export const RUTA_PUBLICAR = "/publicar";

export interface PuertasPublicacion {
  /** Emite un evento de navegador (CustomEvent con detail). */
  emitir?: (evento: string, dato: unknown) => void;
  /** Navega a la ruta dada. */
  abrir?: (ruta: string) => void;
}

/** Coerción amable a texto (nunca lanza). */
function texto(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Texto del borrador: lo hecho y sus condiciones, en un párrafo decible. PURO. */
export function textoBorradorDeImagen(im: {
  url?: string;
  titulo?: string;
  prompt?: string;
  modelo?: string | null;
  licencia?: string;
  atribucion?: string;
}): string {
  const partes: string[] = [];
  const prom = texto(im.prompt) || texto(im.titulo);
  partes.push(prom ? `${prom}` : "Imagen generada en StarSeed OS");
  if (texto(im.modelo)) partes.push(`Hecha con ${texto(im.modelo)}`);
  partes.push(`Licencia: ${texto(im.licencia) || "según el servicio que la generó"}`);
  if (texto(im.url)) partes.push(`Imagen: ${texto(im.url)}`);
  if (texto(im.atribucion)) partes.push(texto(im.atribucion));
  return partes.join("\n");
}

/** Ruta del Composer con su intent (el máximo cómodo que lee el título). PURO. */
export function rutaBorrador(textoBorrador: string): { ruta: string; intent: string } {
  const intent = textoBorrador.slice(0, 200).split("\n")[0].trim();
  const params = new URLSearchParams();
  params.set("intent", intent || "Borrador de imagen");
  return { ruta: `${RUTA_PUBLICAR}?${params.toString()}`, intent };
}

/** Crea y abre el borrador. Nunca lanza; las puertas por defecto tocan `window`. */
export function crearBorradorPublicacion(
  im: { url?: string; titulo?: string; prompt?: string; modelo?: string | null; licencia?: string; atribucion?: string },
  puertas?: PuertasPublicacion,
): { ok: boolean; mensaje: string; ruta?: string } {
  const emitir = puertas?.emitir ?? ((evento, dato) => {
    try {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(evento, { detail: dato }));
    } catch {
      /* sin navegador: la ruta sigue abriendo el composer */
    }
  });
  const abrir = puertas?.abrir ?? ((ruta) => {
    try {
      if (typeof window !== "undefined") window.location.assign(ruta);
    } catch {
      /* nada */
    }
  });
  if (typeof window === "undefined" && !puertas) {
    return { ok: false, mensaje: "El borrador de publicación se crea desde el navegador." };
  }
  const textoBorrador = textoBorradorDeImagen(im);
  const { ruta, intent } = rutaBorrador(textoBorrador);
  emitir(EVENTO_BORRADOR_PUBLICACION, { texto: textoBorrador });
  abrir(ruta);
  return { ok: true, mensaje: `Preparé el borrador «${intent.slice(0, 60)}»: revísalo y publícalo.`, ruta };
}
