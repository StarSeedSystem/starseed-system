/**
 * StarSeed OS — Puro · qué icono del escritorio se convierte con Filee
 * ----------------------------------------------------------------------------
 * De un `DesktopIcon` del escritorio al `ArchivoConvertible` que
 * `useConversionMenu` necesita (CNV1023C: «Convertir a…» en el clic derecho de
 * los iconos). Sin red, sin disco, sin React: entrada → salida.
 * Contrato: architecture/conversion-archivos.md.
 */

import type { ArchivoConvertible } from "@/components/conversion/use-conversion-menu";

/** Los campos de un icono del escritorio que importa este módulo. */
export interface IconoEscritorio {
    kind: string;
    name: string;
    url?: string;
    fileKind?: string;
    text?: string;
}

/** El archivo del icono convertible, o null si este icono no se convierte. */
export function archivoDeIcono(icon: IconoEscritorio): ArchivoConvertible | null {
    // Solo iconos que apuntan a un archivo real por URL: un icono de enlace
    // lleva una página web y una nota lleva su texto embebido sin URL.
    if (icon.kind !== "file" || !icon.url) return null;
    return { nombre: icon.name || "archivo", url: icon.url };
}
