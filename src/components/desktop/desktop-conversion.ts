// ════════════════════════════════════════════════════════════════
// StarSeed OS — Filee en el clic derecho de los iconos del escritorio
// ----------------------------------------------------------------
// Lógica PURA del paso de icono → archivo convertible. Describe qué
// iconos del escritorio tienen «Convertir a…» y cómo se piden sus
// datos a Filee. El resultado de convertir se DESCARGA en el
// navegador. Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════

import type { ArchivoConvertible } from "@/components/conversion/use-conversion-menu";
import { descargarBlob, type Convertido } from "@/lib/conversion/cliente";

/** Lo único que hace falta saber del icono para decidir (facilita las pruebas). */
export interface IconoResumen {
    kind: string;
    name: string;
    url?: string;
}

/** Archivo convertible el icono: solo los de kind «file» que apuntan a una URL. */
export function archivoConvertibleDeIcono(icono: IconoResumen): ArchivoConvertible | null {
    if (icono.kind !== "file") return null;
    if (!icono.url) return null;
    return { nombre: icono.name, url: icono.url };
}

/** Guardar = descargar el resultado en el navegador (aquí no hay carpeta de la Biblioteca). */
export async function guardarDescarga(c: Convertido): Promise<string | null> {
    descargarBlob(c.blob, c.nombre);
    return null;
}
