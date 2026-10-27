/**
 * Imágenes → 3D · puente hacia el taller (IMG1011C; tarea suelto G3D1011E). Contrato: architecture/astraura-imagenes.md §6.
 *
 * El diálogo «Crear en 3D desde una imagen» EXISTE (src/components/avatares/generar-3d.tsx,
 * con use-generar-3d) pero todavía no está montado en ninguna pantalla. «Basta de ilusiones»:
 * si nadie lo atiende, no se finge que se abrió. Así funciona un click de «Usar como
 * referencia para 3D»:
 *   1) se emite `starseed:referencia-3d-imagen` (colón, el diálogo lo recogerá cuando se monte;
 *      si un día lo atiende, cancela por defecto y se sabe);
 *   2) la imagen queda guardada en la Biblioteca (kind «referencia-3d»), que sí existe, para
 *      que el taller la encuentre por `resolver-ref-biblioteca` cuando llegue;
 *   3) se devuelve UN aviso honesto de lo real: atención del diálogo o guarda hecho.
 * Sin red, sin Supabase: la Biblioteca es la persistencia local soberana (library-store). PURO.
 */
import { saveResource } from "@/lib/library-store";

/** Lo emite el botón de referencia 3D y lo escuchará el diálogo de G3D1011E (detail con la imagen). */
export const EVENTO_REFERENCIA_3D = "starseed:referencia-3d-imagen";

export interface Referencia3D {
  url: string;
  titulo: string;
}

/** Solo el evento, sin guarda: devuelve si ALGUIEN lo atendió (preventDefault) o no. PURO salvo evento. */
export function anunciarReferencia3D(r: Referencia3D): boolean {
  if (typeof window === "undefined" || !r.url) return false;
  try {
    return !window.dispatchEvent(new CustomEvent(EVENTO_REFERENCIA_3D, { detail: r, cancelable: true }));
  } catch {
    return false;
  }
}

/** Guarda en la Biblioteca (dedup por url+título) y emite el evento. Nunca lanza. */
export function guardarReferencia3D(r: Referencia3D): { dialogo: boolean; guardada: boolean; aviso: string } {
  let guardada = false;
  try {
    saveResource({ kind: "referencia-3d", title: r.titulo, url: r.url, origin: "imagenes" });
    guardada = true;
  } catch {
    /* sin localStorage (modo privado): la guarda no está, se dice en el aviso */
  }
  const dialogo = anunciarReferencia3D(r);
  const aviso = dialogo
    ? "Abrí el diálogo «Crear en 3D desde una imagen»."
    : guardada
      ? `El diálogo de «Crear en 3D desde una imagen» aún no está disponible aquí: la imagen quedó en tu Biblioteca como referencia 3D (${r.titulo}).`
      : "No pude guardar la referencia 3D ni abrir el diálogo (¿navegador en modo privado?): intenta guardarla a mano desde la Biblioteca.";
  return { dialogo, guardada, aviso };
}
