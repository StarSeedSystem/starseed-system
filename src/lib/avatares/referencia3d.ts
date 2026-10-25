/**
 * Referencia 3D DESDE LA TARJETA DE IMÁGENES (IMG1011C → G3D1011E). Contrato: architecture/astraura-imagenes.md §6.
 *
 * «Usar como referencia para 3D» se apoya en lo que YA existe: el diálogo de G3D1011E
 * (`src/components/avatares/generar-3d.tsx`, destino `protomolecula`/`avatar`/…) lee sus imágenes
 * de la Biblioteca (`kind:"image"`). Así que aquí NO se dobla nada: se garantiza que la imagen
 * elegida está en la Biblioteca y se devuelven los datos para que la tarjeta monte ese diálogo.
 * Sin imagen generada, se dice honesto qué falta. La lógica de decisión es PURA y la escritura
 * (la Biblioteca) entra como dependencia.
 */
import { guardarImagenEnBiblioteca, type ImagenAGuardar } from "@/lib/library";

export interface Referencia3DLista {
  ok: boolean;
  /** Qué hacer sobre esto, en español y decible. */
  mensaje: string;
  /** URL lista para el diálogo de 3D (solo con `ok`). */
  url?: string;
  titulo?: string;
}

/** Coerción amable a texto (nunca lanza). */
function texto(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Prepara la referencia: asegura la imagen en la Biblioteca y devuelve lo que la tarjeta necesita
 * para abrir el diálogo de G3D1011E. `guardar` es la Biblioteca (por defecto, la propia de arriba).
 * Nunca lanza.
 */
export function prepararReferencia3D(
  im: ImagenAGuardar,
  guardar: (im: ImagenAGuardar) => { ok: boolean; mensaje: string } = guardarImagenEnBiblioteca,
): Referencia3DLista {
  if (!texto(im.url)) {
    return {
      ok: false,
      mensaje: "Esta opción aún no tiene imagen: elige o varía para generarla y luego úsala en 3D.",
    };
  }
  const guardado = guardar({ ...im, url: texto(im.url) });
  if (!guardado.ok) return { ok: false, mensaje: guardado.mensaje };
  return {
    ok: true,
    mensaje: `Guardé la imagen en tu Biblioteca (${guardado.mensaje.replace("Guardé ", "")}) — el diálogo «Crear en 3D» ya te la ofrece.`,
    url: texto(im.url),
    titulo: texto(im.titulo) || undefined,
  };
}
