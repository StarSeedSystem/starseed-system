/**
 * Descargar o guardar en la Biblioteca lo grabado.
 * ─────────────────────────────────────────────────────────────────────────────
 * La vía de la Biblioteca es la que ya usan la Cámara y la Galería: `saveMediaToLibrary`
 * (src/lib/library/media-library.ts) sube a `os-files` (Supabase Storage, 50 MB por archivo) y lo
 * referencia en «Imágenes y videos › Capturas». Se importa a demanda: ni el cliente de Supabase ni
 * la biblioteca entran en el bundle del panel hasta que alguien pulsa «Guardar».
 */

import { LIMITE_BIBLIOTECA_BYTES, type ResultadoGrabacion } from "./tipos";
import { formatearTamano } from "./texto";

export type ResultadoGuardado = { ok: true; carpeta: string } | { ok: false; mensaje: string };

export const CARPETA_BIBLIOTECA = "Imágenes y videos › Capturas";

export function cabeEnBiblioteca(bytes: number): boolean {
  return bytes <= LIMITE_BIBLIOTECA_BYTES;
}

/** Descarga el archivo con su nombre (enlace temporal con `download`). */
export function descargarResultado(r: ResultadoGrabacion, doc: Document = document): void {
  const a = doc.createElement("a");
  a.href = r.url;
  a.download = r.nombre;
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    doc.body.removeChild(a);
  }
}

export interface DepsGuardado {
  cargarBiblioteca?: () => Promise<{
    saveMediaToLibrary: (
      ref: { kind: "user"; id: string },
      input: { file: File | Blob; name: string; origin: "Capturas" },
    ) => Promise<{ ok: boolean; error?: string }>;
  }>;
  cargarRef?: () => Promise<{ kind: "user"; id: string } | null>;
}

export async function guardarEnBiblioteca(r: ResultadoGrabacion, deps: DepsGuardado = {}): Promise<ResultadoGuardado> {
  if (!cabeEnBiblioteca(r.bytes)) {
    return {
      ok: false,
      mensaje: `Pesa ${formatearTamano(r.bytes)} y la Biblioteca admite hasta ${formatearTamano(LIMITE_BIBLIOTECA_BYTES)} por archivo. Descárgala, o graba en calidad Ligera.`,
    };
  }
  try {
    const cargarRef = deps.cargarRef ?? (async () => (await import("@/lib/sync/entity-state")).currentUserRef() as Promise<{ kind: "user"; id: string } | null>);
    const ref = await cargarRef();
    if (!ref) return { ok: false, mensaje: "Inicia sesión para guardarla en tu Biblioteca. Mientras tanto puedes descargarla." };
    const cargar = deps.cargarBiblioteca ?? (async () => (await import("@/lib/library/media-library")) as unknown as Awaited<ReturnType<NonNullable<DepsGuardado["cargarBiblioteca"]>>>);
    const biblioteca = await cargar();
    const res = await biblioteca.saveMediaToLibrary(ref, { file: r.blob, name: r.nombre, origin: "Capturas" });
    if (!res.ok) return { ok: false, mensaje: res.error || "No se pudo guardar en la Biblioteca. Puedes descargarla." };
    return { ok: true, carpeta: CARPETA_BIBLIOTECA };
  } catch {
    return { ok: false, mensaje: "No se pudo guardar en la Biblioteca. Puedes descargarla." };
  }
}
