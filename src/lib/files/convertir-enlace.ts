// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — «Convertir a…» (Filee) desde la vista previa de archivos
// ----------------------------------------------------------------------------
// Decide si a un archivo de la vista previa le aplica conversión con Filee y
// construye el enlace a /convertir con el archivo ya puesto (`?url=&nombre=`).
// PURO: sin red, sin disco, sin navegación; la página /convertir hace el resto
// (`src/components/conversion/conversor.tsx`). Contrato:
// `architecture/conversion-archivos.md` §4 («Convertir a…» en la vista previa).
// ════════════════════════════════════════════════════════════════════════════

import { enlaceConversor } from "@/lib/conversion/cliente";

import type { FileFormat, FileLike } from "@/components/files/file-preview";

/** Formatos sin «Convertir a…»: un enlace no es un archivo y una app es un programa que se abre. */
const SIN_CONVERSION: readonly FileFormat[] = ["link", "app"];

/** Enlace a /convertir con este archivo puesto, o null si «Convertir a…» no le aplica. */
export function enlaceConvertirA(file: FileLike, fmt: FileFormat): string | null {
    if (SIN_CONVERSION.includes(fmt)) return null;
    const url = file.url;
    // Sin URL real no hay nada que convertir (p. ej. markdown/código en línea).
    if (!url) return null;
    // El nombre solo si lo tiene el archivo; /convertir lo saca de la URL si falta.
    return enlaceConversor({ url, nombre: file.name || undefined });
}
