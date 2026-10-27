/**
 * StarSeed OS — Puro · «Convertir a…» desde la vista previa de un archivo
 * ----------------------------------------------------------------------------
 * La vista previa no convierte: solo lleva a `/convertir` con el archivo y su
 * nombre ya puestos. Sin red, sin disco: entrada → salida.
 * Contrato: architecture/conversion-archivos.md.
 */

import { enlaceConversor } from "./cliente";

/** Lo mínimo que la vista previa sabe de un archivo. */
export interface ArchivoEnVista {
    url?: string | null;
    nombre?: string | null;
}

/**
 * Enlace al conversor con el archivo puesto, o `null` si la vista previa no
 * tiene una URL que llevar (un texto en línea se convierte desde su origen).
 */
export function enlaceConversionDeVista(archivo: ArchivoEnVista): string | null {
    const url = archivo.url?.trim();
    if (!url) return null;
    const nombre = archivo.nombre?.trim();
    return enlaceConversor({ url, nombre: nombre || undefined });
}
