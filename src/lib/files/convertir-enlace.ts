// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — «Convertir a…» (Filee) desde la vista previa de archivos
// ----------------------------------------------------------------------------
// Decide si a un archivo de la vista previa le aplica convertir con Filee y
// construye el enlace a /convertir con el archivo ya puesto (`?url=&nombre=`).
// PURO: sin red, sin disco y sin navegar; la página /convertir hace el resto.
// Contrato: `architecture/conversion-archivos.md` §4.
// ════════════════════════════════════════════════════════════════════════════

import { enlaceConversor } from "@/lib/conversion/cliente";

/** Lo mínimo que la vista previa sabe de un archivo. */
export interface ArchivoPrevisualizado {
    url?: string | null;
    name?: string | null;
}

/** Formatos sin «Convertir a…»: un enlace no es un archivo y una app es un programa. */
const SIN_CONVERSION = new Set(["link", "app"]);

/** Enlace a /convertir con este archivo puesto, o null si no le aplica convertir. */
export function enlaceConvertirA(file: ArchivoPrevisualizado, fmt: string): string | null {
    if (SIN_CONVERSION.has(fmt)) return null;
    // Sin URL no hay nada que mandar al conversor (p. ej. markdown en línea).
    if (!file.url) return null;
    // El nombre solo si existe; /convertir lo saca de la URL cuando falta.
    return enlaceConversor({ url: file.url, nombre: file.name || undefined });
}
